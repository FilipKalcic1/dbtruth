// extract.ts: Postgres -> Extract. Facts only, through safety.query.
//
// Per relation (table, view, materialized view): schema, row estimate, one bounded
// sample from which null rate, distinct count and longest value are computed inside
// the database (the sample never leaves it), a few rows shown with only the visible
// columns selected, and the full list of distinct values for categorical columns.
//
// Visibility is one rule for every type. A column's values are shown when it is
// categorical: few distinct values, none long, and at least one value that repeats,
// so a small table's per-row identifiers stay hidden too. Declared primary and foreign
// key columns are shown unless they are text, an identifier by declaration. Everything
// else is "[hidden]"; the model keeps the name, type, null rate, distinct count, longest
// value, and for dates and timestamps the year range.
//
// A partitioned table stands for its partitions: one logical table, with the number
// of partitions and how many carry foreign keys of their own.
//
// The sample is sized from the row estimate. Where the catalog has none, as for a
// table never analyzed or a partitioned table, which autovacuum never analyzes, the
// estimate comes from the leaf partitions' estimates or from a pilot sample, so the
// sample is spread over the whole file instead of read from the oldest pages or the
// first partition.
//
// readCatalog makes the three catalog reads (relations, columns, keys) outside the time
// budget, so a tiny budget still yields a complete schema. extract profiles the relations
// of the catalog it is given, and stops at its share of the budget so that verifying
// claims keeps the rest.

import type { Config } from "./config.js";
import { bareName, DESCRIBED_RELATIONS, isIntegerType, q, qualified, querySampled, sampleSource, typeFamily, type Db, type Row } from "./safety.js";
import { schemaOnly, type CatalogRelation, type Column, type Extract, type IntegerKey, type RelationKind, type Table } from "./schemas.js";


export type ExtractOptions = {
  /** false: send schema and statistics only, no sample rows and no value lists. */
  samples: boolean;
  /** "table.column" or "schema.table.column" entries whose values are shown even when they would be hidden. */
  reveal: Set<string>;
};

export const HIDDEN = "[hidden]";

/** The relations dbtruth describes, each with what the catalog says of its size, which extract turns into a row estimate. */
export type Catalog = (CatalogRelation & { size: Size & { leaves?: Size[] } })[];

/** Every relation dbtruth describes, partitions folded into their parent: the three catalog statements, outside the budget. */
export async function readCatalog(db: Db): Promise<Catalog> {
  const all = await listRelations(db);
  const oids = all.map((r) => r.oid);
  const columnsByOid = await listColumns(db, oids);
  const keysByOid = await listKeys(db, oids, all, columnsByOid);
  const partitionsByParent = summarizePartitions(all, keysByOid);
  return all
    .filter((rel) => !rel.isPartition)
    .map((rel) => {
      const partitions = partitionsByParent.get(rel.oid);
      return {
        name: displayName(rel.schema, rel.table),
        schema: rel.schema,
        kind: rel.kind,
        ...(rel.comment ? { comment: rel.comment } : {}),
        ...(rel.definition ? { definition: rel.definition } : {}),
        ...(rel.populated !== undefined ? { populated: rel.populated } : {}),
        ...(partitions ? { partitions } : {}),
        primaryKey: keysByOid.get(rel.oid)?.primaryKey ?? null,
        foreignKeys: keysByOid.get(rel.oid)?.foreignKeys ?? [],
        columns: (columnsByOid.get(rel.oid) ?? []).map(({ attnum: _attnum, ...c }) => c),
        size: { estimate: rel.estimate, pages: rel.pages, ...(rel.leaves ? { leaves: rel.leaves } : {}) },
      };
    });
}

export async function extract(db: Db, cfg: Config, catalog: Catalog, opts: ExtractOptions): Promise<Extract> {
  const extractBudgetMs = db.budget().budgetMs * cfg.extractBudgetShare;
  const matchedReveal = new Set<string>();

  const tables: Table[] = [];
  const skipped: string[] = [];

  for (const { size, columns, ...relation } of catalog) {
    if (db.budget().spentMs >= extractBudgetMs) {
      skipped.push(relation.name);
      continue;
    }
    const estimate = await estimateRows(size, cfg.pilotPages, pilot(db, cfg, relation));
    const base: Table = {
      ...relation,
      ...estimate,
      columns: columns.map((c) => ({ ...c, nullRate: 0, distinct: 0, maxLength: 0, visible: false })),
      samples: [],
    };
    tables.push(await profile(db, cfg, opts, base, matchedReveal));
  }

  return {
    database: db.database,
    tables,
    skipped,
    schemaTokens: Math.ceil(JSON.stringify(schemaOnly(tables)).length / cfg.charsPerToken),
    unmatchedReveal: [...opts.reveal].filter((r) => !matchedReveal.has(r)),
  };
}

/**
 * The extract, reduced until it fits the model's input ceiling: first sample rows go, then value
 * lists, then whole tables from the end of the list into `skipped`. The note says what was dropped.
 */
export function fitToContext(extract: Extract, cfg: Config): { extract: Extract; reduced?: string } {
  const tokens = (e: Extract) => Math.ceil(JSON.stringify(e).length / cfg.charsPerToken);
  if (tokens(extract) <= cfg.modelMaxInputTokens) return { extract };

  let e: Extract = { ...extract, tables: extract.tables.map((t) => ({ ...t, samples: [] })) };
  if (tokens(e) <= cfg.modelMaxInputTokens) return { extract: e, reduced: "sample rows dropped to fit the model's input limit" };

  e = { ...e, tables: e.tables.map((t) => ({ ...t, columns: t.columns.map(({ values: _values, ...c }) => c) })) };
  if (tokens(e) <= cfg.modelMaxInputTokens) return { extract: e, reduced: "sample rows and value lists dropped to fit the model's input limit" };

  const kept = [...e.tables];
  const skipped = [...e.skipped];
  while (kept.length > 1 && tokens({ ...e, tables: kept, skipped }) > cfg.modelMaxInputTokens) skipped.push(kept.pop()!.name);
  const dropped = skipped.length - e.skipped.length;
  return { extract: { ...e, tables: kept, skipped }, reduced: `sample rows, value lists and ${dropped} tables dropped to fit the model's input limit` };
}

// ---------- catalog queries ----------

/** A relation's size as the catalog has it: reltuples, and relpages from the same ANALYZE, or with no estimate the pages its file holds now. */
export type Size = { estimate: number; pages: number };

type Relation = Size & {
  oid: number;
  schema: string;
  table: string;
  kind: RelationKind;
  isPartition: boolean;
  parent?: number;
  comment?: string;
  definition?: string;
  populated?: boolean;
  /** A partitioned table's leaf tables, at every level of sub-partitioning: it has no storage of its own. */
  leaves?: Size[];
};

async function listRelations(db: Db): Promise<Relation[]> {
  // Pages are relpages, counted by the ANALYZE that gave reltuples. With no estimate relpages is 0 too, and only then is
  // the file read: pg_relation_size waits on a lock another session holds, and the listing would wait with it. A view or
  // a partitioned table has no file.
  // A partitioned table's leaves are the ordinary tables in its tree, at any depth, since only a partitioned table has
  // partitions. A tree with a foreign table in it gets none: TABLESAMPLE reads a foreign partition whole, so a pilot
  // or a sample over it is not what it says, and the parent is sized and sampled as a plain relation, as before.
  const r = await db.catalog(
    `SELECT c.oid::bigint AS oid, n.nspname AS schema, c.relname AS "table", c.relkind::text AS relkind,
            c.relispartition AS is_partition, i.inhparent::bigint AS parent, c.relispopulated AS populated,
            c.reltuples::float8 AS estimate,
            CASE WHEN c.relkind IN ('r', 'm') AND c.reltuples <= 0 THEN pg_relation_size(c.oid) / current_setting('block_size')::int
                 ELSE c.relpages END AS pages,
            obj_description(c.oid, 'pg_class') AS comment,
            CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS definition,
            CASE WHEN c.relkind = 'p' AND NOT EXISTS (
              SELECT FROM pg_partition_tree(c.oid) t JOIN pg_class f ON f.oid = t.relid WHERE f.relkind = 'f'
            ) THEN (
              SELECT coalesce(json_agg(json_build_object('estimate', l.reltuples::float8, 'pages',
                       CASE WHEN l.reltuples <= 0 THEN pg_relation_size(l.oid) / current_setting('block_size')::int
                            ELSE l.relpages END)), '[]')
                FROM pg_partition_tree(c.oid) t
                JOIN pg_class l ON l.oid = t.relid
               WHERE l.relkind = 'r'
            ) END AS leaves
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_inherits i ON i.inhrelid = c.oid AND c.relispartition
      WHERE ${DESCRIBED_RELATIONS}
      ORDER BY n.nspname, c.relname`,
  );
  if (!r.ok) throw new Error(`could not list relations: ${r.message}`);
  return r.rows.map((row) => {
    const relkind = String(row.relkind);
    const kind: RelationKind = relkind === "v" ? "view" : relkind === "m" ? "materialized view" : "table";
    return {
      oid: Number(row.oid),
      schema: String(row.schema),
      table: String(row.table),
      kind,
      isPartition: Boolean(row.is_partition),
      ...(row.parent !== null && row.parent !== undefined ? { parent: Number(row.parent) } : {}),
      ...(row.comment ? { comment: String(row.comment) } : {}),
      ...(row.definition ? { definition: String(row.definition).trim() } : {}),
      ...(kind === "materialized view" ? { populated: Boolean(row.populated) } : {}),
      // A plain view has no rows of its own; the sample decides.
      estimate: kind === "view" ? -1 : Number(row.estimate),
      pages: Number(row.pages),
      ...(row.leaves ? { leaves: row.leaves as Size[] } : {}),
    };
  });
}

/**
 * The row estimate of a relation, and where it came from, by the first of these rules that applies:
 *   1. a table or materialized view whose estimate is known: the catalog's;
 *   2. a partitioned table whose leaf tables all have one: their sum, whatever its own reltuples says;
 *   3. one whose leaves do not: the known leaves' sum, plus the other leaves' pages at the known leaves' rows per
 *      page; with no known leaf that has pages to give that, the parent is piloted over all of its leaves' pages;
 *   4. an unknown estimate over pages on disk: a pilot, a count of the rows on about pilotPages of those pages, scaled to all;
 *   5. no pages, or a pilot that failed: -1, and the sample takes the plain form, as it always has for an unknown size.
 * The pilot's statement is handed in, so the rules run without a database.
 */
export async function estimateRows(
  rel: Size & { leaves?: Size[] },
  pilotPages: number,
  pilot: (percent: number) => Promise<number | undefined>,
): Promise<Pick<Table, "rowEstimate" | "estimateSource">> {
  let pages = rel.pages;
  if (rel.leaves) {
    const total = (list: Size[], key: keyof Size) => list.reduce((sum, leaf) => sum + leaf[key], 0);
    const known = rel.leaves.filter((leaf) => !isUnknown(leaf));
    const rows = total(known, "estimate");
    const knownPages = total(known, "pages");
    pages = total(rel.leaves, "pages");
    if (known.length === rel.leaves.length) return { rowEstimate: rows, estimateSource: "partitions" };
    if (knownPages > 0) return { rowEstimate: Math.round(rows + (pages - knownPages) * (rows / knownPages)), estimateSource: "partitions" };
  } else if (!isUnknown(rel)) {
    return { rowEstimate: rel.estimate, estimateSource: "catalog" };
  }
  if (pages > 0) {
    const percent = Math.min(100, (100 * pilotPages) / pages);
    const n = await pilot(percent);
    // The pilot read about percent of the pages, so it saw about percent of the rows.
    if (n !== undefined) return { rowEstimate: Math.round((n * 100) / percent), estimateSource: "pilot" };
  }
  return { rowEstimate: -1 };
}

/**
 * No estimate: reltuples is -1 before the first ANALYZE on Postgres 14 and later, and 0 on 12 and 13, as on any version
 * for a table analyzed while empty and loaded since. Pages on disk tell that 0 from an empty table.
 */
function isUnknown(s: Size): boolean {
  return s.estimate < 0 || (s.estimate === 0 && s.pages > 0);
}

/** estimateRows' pilot: a measurement like any other, inside the budget, and any failure leaves the size unknown. */
function pilot(db: Db, cfg: Config, relation: { schema: string; name: string }): (percent: number) => Promise<number | undefined> {
  return async (percent) => {
    const counted = await db.query(`SELECT count(*) AS n FROM ${qualified(relation)} TABLESAMPLE SYSTEM (${percent}) REPEATABLE (${cfg.sampleSeed})`);
    return counted.ok ? Number(counted.rows[0]!.n) : undefined;
  };
}

/**
 * The first weakEvidenceMaxCandidates relations, in catalog order, that are keyed by one integer column and hold rows,
 * sized as extract sizes them. From the catalog, not the extract, since check profiles only the relations its claims
 * name; a key the catalog cannot size is piloted here, with the same seed, so a run and check size it alike.
 */
export async function integerKeys(db: Db, cfg: Config, catalog: Catalog): Promise<IntegerKey[]> {
  const keys: IntegerKey[] = [];
  for (const { schema, name, primaryKey, columns, size } of catalog) {
    if (keys.length === cfg.weakEvidenceMaxCandidates) break;
    const key = primaryKey?.length === 1 ? columns.find((c) => c.name === primaryKey[0]) : undefined;
    if (!key || !isIntegerType(key.type)) continue;
    const { rowEstimate } = await estimateRows(size, cfg.pilotPages, pilot(db, cfg, { schema, name }));
    if (rowEstimate > 0) keys.push({ schema, name, column: key.name, rowEstimate });
  }
  return keys;
}

type ColumnBase = Pick<Column, "name" | "type" | "nullable" | "comment"> & { attnum: number };

async function listColumns(db: Db, oids: number[]): Promise<Map<number, ColumnBase[]>> {
  const r = await db.catalog(
    `SELECT a.attrelid::bigint AS oid, a.attnum::int AS attnum, a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
            col_description(a.attrelid, a.attnum) AS comment
       FROM pg_attribute a
      WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attrelid, a.attnum`,
    [oids],
  );
  if (!r.ok) throw new Error(`could not list columns: ${r.message}`);
  const out = new Map<number, ColumnBase[]>();
  for (const row of r.rows) {
    const list = out.get(Number(row.oid)) ?? [];
    list.push({
      attnum: Number(row.attnum),
      name: String(row.name),
      type: String(row.type),
      nullable: Boolean(row.nullable),
      ...(row.comment ? { comment: String(row.comment) } : {}),
    });
    out.set(Number(row.oid), list);
  }
  return out;
}

type Keys = { primaryKey: string[] | null; foreignKeys: Table["foreignKeys"]; localForeignKeys: number };

async function listKeys(db: Db, oids: number[], relations: Relation[], columnsByOid: Map<number, ColumnBase[]>): Promise<Map<number, Keys>> {
  // By name, not in the order the rows lie in, which a key dropped and added again changes: the snapshot's fingerprint reads the keys.
  const r = await db.catalog(
    `SELECT conrelid::bigint AS oid, contype::text AS contype, conkey, confrelid::bigint AS refoid, confkey,
            (conparentid = 0) AS local
       FROM pg_constraint
      WHERE contype IN ('p', 'f') AND conrelid = ANY($1::oid[])
      ORDER BY conrelid, conname`,
    [oids],
  );
  if (!r.ok) throw new Error(`could not list constraints: ${r.message}`);
  const nameByOid = new Map(relations.map((rel) => [rel.oid, displayName(rel.schema, rel.table)]));
  const columnNames = new Map<number, Map<number, string>>();
  for (const [oid, cols] of columnsByOid) columnNames.set(oid, new Map(cols.map((c) => [c.attnum, c.name])));
  const nameOf = (oid: number, attnum: number) => columnNames.get(oid)?.get(attnum) ?? "?";

  const out = new Map<number, Keys>();
  for (const row of r.rows) {
    const oid = Number(row.oid);
    const keys = out.get(oid) ?? { primaryKey: null, foreignKeys: [], localForeignKeys: 0 };
    const conkey = (row.conkey as number[]).map((n) => nameOf(oid, Number(n)));
    if (row.contype === "p") {
      keys.primaryKey = conkey;
    } else {
      if (row.local) keys.localForeignKeys += 1;
      const refoid = Number(row.refoid);
      const refTable = nameByOid.get(refoid);
      const confkey = (row.confkey as number[]).map((n) => Number(n));
      if (refTable) conkey.forEach((column, i) => keys.foreignKeys.push({ column, refTable, refColumn: nameOf(refoid, confkey[i]!) }));
    }
    out.set(oid, keys);
  }
  return out;
}

/** For each partitioned parent: how many partitions, and how many declare foreign keys of their own. */
function summarizePartitions(relations: Relation[], keysByOid: Map<number, Keys>): Map<number, NonNullable<Table["partitions"]>> {
  const out = new Map<number, NonNullable<Table["partitions"]>>();
  for (const rel of relations) {
    if (!rel.isPartition || rel.parent === undefined) continue;
    const summary = out.get(rel.parent) ?? { count: 0, withLocalForeignKeys: 0 };
    summary.count += 1;
    if ((keysByOid.get(rel.oid)?.localForeignKeys ?? 0) > 0) summary.withLocalForeignKeys += 1;
    out.set(rel.parent, summary);
  }
  return out;
}

// ---------- per-relation profiling ----------

export type ColumnStats = { nonNull: number; distinct: number; maxLength: number };

/** Few distinct values, none long, and at least one that repeats. The one rule, for every type. */
export function isCategorical(s: ColumnStats, cfg: Pick<Config, "categoricalMaxDistinct" | "categoricalMaxValueLength">): boolean {
  return s.distinct >= 1 && s.distinct <= cfg.categoricalMaxDistinct && s.maxLength <= cfg.categoricalMaxValueLength && s.distinct < s.nonNull;
}

async function profile(db: Db, cfg: Config, opts: ExtractOptions, table: Table, matchedReveal: Set<string>): Promise<Table> {
  const cols = table.columns;
  if (cols.length === 0) return table;

  const keyColumns = new Set([...(table.primaryKey ?? []), ...table.foreignKeys.map((f) => f.column)]);
  // Every reveal entry that names one of this relation's columns is matched up front, whatever else decides visibility.
  const revealed = new Set<string>();
  for (const c of cols) {
    for (const key of [`${bareName(table)}.${c.name}`, `${table.schema}.${bareName(table)}.${c.name}`]) {
      if (opts.reveal.has(key)) {
        matchedReveal.add(key);
        revealed.add(c.name);
      }
    }
  }
  const shownRegardless = (c: Column) => (keyColumns.has(c.name) && typeFamily(c.type) !== "text") || revealed.has(c.name);
  const keysOnly = () => ({ ...table, columns: cols.map((c) => ({ ...c, visible: shownRegardless(c) })) });

  // A materialized view that was never refreshed cannot be read at all: schema only, nothing shown.
  if (table.populated === false) return { ...keysOnly(), rowEstimate: 0, unmeasured: "a materialized view that has never been refreshed cannot be read" };

  // Null rate, distinct count, longest value, and for dates the year range: inside the database, over the bounded sample.
  const aggregates = cols
    .map((c, i) => {
      const base = `count(${q(c.name)}) AS nn${i}, count(DISTINCT ${q(c.name)}::text) AS d${i}, max(length(${q(c.name)}::text)) AS l${i}`;
      return typeFamily(c.type) === "time"
        ? `${base}, date_part('year', min(${q(c.name)}))::float8 AS y0${i}, date_part('year', max(${q(c.name)}))::float8 AS y1${i}`
        : base;
    })
    .join(", ");
  const statsQuery = (source: string) => `SELECT count(*) AS n, ${aggregates} FROM ${source} s`;
  let { source, result: stats } = await querySampled(db, table, cfg, statsQuery);
  // A random page sample can come back empty on a table whose estimate is stale; the plain form settles it.
  if (stats.ok && Number(stats.rows[0]?.n) === 0 && source !== sampleSource(table, cfg, false)) {
    source = sampleSource(table, cfg, false);
    stats = await db.query(statsQuery(source));
  }
  // Statistics unavailable: keep the schema, show only declared keys, sample nothing, and say why. The estimate stands,
  // except a 0 that nothing confirmed, which becomes unknown and so has no source.
  if (!stats.ok) {
    const unread = { ...keysOnly(), unmeasured: stats.message };
    return table.rowEstimate === 0 ? { ...unread, rowEstimate: -1, estimateSource: undefined } : unread;
  }

  const row = stats.rows[0] as Row;
  const n = Number(row.n);
  // A random sample keeps the estimate. A plain LIMIT that came back short counted the whole relation;
  // one that filled up proves at least n rows, so an estimate below that (stale, or unknown) is "at least the sample size".
  // Only an estimate that stands keeps its source: a count is not an estimate, even one that agrees with it.
  const plain = source === sampleSource(table, cfg, false);
  const stands = !plain || (n >= cfg.sampleRows && table.rowEstimate >= n);
  const rowEstimate = stands ? table.rowEstimate : n < cfg.sampleRows ? n : -1;
  const estimateSource = stands ? table.estimateSource : undefined;
  const columns: Column[] = cols.map((c, i) => {
    const s: ColumnStats = { nonNull: Number(row[`nn${i}`]), distinct: Number(row[`d${i}`]), maxLength: Number(row[`l${i}`] ?? 0) };
    const visible = isCategorical(s, cfg) || shownRegardless(c);
    const y0 = Number(row[`y0${i}`]);
    const y1 = Number(row[`y1${i}`]);
    const years = !visible && row[`y0${i}`] !== null && row[`y0${i}`] !== undefined && Number.isFinite(y0) && Number.isFinite(y1);
    return { ...c, nullRate: n === 0 ? 0 : 1 - s.nonNull / n, distinct: s.distinct, maxLength: s.maxLength, visible, ...(years ? { years: [y0, y1] as [number, number] } : {}) };
  });

  if (!opts.samples || n === 0) return { ...table, rowEstimate, estimateSource, columns };

  // One statement over the same sample: every distinct value of each categorical column, and a few
  // rows with only the visible columns selected. Hidden values never leave the database.
  const listed = columns.filter((c) => c.visible && isCategorical({ nonNull: n, distinct: c.distinct, maxLength: c.maxLength }, cfg));
  const shown = columns.filter((c) => c.visible);
  const parts = listed.map((c, i) => `(SELECT array_agg(DISTINCT ${q(c.name)}::text) FROM s) AS v${i}`);
  if (shown.length > 0) parts.push(`(SELECT json_agg(r) FROM (SELECT ${shown.map((c) => q(c.name)).join(", ")} FROM s LIMIT ${cfg.sampleRowsShown}) r) AS shown`);
  let samples: Record<string, unknown>[] = [];
  if (parts.length > 0) {
    const detail = await db.query(`WITH s AS MATERIALIZED (SELECT * FROM ${source} src) SELECT ${parts.join(", ")}`);
    if (detail.ok) {
      const drow = detail.rows[0] as Row;
      listed.forEach((c, i) => {
        const v = drow[`v${i}`];
        if (Array.isArray(v)) c.values = v.filter((x) => x !== null);
      });
      const rows = Array.isArray(drow.shown) ? (drow.shown as Record<string, unknown>[]) : [];
      samples = rows.map((r) => Object.fromEntries(columns.map((c) => [c.name, c.visible ? r[c.name] : HIDDEN])));
    }
  }

  return { ...table, rowEstimate, estimateSource, columns, samples };
}

// ---------- helpers ----------

export function displayName(schema: string, table: string): string {
  return schema === "public" ? table : `${schema}.${table}`;
}
