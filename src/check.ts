// check.ts: a snapshot and the database now -> CheckReport. What context/ claims, measured again without a model.
//
// The snapshot comes from a pull request, so nothing in it is run: every statement is built again by extract and
// verify from the catalog read now, as a full run builds it, and a name a claim holds is only a key to look up there.
// The queries the snapshot stores are never run and never printed. Claims are measured with the settings the snapshot
// was measured with, so that a default changed since cannot pass for a change in the data; the budget, the timeout and
// the tolerance are this run's. Only the relations the claims name are profiled; the whole catalog is read, for the
// relations added or dropped since, and for the integer keys a join confirmed on inference is weighed against.

import type { Config } from "./config.js";
import { extract, integerKeys, readCatalog } from "./extract.js";
import type { Db } from "./safety.js";
import { CHECK_CLASSES, findTable, relationshipId, SnapshotSchema, suspicionId, type CheckClass, type CheckReport, type Claims, type ClaimCheck, type Snapshot, type Verdict } from "./schemas.js";
import { schemaOf, settingsOf } from "./snapshot.js";
import { verdicts } from "./verdict.js";
import { verify } from "./verify.js";

/** When check exits 2: on a regression or a stale item, on any change, or never. */
export const FAIL_ON = ["regression", "change", "never"] as const;
export type FailOn = (typeof FAIL_ON)[number];

const FAILING: Record<FailOn, CheckClass[]> = {
  regression: ["regression", "stale"],
  change: ["regression", "stale", "drift", "improved", "changed"],
  never: [],
};

// Moves between two measured statuses that are a regression or an improvement; any other is a change. A suspicion is
// a problem, so for it confirmed is the worse side.
const REGRESSIONS = { relationship: ["confirmed->broken", "confirmed->rejected", "broken->rejected"], suspicion: ["rejected->confirmed"] };
const IMPROVEMENTS = { relationship: ["broken->confirmed"], suspicion: ["confirmed->rejected"] };

/** A claim's table, with the column it names there when it names one. */
type Name = [table: string, column?: string];

/** The snapshot's claims measured again on db, as the snapshot measured them, and compared with it. */
export async function remeasure(db: Db, cfg: Config, snapshot: Snapshot): Promise<CheckReport> {
  const measuring: Config = { ...cfg, ...snapshot.measuredWith };
  const catalog = await readCatalog(db);
  const named = new Set(claimNames(snapshot.claims).flatMap((c) => c.names.map(([table]) => findTable(catalog, table))));
  const extracted = await extract(db, measuring, catalog.filter((r) => named.has(r)), { samples: false, reveal: new Set() });
  // A condition is measured only on a column that looks categorical, which these settings decide, and a pull request can
  // edit them: bounds wider than this run's, or a smaller sample, on whose few rows most columns repeat a value, would let
  // a condition count a guess at a hidden value (R3). With such settings no column counts as categorical.
  const wider = measuring.sampleRows < cfg.sampleRows || measuring.categoricalMaxDistinct > cfg.categoricalMaxDistinct || measuring.categoricalMaxValueLength > cfg.categoricalMaxValueLength;
  const tables = wider ? extracted.tables.map((t) => ({ ...t, columns: t.columns.map((c) => ({ ...c, visible: false })) })) : extracted.tables;
  const measured = verdicts(await verify(db, measuring, { ...extracted, tables }, snapshot.claims, () => integerKeys(db, measuring, catalog)), measuring);
  return diff(snapshot, { database: db.database, schema: schemaOf(catalog), verdicts: measured }, cfg);
}

/** The snapshot against what was measured now: a class for each of its claims, the relations added or dropped, and what to note. */
export function diff(before: Snapshot, now: Pick<Snapshot, "database" | "schema" | "verdicts">, cfg: Config): CheckReport {
  const claims = claimNames(before.claims).map(({ id, kind, names }): ClaimCheck => {
    // A claim the snapshot holds no verdict for was not measured then; verify measures every claim now.
    const was = before.verdicts[id];
    const status = was?.status ?? "unverifiable";
    const hitBefore = was?.measurement.numbers.hit;
    const after = now.verdicts[id]!;
    // A claim the snapshot could not measure on a name its schema lacked, such as a table the model invented, had
    // nothing to lose since; any other claim is stale once the database lacks a name it uses.
    const invented = status === "unverifiable" && missingName(before.schema.relations, names) !== undefined;
    const missing = invented ? undefined : missingName(now.schema.relations, names);
    const cls = classify(kind, status, hitBefore, after, missing, cfg.checkHitRateTolerance);
    return { id, class: cls, before: status, ...(hitBefore === undefined ? {} : { hitBefore }), after, ...(cls === "stale" ? { missing } : {}) };
  });
  // By exact name, in code-unit order; a relation the full run listed without examining it is in the context all the same.
  const listed = new Set(before.schema.relations.map((r) => r.name));
  const present = new Set(now.schema.relations.map((r) => r.name));
  const relations = [...new Set([...listed, ...present])]
    .sort()
    .filter((name) => listed.has(name) !== present.has(name))
    .map((name) => ({ name, in: present.has(name) ? ("database" as const) : ("context" as const) }));
  // This run's settings, not the defaults: a run given the snapshot's own has nothing to note.
  const current = new Map(Object.entries(settingsOf(SnapshotSchema.shape.measuredWith.parse(cfg))));
  const settings = Object.entries(settingsOf(before.measuredWith)).filter(([name, value]) => current.get(name) !== value).map(([name, value]) => ({ name, snapshot: value, now: current.get(name)! }));
  return {
    database: { snapshot: before.database, now: now.database },
    schemaChanged: before.schema.fingerprint !== now.schema.fingerprint,
    settings,
    claims,
    relations,
  };
}

/** Whether the build fails under failOn: a relation added or dropped counts as a stale item. */
export function fails(report: CheckReport, failOn: FailOn): boolean {
  return items(report).some((cls) => FAILING[failOn].includes(cls));
}

/** The notes, a line for each item that is not unchanged, most serious first, the count of each class, and the fix when there is one. */
export function reportLines(report: CheckReport): string[] {
  const { database, settings, claims, relations } = report;
  const lines: string[] = [];
  if (database.snapshot !== database.now) lines.push(`note the snapshot is of database ${database.snapshot}; this is ${database.now}`);
  if (settings.length > 0) lines.push(`note measured with the snapshot's settings, which differ from this run's: ${settings.map((s) => `${s.name} ${s.snapshot} (this run ${s.now})`).join(", ")}`);
  if (report.schemaChanged) lines.push("note the schema changed since the snapshot");
  for (const cls of CHECK_CLASSES.filter((c) => c !== "unchanged")) {
    for (const { id, before, hitBefore, after, missing } of claims.filter((c) => c.class === cls)) {
      lines.push(missing ? `stale ${id}: ${missing} is not in the database` : `${cls} ${id}: ${side(before, hitBefore)} -> ${side(after.status, after.measurement.numbers.hit, after.skipped)}`);
    }
    if (cls === "stale") for (const r of relations) lines.push(r.in === "database" ? `stale ${r.name}: in the database, not in the context` : `stale ${r.name}: in the context, not in the database`);
  }
  const found = items(report);
  const counts = CHECK_CLASSES.flatMap((cls) => {
    const n = found.filter((c) => c === cls).length;
    return n > 0 ? [`${n} ${cls}`] : [];
  });
  lines.push(`check ${database.now}: ${counts.length > 0 ? counts.join(", ") : "no claims"}`);
  if (fails(report, "change")) lines.push("run npx dbtruth and commit context/");
  return lines;
}

/**
 * The class of one claim, by the first rule that applies. A name the database lost makes it stale. The same status is
 * unchanged, or drift once the hit rate moved by the tolerance. Then a regression or an improvement, by the moves
 * above. A side that could not be measured says nothing about the data, so the claim is not measured and fails no
 * build; any other move is a change.
 */
function classify(kind: keyof typeof REGRESSIONS, before: Verdict["status"], hitBefore: number | undefined, after: Verdict, missing: string | undefined, tolerance: number): CheckClass {
  if (missing !== undefined) return "stale";
  if (before === after.status) {
    const hit = after.measurement.numbers.hit;
    const moved = hit === undefined || hitBefore === undefined ? 0 : Math.abs(hit - hitBefore);
    // Each rate is rounded to a double, so a move of exactly the tolerance can come out a hair short: 0.82 - 0.81 < 0.01.
    return moved > 0 && moved + Number.EPSILON >= tolerance ? "drift" : "unchanged";
  }
  const move = `${before}->${after.status}`;
  if (REGRESSIONS[kind].includes(move)) return "regression";
  if (IMPROVEMENTS[kind].includes(move)) return "improved";
  return before === "unverifiable" || after.status === "unverifiable" ? "not measured" : "changed";
}

/**
 * Each claim's id and kind, and the names it uses: a relationship its two columns and the column its condition names,
 * a suspicion its tables, the first with its column.
 */
function claimNames(claims: Claims): { id: string; kind: keyof typeof REGRESSIONS; names: Name[] }[] {
  return [
    ...claims.relationships.map((r) => ({
      id: relationshipId(r),
      kind: "relationship" as const,
      names: [[r.from.table, r.from.column], [r.to.table, r.to.column], ...(r.when ? [[r.from.table, r.when.column] satisfies Name] : [])] satisfies Name[],
    })),
    ...claims.suspicions.map((s) => ({ id: suspicionId(s), kind: "suspicion" as const, names: s.tables.map((table, i): Name => (i === 0 && s.column !== undefined ? [table, s.column] : [table])) })),
  ];
}

/** The first of names the database does not have, as "table" or "table.column". */
function missingName(relations: Snapshot["schema"]["relations"], names: Name[]): string | undefined {
  for (const [table, column] of names) {
    const found = findTable(relations, table);
    if (!found) return table;
    if (column !== undefined && !found.columns.some(([name]) => name === column)) return `${table}.${column}`;
  }
  return undefined;
}

/** Every item's class: each claim's, and stale for each relation added or dropped. */
function items(report: CheckReport): CheckClass[] {
  return [...report.claims.map((c) => c.class), ...report.relations.map((): CheckClass => "stale")];
}

/** "broken 88.0%", or "unverifiable (time budget exhausted)": the status, with the hit rate and why it was not measured when there are. */
function side(status: Verdict["status"], hit: number | undefined, skipped?: string): string {
  return `${status}${hit === undefined ? "" : ` ${(hit * 100).toFixed(1)}%`}${skipped ? ` (${skipped})` : ""}`;
}
