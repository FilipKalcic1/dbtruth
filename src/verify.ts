// verify.ts: Claims -> Measurements. One bounded query per claim, numbers only.
//
// This module knows nothing about thresholds. It runs the query, returns the
// numbers and the query text, and marks a measurement `skipped` when it could
// not be taken (timeout, budget, unknown table, no way to measure).

import type { Config } from "./config.js";
import { q, qualified, sampleSource, type Db, type QueryResult } from "./safety.js";
import {
  relationshipId,
  suspicionId,
  type Claims,
  type Extract,
  type Measurement,
  type Relationship,
  type Suspicion,
  type Table,
} from "./schemas.js";

const SECONDS_PER_DAY = 86_400;

export async function verify(db: Db, cfg: Config, extract: Extract, claims: Claims): Promise<Measurement[]> {
  const out: Measurement[] = [];
  const seen = new Set<string>();
  const unique = (id: string) => {
    let key = id;
    for (let n = 2; seen.has(key); n++) key = `${id}#${n}`;
    seen.add(key);
    return key;
  };
  for (const r of claims.relationships) out.push(await measureRelationship(db, cfg, extract, unique(relationshipId(r)), r));
  for (const s of claims.suspicions) out.push(await measureSuspicion(db, cfg, extract, unique(suspicionId(s)), s));
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

  const sql = (cast: string) =>
    `WITH s AS (SELECT ${q(r.from.column)}${cast} AS v FROM ${sampleSource(from, cfg)} f WHERE ${q(r.from.column)} IS NOT NULL)
SELECT count(*) AS total,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${qualified(to)} t WHERE t.${q(r.to.column)}${cast} = s.v)) AS hits
  FROM s`;
  const { query, result } = await runWithTextFallback(db, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = num(result.rows[0]?.total);
  const hits = num(result.rows[0]?.hits);
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

/** count (exact when the table is small) and the age in days of the newest timestamp. */
async function measureDeadTable(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = s.tables[0] === undefined ? undefined : findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (unpopulated(table)) {
    return {
      claimId,
      kind,
      query: `-- from the schema: pg_class.relispopulated is false for ${table.name}, the materialized view has never been refreshed`,
      numbers: { count: 0, exact: 1, populated: 0 },
    };
  }

  const timeColumns = table.columns.filter((c) => isTimeType(c.type));
  const latest = timeColumns.length > 0 ? `greatest(${timeColumns.map((c) => `max(${q(c.name)})`).join(", ")})` : "NULL::timestamptz";
  const exact = table.rowEstimate <= cfg.sampleRows;
  const count = exact ? "count(*)" : `${Math.round(table.rowEstimate)}`;
  const query = `SELECT ${count}::float8 AS count, EXTRACT(EPOCH FROM (now() - ${latest})) / ${SECONDS_PER_DAY}.0 AS age_days FROM ${qualified(table)}`;
  const result = await db.query(query);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const numbers: Record<string, number> = { count: num(result.rows[0]?.count), exact: exact ? 1 : 0 };
  const age = result.rows[0]?.age_days;
  if (age !== null && age !== undefined) numbers.ageDays = num(age);
  return { claimId, kind, query, numbers };
}

/** distinct values vs distinct canonical forms; canonical = lower(btrim(value)). */
async function measureInconsistentValues(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const table = s.tables[0] === undefined ? undefined : findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  if (unpopulated(table)) return skip(claimId, kind, NEVER_REFRESHED);
  if (!s.column) return skip(claimId, kind, "no column named");
  if (!hasColumn(table, s.column)) return skip(claimId, kind, `unknown column ${table.name}.${s.column}`);

  const col = `${q(s.column)}::text`;
  const query = `SELECT count(DISTINCT ${col}) AS distinct_values, count(DISTINCT lower(btrim(${col}))) AS canonical_forms FROM ${sampleSource(table, cfg)} s`;
  const result = await db.query(query);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const distinctValues = num(result.rows[0]?.distinct_values);
  const canonicalForms = num(result.rows[0]?.canonical_forms);
  const numbers = { distinctValues, canonicalForms, collisions: distinctValues - canonicalForms };
  if (distinctValues > cfg.categoricalMaxDistinct) {
    return skip(claimId, kind, `not categorical: ${distinctValues} distinct values`, query, numbers);
  }
  return { claimId, kind, query, numbers };
}

/** share of A's sample rows whose tuple on the shared columns exists in B. */
async function measureDuplicateEntity(db: Db, cfg: Config, extract: Extract, claimId: string, s: Suspicion): Promise<Measurement> {
  const kind = s.kind;
  const a = s.tables[0] === undefined ? undefined : findTable(extract, s.tables[0]);
  const b = s.tables[1] === undefined ? undefined : findTable(extract, s.tables[1]);
  if (!a || !b) return skip(claimId, kind, `needs two known tables, got ${s.tables.join(", ")}`);
  if (unpopulated(a) || unpopulated(b)) return skip(claimId, kind, NEVER_REFRESHED);

  const shared = a.columns.map((c) => c.name).filter((name) => hasColumn(b, name));
  if (shared.length === 0) return skip(claimId, kind, "no shared column names");

  const sql = (cast: string) =>
    `WITH a AS (SELECT ${shared.map(q).join(", ")} FROM ${sampleSource(a, cfg)} a)
SELECT count(*) AS total,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${qualified(b)} b WHERE ${shared
         .map((c) => `b.${q(c)}${cast} IS NOT DISTINCT FROM a.${q(c)}${cast}`)
         .join(" AND ")})) AS matched
  FROM a`;
  const { query, result } = await runWithTextFallback(db, sql);
  if (!result.ok) return skip(claimId, kind, result.message, query);
  const total = num(result.rows[0]?.total);
  const matched = num(result.rows[0]?.matched);
  const numbers = { total, matched, sharedColumns: shared.length };
  if (total === 0) return skip(claimId, kind, `${a.name} has no rows to compare`, query, numbers);
  return { claimId, kind, query, numbers: { ...numbers, overlap: matched / total } };
}

/** From the schema: is there a primary key? */
function measureMissingKey(extract: Extract, claimId: string, s: Suspicion): Measurement {
  const kind = s.kind;
  const table = s.tables[0] === undefined ? undefined : findTable(extract, s.tables[0]);
  if (!table) return skip(claimId, kind, `unknown table ${s.tables[0]}`);
  return {
    claimId,
    kind,
    query: `-- from the schema: pg_constraint with contype = 'p' on ${table.name}`,
    numbers: { hasPrimaryKey: table.primaryKey ? 1 : 0 },
  };
}

// ---------- helpers ----------

/** Runs the native comparison; if the server rejects it (type mismatch), compares as text once. */
async function runWithTextFallback(db: Db, sql: (cast: string) => string): Promise<{ query: string; result: QueryResult }> {
  let query = sql("");
  let result = await db.query(query);
  if (!result.ok && result.reason === "error") {
    query = sql("::text");
    result = await db.query(query);
  }
  return { query, result };
}

function skip(claimId: string, kind: Measurement["kind"], reason: string, query = "", numbers: Record<string, number> = {}): Measurement {
  return { claimId, kind, query, numbers, skipped: reason };
}

export function findTable(extract: Extract, name: string): Table | undefined {
  const wanted = name.trim();
  const candidates = (t: Table) => [t.name, `${t.schema}.${t.name.startsWith(`${t.schema}.`) ? t.name.slice(t.schema.length + 1) : t.name}`];
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

function isTimeType(type: string): boolean {
  const base = type.toLowerCase();
  return base.startsWith("timestamp") || base === "date";
}

function num(v: unknown): number {
  return Number(v);
}
