// scripts/benchmark.ts: dbtruth's measurements over public schemas, tabulated.
//
// For each database: the structural numbers come from the same extract, verify and
// verdict code the tool uses, driven by claims synthesized from the schema itself
// (every declared foreign key, every table, every categorical text column), so they
// need no model and cost nothing. Then, unless --no-model, one full run with the model
// for time, tokens, cost and what it found.
//
//   npx tsx scripts/benchmark.ts pagila=postgres://u:p@localhost:54330/pagila chinook=... [--no-model] [--append] [--out docs/benchmark.md]
//
// Reads ANTHROPIC_API_KEY from the environment or from .env in the repository root.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { effortFor, resolveConfig } from "../src/config.js";
import { extract } from "../src/extract.js";
import { connect, readDotEnv, typeFamily } from "../src/safety.js";
import { relationshipId, suspicionId, type Claims, type Extract, type Verified } from "../src/schemas.js";
import { verdicts } from "../src/verdict.js";
import { verify } from "../src/verify.js";

// Anthropic first-party prices per million tokens, for the cost column only. Not part of the tool.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const BENCHMARK_BUDGET_SECONDS = "900"; // measuring every declared key on a big schema takes longer than a normal run

type Structural = {
  relations: { tables: number; views: number; materializedViews: number; partitioned: number };
  columns: number;
  schemaTokens: number;
  declaredForeignKeys: number;
  declaredForeignKeysMeasured: number;
  declaredForeignKeysBelow100: { key: string; hit: number }[];
  tablesWithoutPrimaryKey: string[];
  valueCollisions: { column: string; distinct: number; canonical: number }[];
  emptyTables: string[];
  staleTables: { table: string; ageDays: number }[];
  databaseSeconds: number;
};

type ModelRun = {
  exit: number;
  seconds: number;
  effort: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  brokenRelationships: { key: string; hit: number }[];
  confirmedSuspicions: string[];
  unverifiable: number;
  files: number;
  error?: string;
};

type Result = { schema: string; structural: Structural; model?: ModelRun };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...readDotEnv(repoRoot), ...process.env };

async function structural(url: string): Promise<{ result: Structural; extracted: Extract }> {
  const cfg = resolveConfig(env, { budgetSeconds: BENCHMARK_BUDGET_SECONDS });
  const db = await connect(url, cfg);
  try {
    const extracted = await extract(db, cfg, { samples: true, reveal: new Set() });
    const claims: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [] };
    const seen = new Set<string>();
    for (const t of extracted.tables) {
      for (const fk of t.foreignKeys) {
        const r = { from: { table: t.name, column: fk.column }, to: { table: fk.refTable, column: fk.refColumn }, basis: "stated" as const, confidence: 1, reason: "declared" };
        if (!seen.has(relationshipId(r))) {
          seen.add(relationshipId(r));
          claims.relationships.push(r);
        }
      }
      if (t.kind !== "view") claims.suspicions.push({ kind: "dead_table", tables: [t.name], detail: "every table" });
      for (const c of t.columns) {
        if (c.values !== undefined && typeFamily(c.type) === "text") {
          claims.suspicions.push({ kind: "inconsistent_values", tables: [t.name], column: c.name, detail: "every categorical text column" });
        }
      }
    }
    const measurements = await verify(db, cfg, extracted, claims);
    const decided = verdicts(measurements, cfg);
    const byId = new Map(measurements.map((m) => [m.claimId, m]));

    const fkIds = claims.relationships.map(relationshipId);
    const fkMeasured = fkIds.filter((id) => byId.get(id)?.skipped === undefined);
    const fkBelow = fkIds
      .map((id) => ({ key: id.slice("relationship:".length), hit: byId.get(id)?.numbers.hit }))
      .filter((x): x is { key: string; hit: number } => x.hit !== undefined && x.hit < 1);

    const collisions = claims.suspicions
      .filter((s) => s.kind === "inconsistent_values")
      .map((s) => ({ id: suspicionId(s), column: `${s.tables[0]}.${s.column}` }))
      .filter((x) => decided[x.id]?.status === "confirmed")
      .map((x) => ({ column: x.column, distinct: byId.get(x.id)!.numbers.distinctValues!, canonical: byId.get(x.id)!.numbers.canonicalForms! }));

    const dead = claims.suspicions.filter((s) => s.kind === "dead_table").map((s) => ({ table: s.tables[0]!, n: byId.get(suspicionId(s))?.numbers ?? {} }));
    const empty = dead.filter((d) => d.n.count === 0).map((d) => d.table);
    const stale = dead.filter((d) => (d.n.count ?? 0) > 0 && d.n.ageDays !== undefined && d.n.ageDays > cfg.staleAfterDays).map((d) => ({ table: d.table, ageDays: Math.round(d.n.ageDays!) }));

    const kinds = { tables: 0, views: 0, materializedViews: 0, partitioned: 0 };
    for (const t of extracted.tables) {
      if (t.kind === "table") kinds.tables += 1;
      else if (t.kind === "view") kinds.views += 1;
      else kinds.materializedViews += 1;
      if (t.partitions) kinds.partitioned += 1;
    }

    return {
      extracted,
      result: {
        relations: kinds,
        columns: extracted.tables.reduce((a, t) => a + t.columns.length, 0),
        schemaTokens: extracted.schemaTokens,
        declaredForeignKeys: fkIds.length,
        declaredForeignKeysMeasured: fkMeasured.length,
        declaredForeignKeysBelow100: fkBelow,
        tablesWithoutPrimaryKey: extracted.tables.filter((t) => t.kind === "table" && !t.primaryKey).map((t) => t.name),
        valueCollisions: collisions,
        emptyTables: empty,
        staleTables: stale,
        databaseSeconds: db.budget().spentMs / 1000,
      },
    };
  } finally {
    await db.close();
  }
}

async function modelRun(url: string, schemaTokens: number): Promise<ModelRun> {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-bench-"));
  const out: string[] = [];
  const err: string[] = [];
  const cfg = resolveConfig(env);
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const started = Date.now();
  let exit: number;
  let error: string | undefined;
  try {
    exit = await run({ url, samples: true, reveal: [], json: true, flags: {}, cwd, env, out: (l) => out.push(l), err: (l) => err.push(l) });
  } catch (e) {
    exit = 1;
    error = e instanceof Error ? e.message : String(e);
  }
  const seconds = (Date.now() - started) / 1000;
  const tokens = /tokens: (\d+) in, (\d+) out/.exec(err.join("\n"));
  const inputTokens = tokens ? Number(tokens[1]) : 0;
  const outputTokens = tokens ? Number(tokens[2]) : 0;
  const price = PRICE_PER_MILLION[model] ?? { input: 0, output: 0 };
  const base: ModelRun = {
    exit,
    seconds,
    effort: effortFor(schemaTokens, cfg),
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
    brokenRelationships: [],
    confirmedSuspicions: [],
    unverifiable: 0,
    files: 0,
    ...(error ? { error } : {}),
  };
  if (!out.length) return base;
  let verified: Verified;
  try {
    verified = JSON.parse(out.join("\n")) as Verified;
  } catch {
    return base;
  }
  for (const [id, v] of Object.entries(verified.verdicts)) {
    if (id.startsWith("relationship:") && v.status === "broken") base.brokenRelationships.push({ key: id.slice("relationship:".length), hit: v.measurement.numbers.hit! });
    if (id.startsWith("suspicion:") && v.status === "confirmed") base.confirmedSuspicions.push(id.slice("suspicion:".length));
    if (v.status === "unverifiable") base.unverifiable += 1;
  }
  const files = /files written: (\d+)/.exec(err.join("\n"));
  base.files = files ? Number(files[1]) : 0;
  return base;
}

function markdown(results: Result[], withModel: boolean): string {
  const lines: string[] = [];
  lines.push(`# dbtruth benchmark, ${new Date().toISOString().slice(0, 10)}`, "");
  lines.push("Structural numbers come from the tool's own measurements driven by the schema (every declared foreign key,");
  lines.push("every table, every categorical text column), with no model involved. Stale means the newest timestamp is");
  lines.push(`older than the configured ${resolveConfig(env).staleAfterDays} days, which every frozen sample dataset is.`, "");
  lines.push("| schema | relations | columns | declared FKs | FKs below 100% | tables without PK | value collisions | empty tables | stale tables | db time |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of results) {
    const s = r.structural;
    const rel = `${s.relations.tables} t${s.relations.views ? `, ${s.relations.views} v` : ""}${s.relations.materializedViews ? `, ${s.relations.materializedViews} mv` : ""}${s.relations.partitioned ? `, ${s.relations.partitioned} part.` : ""}`;
    lines.push(
      `| ${r.schema} | ${rel} | ${s.columns} | ${s.declaredForeignKeys} (${s.declaredForeignKeysMeasured} measured) | ${s.declaredForeignKeysBelow100.length} | ${s.tablesWithoutPrimaryKey.length} | ${s.valueCollisions.length} | ${s.emptyTables.length} | ${s.staleTables.length} | ${s.databaseSeconds.toFixed(1)}s |`,
    );
  }
  if (withModel) {
    lines.push("", "One full run each with the model, at the effort the schema size selects.", "");
    lines.push("| schema | effort | time | tokens in / out | cost | exit | broken joins (model) | confirmed suspicions (model) | unverifiable | files |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of results) {
      const m = r.model;
      if (!m) continue;
      lines.push(
        `| ${r.schema} | ${m.effort} | ${m.seconds.toFixed(0)}s | ${m.inputTokens} / ${m.outputTokens} | $${m.costUsd.toFixed(2)} | ${m.exit}${m.error ? " (error)" : ""} | ${m.brokenRelationships.length} | ${m.confirmedSuspicions.length} | ${m.unverifiable} | ${m.files} |`,
      );
    }
  }
  lines.push("", "## Details", "");
  for (const r of results) {
    const s = r.structural;
    lines.push(`### ${r.schema}`, "");
    if (s.declaredForeignKeysBelow100.length) lines.push(`- Declared FKs below 100%: ${s.declaredForeignKeysBelow100.map((x) => `${x.key} (${(x.hit * 100).toFixed(1)}%)`).join("; ")}`);
    if (s.tablesWithoutPrimaryKey.length) lines.push(`- Tables without a primary key: ${s.tablesWithoutPrimaryKey.join(", ")}`);
    if (s.valueCollisions.length) lines.push(`- Value collisions: ${s.valueCollisions.map((x) => `${x.column} (${x.distinct} values, ${x.canonical} canonical)`).join("; ")}`);
    if (s.emptyTables.length) lines.push(`- Empty tables: ${s.emptyTables.length}${s.emptyTables.length <= 12 ? ` (${s.emptyTables.join(", ")})` : ""}`);
    if (s.staleTables.length) lines.push(`- Stale tables: ${s.staleTables.length}, oldest newest-timestamp ${Math.max(...s.staleTables.map((x) => x.ageDays))} days`);
    if (r.model) {
      if (r.model.error) lines.push(`- Model run failed: ${r.model.error}`);
      if (r.model.brokenRelationships.length) lines.push(`- Broken joins the model proposed: ${r.model.brokenRelationships.map((x) => `${x.key} (${(x.hit * 100).toFixed(1)}%)`).join("; ")}`);
      if (r.model.confirmedSuspicions.length) lines.push(`- Confirmed suspicions: ${r.model.confirmedSuspicions.join("; ")}`);
    }
    if (lines[lines.length - 1] === "") lines.push("- Nothing to report.");
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const withModel = !args.includes("--no-model");
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1]! : join(repoRoot, "docs", "benchmark.md");
  const targets = args.filter((a) => a.includes("=") && !a.startsWith("--")).map((a) => ({ schema: a.slice(0, a.indexOf("=")), url: a.slice(a.indexOf("=") + 1) }));
  if (targets.length === 0) {
    console.error("usage: npx tsx scripts/benchmark.ts name=postgres://... [name=url ...] [--no-model] [--out file.md]");
    process.exit(1);
  }

  // --append keeps earlier results for schemas not named this time, so a benchmark can be built in batches.
  const jsonPath = outPath.replace(/\.md$/, ".json");
  const results: Result[] = [];
  if (args.includes("--append") && existsSync(jsonPath)) {
    const named = new Set(targets.map((t) => t.schema));
    for (const prev of JSON.parse(readFileSync(jsonPath, "utf8")) as Result[]) if (!named.has(prev.schema)) results.push(prev);
  }
  for (const t of targets) {
    process.stderr.write(`${t.schema}: measuring structure ... `);
    try {
      const { result, extracted } = await structural(t.url);
      process.stderr.write(`${result.relations.tables + result.relations.views + result.relations.materializedViews} relations, ${result.declaredForeignKeys} declared FKs, ${result.databaseSeconds.toFixed(1)}s\n`);
      const entry: Result = { schema: t.schema, structural: result };
      if (withModel) {
        process.stderr.write(`${t.schema}: model run ... `);
        entry.model = await modelRun(t.url, extracted.schemaTokens);
        process.stderr.write(`exit ${entry.model.exit}, ${entry.model.seconds.toFixed(0)}s, $${entry.model.costUsd.toFixed(2)}${entry.model.error ? `, error: ${entry.model.error}` : ""}\n`);
      }
      results.push(entry);
    } catch (e) {
      process.stderr.write(`failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  const md = markdown(results, results.some((r) => r.model));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  process.stdout.write(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
