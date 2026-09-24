// verify.ts: Claims -> Measurements. One bounded query per claim, numbers only.
//
// This module knows nothing about thresholds. It runs the query, returns the
// numbers and the query text, and marks a measurement `skipped` when it could
// not be taken (timeout, budget, unknown table, no way to measure), and also
// `empty` when a relation the claim names held no rows to measure. Claims are
// measured strongest first, so when the budget runs out it is the weakest that
// go unverified.

import type { Config } from "./config.js";
import { DATATYPE_MISMATCH_STATES, q, qualified, querySampled, typeFamily, type Db, type QueryResult } from "./safety.js";
import { findTable, relationshipId, suspicionId, type Claims, type Extract, type Measurement, type Relationship, type Suspicion, type Table } from "./schemas.js";

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
  const from = findTable(extract.tables, r.from.table);
  const to = findTable(extract.tables, r.to.table);
  if (!from) return skip(claimId, kind, `unknown table ${r.from.table}`);
  if (!to) return skip(claimId, kind, `unknown table ${r.to.table}`);
  if (!hasColumn(from, r.from.column)) return skip(claimId, kind, `unknown column ${r.from.table}.${r.from.column}`);
  if (!hasColumn(to, r.to.column)) return skip(claimId, kind, `unknown column ${r.to.table}.${r.to.column}`);
  const empty = nothingToMeasure(claimId, kind, from, to);
  if (empty) return empty;

  // The target is probed per row through its index when the column leads the primary key and is compared as is;
  // otherwise, or once a datatype mismatch forces a comparison as text that no index serves, it is read once,
  // deduplicated and hashed, which the planner batches to disk when it is large. count(col) and the match both
  // pass over a null reference, so total and hits are over non-null rows; nulls is what they left out.
  const keyed = to.primaryKey?.[0] === r.to.column;
  const col = `f.${q(r.from.column)}`;
  const counts = `count(${col}) AS total, count(*) - count(${col}) AS nulls`;
  const sql = (source: string, cast: string) =>
    keyed && !cast
      ? `SELECT ${counts}, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${qualified(to)} t WHERE t.${q(r.to.column)} = ${col})) AS hits
  FROM ${source} f`
      : `SELECT ${counts}, count(t.v) AS hits
  FROM ${source} f LEFT JOIN (SELECT DISTINCT ${q(r.to.column)}${cast} AS v FROM ${qualified(to)}) t ON t.v = ${col}${cast}`;
  const { query, result } = await runWithTextFallback(db, cfg, from, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = Number(result.rows[0]?.total);
  const hits = Number(result.rows[0]?.hits);
  const nulls = Number(result.rows[0]?.nulls);
  if (total === 0) return skipEmpty(claimId, kind, EMPTY_SOURCE, query, { total, nulls });
  return { claimId, kind, query, numbers: { total, hits, orphans: total - hits, hit: hits / total, nulls } };
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
  // Whole days, so the number kept is the one the statement reruns to on the same day, and a snapshot of an unchanged
  // database stays the same until the data is a day older. Rounded up, so it is over a whole staleAfterDays exactly when
  // the age is.
  const age = timeColumns.length > 0 ? `ceil(EXTRACT(EPOCH FROM (now() - greatest(${timeColumns.map((c) => `max(${q(c.name)})`).join(", ")}))) / ${SECONDS_PER_DAY})` : null;
  if (!exact && age === null) {
    const numbers: Record<string, number> = table.rowEstimate >= 0 ? { count: table.rowEstimate, exact: 0 } : { exact: 0 };
    // No statement reruns an estimate, so the label says where to look it up.
    const from = {
      catalog: `from the schema: pg_class.reltuples for ${table.name}`,
      partitions: `from the schema: pg_class.reltuples of the leaf partitions of ${table.name}`,
      pilot: `from a pilot sample: count(*) over TABLESAMPLE SYSTEM on a few of the pages of ${table.name}, scaled to all of them`,
    };
    const label = table.estimateSource ? from[table.estimateSource] : `no row estimate for ${table.name}`;
    return { query: `-- ${label}; no date or timestamp column to date it by`, exact, fromSchema: numbers };
  }
  const count = exact ? "count(*)::float8" : table.rowEstimate >= 0 ? `${Math.round(table.rowEstimate)}::float8` : "NULL::float8";
  return { query: `SELECT ${count} AS count, ${age ?? "NULL::float8"} AS age_days FROM ${qualified(table)}`, exact };
}

/** count (exact when the table is small) and the age in days of the newest timestamp. */
async function measureDeadTable(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = findTable(extract.tables, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (table.populated === false) {
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
  // On Postgres 17 and later an infinite timestamp gives an infinite age, which JSON cannot carry: left out, as a missing one is.
  if (row.age_days !== null && Number.isFinite(Number(row.age_days))) numbers.ageDays = Number(row.age_days);
  return { claimId, kind, query, numbers };
}

/** distinct values vs distinct canonical forms; canonical = lower(btrim(value)). */
async function measureInconsistentValues(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = findTable(extract.tables, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (!s.column) return skip(claimId, kind, "no column named");
  if (!hasColumn(table, s.column)) return skip(claimId, kind, `unknown column ${table.name}.${s.column}`);
  const empty = nothingToMeasure(claimId, kind, table);
  if (empty) return empty;

  const col = `${q(s.column)}::text`;
  const sql = (src: string) => `SELECT count(DISTINCT ${col}) AS distinct_values, count(DISTINCT lower(btrim(${col}))) AS canonical_forms FROM ${src} s`;
  const { result, source } = await querySampled(db, table, cfg, sql);
  const query = sql(source);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const distinctValues = Number(result.rows[0]?.distinct_values);
  const canonicalForms = Number(result.rows[0]?.canonical_forms);
  const numbers = { distinctValues, canonicalForms, collisions: distinctValues - canonicalForms };
  if (distinctValues === 0) return skipEmpty(claimId, kind, EMPTY_SOURCE, query, numbers);
  if (distinctValues > cfg.categoricalMaxDistinct) return skip(claimId, kind, `not categorical: ${distinctValues} distinct values`, query, numbers);
  return { claimId, kind, query, numbers };
}

/** share of A's distinct sampled tuples on the shared columns that exist in B. */
async function measureDuplicateEntity(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const a = findTable(extract.tables, s.tables[0]);
  const b = findTable(extract.tables, s.tables[1]);
  if (!a || !b) return skip(claimId, kind, `needs two known tables, got ${s.tables.join(", ")}`);
  const shared = a.columns.map((c) => c.name).filter((name) => hasColumn(b, name));
  if (shared.length === 0) return skip(claimId, kind, "no shared column names");
  const empty = nothingToMeasure(claimId, kind, a, b);
  if (empty) return empty;

  // A set operation treats nulls as equal and hashes each side once, so the cost is one read of each table.
  const cols = (alias: string, cast: string) => shared.map((c) => `${alias}.${q(c)}${cast}`).join(", ");
  const sql = (source: string, cast: string) =>
    `WITH a AS MATERIALIZED (SELECT DISTINCT ${cols("a", cast)} FROM ${source} a)
SELECT (SELECT count(*) FROM a) AS total,
       (SELECT count(*) FROM (SELECT * FROM a INTERSECT SELECT ${cols("b", cast)} FROM ${qualified(b)} b) i) AS matched`;
  const { query, result } = await runWithTextFallback(db, cfg, a, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = Number(result.rows[0]?.total);
  const matched = Number(result.rows[0]?.matched);
  const numbers = { total, matched, sharedColumns: shared.length };
  if (total === 0) return skipEmpty(claimId, kind, EMPTY_SOURCE, query, numbers);
  return { claimId, kind, query, numbers: { ...numbers, overlap: matched / total } };
}

/** From the schema: is there a primary key? */
function measureMissingKey(extract: Extract, claimId: string, s: Suspicion): Measurement {
  const kind = s.kind;
  const table = findTable(extract.tables, s.tables[0]);
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

function skipEmpty(claimId: string, kind: Measurement["kind"], reason: string, query = "", numbers: Record<string, number> = {}): Measurement {
  return { ...skip(claimId, kind, reason, query, numbers), empty: true };
}

/**
 * The empty measurement for a claim whose source or target the extract already knows holds nothing:
 * a materialized view that was never refreshed (Postgres refuses to read it) or a relation whose scan
 * counted no rows. Nothing can be measured, so the claim is empty rather than rejected, and no
 * statement runs. Undefined when every relation named can be read.
 */
function nothingToMeasure(claimId: string, kind: Measurement["kind"], source: Table, target?: Table): Measurement | undefined {
  const empty = (t: Table, noRows: string) =>
    t.populated === false
      ? skipEmpty(claimId, kind, NEVER_REFRESHED, `-- from the schema: pg_class.relispopulated is false for ${t.name}`)
      : t.rowEstimate === 0
        ? skipEmpty(claimId, kind, noRows, `-- from the extract: ${t.name} has no rows`)
        : undefined;
  return empty(source, EMPTY_SOURCE) ?? (target && empty(target, EMPTY_TARGET));
}

function hasColumn(table: Table, column: string): boolean {
  return table.columns.some((c) => c.name === column);
}

const NEVER_REFRESHED = "a materialized view that has never been refreshed cannot be read";

const EMPTY_SOURCE = "no non-null rows to test";

const EMPTY_TARGET = "no rows to match against";
