// verdict.ts: Measurements + config -> Verdicts. Pure. No database, no model.
//
// Every threshold used here comes from config. Changing what counts as broken,
// dead, duplicate or inconsistent is a config change, never a code change.

import type { Config } from "./config.js";
import type { Claims, Extract, Measurement, Verdict, Verified } from "./schemas.js";

export function decide(m: Measurement, cfg: Config): Verdict {
  const measurement = { query: m.query, numbers: m.numbers };
  const n = m.numbers;
  const verdict = (status: Verdict["status"], skipped?: string): Verdict => ({ status, measurement, ...(skipped ? { skipped } : {}) });

  if (m.skipped !== undefined) return verdict(m.empty ? "empty" : "unverifiable", m.skipped);

  switch (m.kind) {
    case "relationship": {
      const hit = n.hit;
      if (hit === undefined) return verdict("unverifiable");
      if (hit >= cfg.join.confirmed) return verdict("confirmed");
      if (hit >= cfg.join.broken) return verdict("broken");
      return verdict("rejected");
    }
    case "dead_table": {
      // Either number alone can prove death; with neither there is nothing to decide on.
      if (n.count === undefined && n.ageDays === undefined) return verdict("unverifiable");
      const dead = n.count === 0 || (n.ageDays !== undefined && n.ageDays > cfg.staleAfterDays);
      return verdict(dead ? "confirmed" : "rejected");
    }
    case "inconsistent_values":
      if (n.collisions === undefined) return verdict("unverifiable");
      return verdict(n.collisions > 0 ? "confirmed" : "rejected");
    case "duplicate_entity":
      if (n.overlap === undefined) return verdict("unverifiable");
      return verdict(n.overlap >= cfg.duplicateOverlap ? "confirmed" : "rejected");
    case "missing_key":
      if (n.hasPrimaryKey === undefined) return verdict("unverifiable");
      return verdict(n.hasPrimaryKey === 0 ? "confirmed" : "rejected");
    default:
      return verdict("unverifiable");
  }
}

export function verdicts(measurements: Measurement[], cfg: Config): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const m of measurements) out[m.claimId] = decide(m, cfg);
  return out;
}

export function fitsInContext(extract: Extract, cfg: Config): boolean {
  return extract.skipped.length === 0 && extract.schemaTokens <= cfg.fitsInContextTokens;
}

/** "9 tables, 1 view" from a list of relations, naming only the kinds present. */
export function describeKinds(relations: { kind: string; partitions?: { count: number } }[]): string {
  const order = ["table", "view", "materialized view"];
  const counts = new Map<string, number>();
  for (const r of relations) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const parts = [...counts].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([kind, n]) => `${n} ${kind}${n === 1 ? "" : "s"}`);
  const partitioned = relations.filter((r) => r.partitions).length;
  if (partitioned > 0) parts.push(`${partitioned} partitioned`);
  return parts.length > 0 ? parts.join(", ") : "no relations";
}

/** Claims + verdicts + the per-table facts the writer needs, version-stamped. */
export function assemble(extract: Extract, claims: Claims, measurements: Measurement[], cfg: Config): Verified {
  return {
    version: 1,
    database: extract.database,
    relations: describeKinds(extract.tables) + (extract.skipped.length > 0 ? `, ${extract.skipped.length} not examined` : ""),
    claims,
    verdicts: verdicts(measurements, cfg),
    fitsInContext: fitsInContext(extract, cfg),
    tables: extract.tables.map((t) => ({
      name: t.name,
      kind: t.kind,
      ...(t.partitions ? { partitions: t.partitions } : {}),
      rowEstimate: t.rowEstimate,
      primaryKey: t.primaryKey,
      categorical: Object.fromEntries(t.columns.filter((c) => c.values !== undefined).map((c) => [c.name, c.values!])),
    })),
  };
}

// Exit codes. 2: something an agent must know before writing SQL. 1: could not run. 0: nothing found.
export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_FINDINGS = 2;

export function exitCode(verified: Verified): number {
  const findings = Object.entries(verified.verdicts).some(
    ([id, v]) => (id.startsWith("relationship:") && v.status === "broken") || (id.startsWith("suspicion:") && v.status === "confirmed"),
  );
  return findings ? EXIT_FINDINGS : EXIT_OK;
}
