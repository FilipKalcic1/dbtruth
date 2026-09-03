// verify.ts: Claims -> Measurements. One bounded query per claim, numbers only.
//
// This module knows nothing about thresholds. It runs the query, returns the
// numbers and the query text, and marks a measurement `skipped` when it could
// not be taken (timeout, budget, unknown table, no way to measure). Claims are
// measured strongest first, so when the budget runs out it is the weakest that
// go unverified.

import type { Config } from "./config.js";
import { bareName, DATATYPE_MISMATCH_STATES, q, qualified, querySampled, typeFamily, type Db, type QueryResult } from "./safety.js";
import { relationshipId, suspicionId, type Claims, type Extract, type Measurement, type Relationship, type Suspicion, type Table } from "./schemas.js";

const SECONDS_PER_DAY = 86_400;

export async function verify(db: Db, cfg: Config, extract: Extract, claims: Claims): Promise<Measurement[]> {
  const out: Measurement[] = [];
  const byConfidence = [...claims.relationships].sort((a, b) => b.confidence - a.confidence);
  for (const r of byConfidence) out.push(await measureRelationship(db, cfg, extract, relationshipId(r), r));
  for (const s of claims.suspicions) out.push(await measureSuspicion(db, cfg, extract, suspicionId(s), s));
  return out;
}

// ---------- relationship: hit rate of from.column in to.column on a sample ----------

async function measureRelationship(db: Db, cfg: Config, extract: Extract, claimId: string, r: Relationship): Promise<Measurement> {
  const kind = "relationship";
  const from = findTable(extract, r.from.table);
  const to = findTable(extract, r.to.table);
  if (!from) return skip(claimId, kind, `unknown table ${r.from.table}`);
  if (!to) return skip(claimId, kind, `unknown table ${r.to.table}`);
  if (unpopulated(from) || unpopulated(to)) return skip(claimId, kind, NEVER_REFRESHED);
  if (!hasColumn(from, r.from.column)) return skip(claimId, kind, `unknown column ${r.from.table}.${r.from.column}`);
  if (!hasColumn(to, r.to.column)) return skip(claimId, kind, `unknown column ${r.to.table}.${r.to.column}`);

  // A probe per row is right when the target column is a key (indexed); otherwise one pass over the target, hashed.
  const keyed = to.primaryKey?.includes(r.to.column) ?? false;
  const col = q(r.from.column);
  const target = `${qualified(to)} t`;
  const sql = (source: string, cast: string) =>
    `WITH s AS (SELECT ${col}${cast} AS v FROM ${source} f WHERE ${col} IS NOT NULL)
SELECT count(*) AS total,
       count(*) FILTER (WHERE ${keyed ? `EXISTS (SELECT 1 FROM ${target} WHERE t.${q(r.to.column)}${cast} = s.v)` : `s.v IN (SELECT t.${q(r.to.column)}${cast} FROM ${target})`}) AS hits
  FROM s`;
  const { query, result } = await runWithTextFallback(db, cfg, from, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = Number(result.rows[0]?.total);
  const hits = Number(result.rows[0]?.hits);
  if (total === 0) return skip(claimId, kind, "no non-null rows to test", query, { total });
  return { claimId, kind, query, numbers: { total, hits, orphans: total - hits, hit: hits / total } };
}

// ---------- suspicions ----------

async function measureSuspicion(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  switch (s.kind) {
    case "dead_table":
      return measureDeadTable(db, cfg, extract, claimId, s);
    case "inconsistent_values":
      return measureInconsistentValues(db, cfg, extract, claimId, s);
    case "duplicate_entity":
      return measureDuplicateEntity(db, cfg, extract, claimId, s);
    case "missing_key":
      return measureMissingKey(extract, claimId, s);
    default:
      return skip(claimId, s.kind, "no measurement exists for this kind of suspicion");
  }
}

/**
 * The statement that measures a dead-table suspicion, or undefined when the schema alone answers.
 * Always an aggregate, so it returns exactly one row whatever the table's size.
 */
export function deadTableQuery(table: Table, cfg: Pick<Config, "sampleRows">): { query: string; exact: boolean; fromSchema?: Record<string, number> } {
  const timeColumns = table.columns.filter((c) => typeFamily(c.type) === "time");
  const exact = table.rowEstimate >= 0 && table.rowEstimate <= cfg.sampleRows;
  const age = timeColumns.length > 0 ? `EXTRACT(EPOCH FROM (now() - greatest(${timeColumns.map((c) => `max(${q(c.name)})`).join(", ")}))) / ${SECONDS_PER_DAY}.0` : null;
  if (!exact && age === null) {
    const numbers: Record<string, number> = table.rowEstimate >= 0 ? { count: table.rowEstimate, exact: 0 } : { exact: 0 };
    return { query: `-- from the schema: pg_class.reltuples for ${table.name}; no date or timestamp column to date it by`, exact, fromSchema: numbers };
  }
  const count = exact ? "count(*)::float8" : table.rowEstimate >= 0 ? `${Math.round(table.rowEstimate)}::float8` : "NULL::float8";
  return { query: `SELECT ${count} AS count, ${age ?? "NULL::float8"} AS age_days FROM ${qualified(table)}`, exact };
}

/** count (exact when the table is small) and the age in days of the newest timestamp. */
async function measureDeadTable(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (unpopulated(table)) {
    return {
      claimId,
      kind,
      query: `-- from the schema: pg_class.relispopulated is false for ${table.name}, the materialized view has never been refreshed`,
      numbers: { count: 0, exact: 1, populated: 0 },
    };
  }
  const { query, exact, fromSchema } = deadTableQuery(table, cfg);
  if (fromSchema) return { claimId, kind, query, numbers: fromSchema };
  const result = await db.query(query);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const row = result.rows[0];
  if (!row) return skip(claimId, kind, "the measurement returned no row", query);
  const numbers: Record<string, number> = { exact: exact ? 1 : 0 };
  if (row.count !== null && row.count !== undefined) numbers.count = Number(row.count);
  if (row.age_days !== null && row.age_days !== undefined) numbers.ageDays = Number(row.age_days);
  return { claimId, kind, query, numbers };
}

/** distinct values vs distinct canonical forms; canonical = lower(btrim(value)). */
async function measureInconsistentValues(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (unpopulated(table)) return skip(claimId, kind, NEVER_REFRESHED);
  if (!s.column) return skip(claimId, kind, "no column named");
  if (!hasColumn(table, s.column)) return skip(claimId, kind, `unknown column ${table.name}.${s.column}`);

  const col = `${q(s.column)}::text`;
  const { result, source } = await querySampled(db, table, cfg, (src) => `SELECT count(DISTINCT ${col}) AS distinct_values, count(DISTINCT lower(btrim(${col}))) AS canonical_forms FROM ${src} s`);
  const query = `SELECT count(DISTINCT ${col}) AS distinct_values, count(DISTINCT lower(btrim(${col}))) AS canonical_forms FROM ${source} s`;
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const distinctValues = Number(result.rows[0]?.distinct_values);
  const canonicalForms = Number(result.rows[0]?.canonical_forms);
  const numbers = { distinctValues, canonicalForms, collisions: distinctValues - canonicalForms };
  if (distinctValues > cfg.categoricalMaxDistinct) return skip(claimId, kind, `not categorical: ${distinctValues} distinct values`, query, numbers);
  return { claimId, kind, query, numbers };
}

/** share of A's sample rows whose tuple on the shared columns exists in B. */
async function measureDuplicateEntity(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const a = findTable(extract, s.tables[0]);
  const b = findTable(extract, s.tables[1]);
  if (!a || !b) return skip(claimId, kind, `needs two known tables, got ${s.tables.join(", ")}`);
  if (unpopulated(a) || unpopulated(b)) return skip(claimId, kind, NEVER_REFRESHED);

  const shared = a.columns.map((c) => c.name).filter((name) => hasColumn(b, name));
  if (shared.length === 0) return skip(claimId, kind, "no shared column names");

  const sql = (source: string, cast: string) =>
    `WITH a AS (SELECT ${shared.map(q).join(", ")} FROM ${source} a)
SELECT count(*) AS total,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${qualified(b)} b WHERE ${shared.map((c) => `b.${q(c)}${cast} IS NOT DISTINCT FROM a.${q(c)}${cast}`).join(" AND ")})) AS matched
  FROM a`;
  const { query, result } = await runWithTextFallback(db, cfg, a, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = Number(result.rows[0]?.total);
  const matched = Number(result.rows[0]?.matched);
  const numbers = { total, matched, sharedColumns: shared.length };
  if (total === 0) return skip(claimId, kind, `${a.name} has no rows to compare`, query, numbers);
  return { claimId, kind, query, numbers: { ...numbers, overlap: matched / total } };
}

/** From the schema: is there a primary key? */
function measureMissingKey(extract: Extract, claimId: string, s: Suspicion): Measurement {
  const kind = s.kind;
  const table = findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  return { claimId, kind, query: `-- from the schema: pg_constraint with contype = 'p' on ${table.name}`, numbers: { hasPrimaryKey: table.primaryKey ? 1 : 0 } };
}

// ---------- helpers ----------

/** Runs the native comparison over a sampled source; if the server reports a datatype mismatch, compares as text once. */
async function runWithTextFallback(db: Db, cfg: Config, from: Table, sql: (source: string, cast: string) => string): Promise<{ query: string; result: QueryResult }> {
  let cast = "";
  let { source, result } = await querySampled(db, from, cfg, (src) => sql(src, cast));
  if (!result.ok && result.reason === "error" && result.sqlState !== undefined && DATATYPE_MISMATCH_STATES.includes(result.sqlState)) {
    cast = "::text";
    ({ source, result } = await querySampled(db, from, cfg, (src) => sql(src, cast)));
  }
  return { query: sql(source, cast), result };
}

function skip(claimId: string, kind: Measurement["kind"], reason: string, query = "", numbers: Record<string, number> = {}): Measurement {
  return { claimId, kind, query, numbers, skipped: reason };
}

/** The relation a claim names: exact match on the display or the qualified name first, then case-insensitive. */
export function findTable(extract: Extract, name: string | undefined): Table | undefined {
  if (name === undefined) return undefined;
  const wanted = name.trim();
  const candidates = (t: Table) => [t.name, `${t.schema}.${bareName(t)}`];
  return (
    extract.tables.find((t) => candidates(t).includes(wanted)) ??
    extract.tables.find((t) => candidates(t).some((c) => c.toLowerCase() === wanted.toLowerCase()))
  );
}

function hasColumn(table: Table, column: string): boolean {
  return table.columns.some((c) => c.name === column);
}

const NEVER_REFRESHED = "a materialized view that has never been refreshed cannot be read";

function unpopulated(table: Table): boolean {
  return table.populated === false;
}
