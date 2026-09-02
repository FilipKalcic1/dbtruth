// extract.ts: Postgres -> Extract. Facts only, through safety.query.
//
// Per relation (table, view, materialized view): schema, row estimate, one bounded
// sample from which null rate, distinct count and longest value are computed inside
// the database (the sample never leaves it), a few rows shown with high-cardinality
// columns hidden, and the full list of distinct values for categorical columns.
//
// Visibility is one rule for every type: a column's values are shown when it is
// categorical (few distinct values, none long) or when it is a declared key (primary
// key or foreign key column, an identifier by declaration). Everything else is
// "[hidden]"; the model keeps the name, type, null rate, distinct count, longest value,
// and for dates and timestamps the year range.
//
// A partitioned table stands for its partitions: one logical table, with the number
// of partitions and how many carry foreign keys of their own.
//
// The three catalog reads (relations, columns, keys) run outside the time budget so a
// tiny budget still yields a complete schema; the budget governs per-relation sampling.

import type { Config } from "./config.js";
import { q, qualified, sampleSource, typeFamily, type Db, type Row } from "./safety.js";
import type { Column, Extract, RelationKind, Table } from "./schemas.js";

export type ExtractOptions = {
  /** false: send schema and statistics only, no sample rows and no value lists. */
  samples: boolean;
  /** "table.column" entries whose values are shown even when they would be hidden. */
  reveal: Set<string>;
};

export const HIDDEN = "[hidden]";

export async function extract(db: Db, cfg: Config, opts: ExtractOptions): Promise<Extract> {
  const all = await listRelations(db);
  const oids = all.map((r) => r.oid);
  const columnsByOid = await listColumns(db, oids);
  const keysByOid = await listKeys(db, oids, all, columnsByOid);
  const partitionsByParent = summarizePartitions(all, keysByOid);

  const tables: Table[] = [];
  const skipped: string[] = [];

  for (const rel of all) {
    if (rel.isPartition) continue;
    const name = displayName(rel.schema, rel.table);
    if (db.budget().exhausted) {
      skipped.push(name);
      continue;
    }
    const partitions = partitionsByParent.get(rel.oid);
    const base: Table = {
      name,
      schema: rel.schema,
      kind: rel.kind,
      ...(rel.comment ? { comment: rel.comment } : {}),
      ...(rel.definition ? { definition: rel.definition } : {}),
      ...(rel.populated !== undefined ? { populated: rel.populated } : {}),
      ...(partitions ? { partitions } : {}),
      rowEstimate: rel.rowEstimate,
      primaryKey: keysByOid.get(rel.oid)?.primaryKey ?? null,
      foreignKeys: keysByOid.get(rel.oid)?.foreignKeys ?? [],
      columns: (columnsByOid.get(rel.oid) ?? []).map(({ attnum: _attnum, ...c }) => ({
        ...c,
        nullRate: 0,
        distinct: 0,
        maxLength: 0,
        visible: false,
      })),
      samples: [],
    };
    tables.push(await profile(db, cfg, opts, base));
  }

  return {
    database: db.database,
    tables,
    skipped,
    schemaTokens: Math.ceil(JSON.stringify(schemaOnly(tables)).length / cfg.charsPerToken),
  };
}

// ---------- catalog queries ----------

type Relation = {
  oid: number;
  schema: string;
  table: string;
  kind: RelationKind;
  isPartition: boolean;
  parent?: number;
  comment?: string;
  definition?: string;
  populated?: boolean;
  rowEstimate: number;
};

async function listRelations(db: Db): Promise<Relation[]> {
  const r = await db.catalog(
    `SELECT c.oid::int AS oid, n.nspname AS schema, c.relname AS "table", c.relkind::text AS relkind,
            c.relispartition AS is_partition, i.inhparent::int AS parent, c.relispopulated AS populated,
            c.reltuples::float8 AS estimate, obj_description(c.oid, 'pg_class') AS comment,
            CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS definition
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_inherits i ON i.inhrelid = c.oid AND c.relispartition
      WHERE c.relkind IN ('r', 'p', 'v', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
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
      // A plain view has no rows of its own: the sample decides its size.
      rowEstimate: kind === "view" ? -1 : Number(row.estimate),
    };
  });
}

type ColumnBase = Pick<Column, "name" | "type" | "nullable" | "comment"> & { attnum: number };

async function listColumns(db: Db, oids: number[]): Promise<Map<number, ColumnBase[]>> {
  const r = await db.catalog(
    `SELECT a.attrelid::int AS oid, a.attnum::int AS attnum, a.attname AS name,
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

async function listKeys(
  db: Db,
  oids: number[],
  relations: Relation[],
  columnsByOid: Map<number, ColumnBase[]>,
): Promise<Map<number, Keys>> {
  const r = await db.catalog(
    `SELECT conrelid::int AS oid, contype::text AS contype, conkey, confrelid::int AS refoid, confkey,
            (conparentid = 0) AS local
       FROM pg_constraint
      WHERE contype IN ('p', 'f') AND conrelid = ANY($1::oid[])`,
    [oids],
  );
  if (!r.ok) throw new Error(`could not list constraints: ${r.message}`);
  const nameOf = (oid: number, attnum: number) => columnsByOid.get(oid)?.find((c) => c.attnum === attnum)?.name;
  const tableName = (oid: number) => {
    const rel = relations.find((x) => x.oid === oid);
    return rel ? displayName(rel.schema, rel.table) : undefined;
  };
  const out = new Map<number, Keys>();
  for (const row of r.rows) {
    const oid = Number(row.oid);
    const keys = out.get(oid) ?? { primaryKey: null, foreignKeys: [], localForeignKeys: 0 };
    const conkey = (row.conkey as number[]).map((n) => nameOf(oid, Number(n)) ?? "?");
    if (row.contype === "p") {
      keys.primaryKey = conkey;
    } else {
      if (row.local) keys.localForeignKeys += 1;
      const refoid = Number(row.refoid);
      const refTable = tableName(refoid);
      const confkey = (row.confkey as number[]).map((n) => Number(n));
      if (refTable) {
        conkey.forEach((column, i) => {
          keys.foreignKeys.push({ column, refTable, refColumn: nameOf(refoid, confkey[i]!) ?? "?" });
        });
      }
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

async function profile(db: Db, cfg: Config, opts: ExtractOptions, table: Table): Promise<Table> {
  const cols = table.columns;
  if (cols.length === 0) return table;
  const keyColumns = new Set([...(table.primaryKey ?? []), ...table.foreignKeys.map((f) => f.column)]);
  const shownRegardless = (c: Column) => keyColumns.has(c.name) || opts.reveal.has(`${table.name}.${c.name}`);

  // A materialized view that was never refreshed cannot be read at all: schema only, nothing shown.
  if (table.populated === false) return { ...table, rowEstimate: 0, columns: cols.map((c) => ({ ...c, visible: shownRegardless(c) })) };

  // Null rate, distinct count, longest value, and for dates the year range: inside the database, over the bounded sample.
  const aggregates = cols
    .map((c, i) => {
      const base = `count(${q(c.name)}) AS nn${i}, count(DISTINCT ${q(c.name)}::text) AS d${i}, max(length(${q(c.name)}::text)) AS l${i}`;
      return typeFamily(c.type) === "time"
        ? `${base}, date_part('year', min(${q(c.name)}))::int AS y0${i}, date_part('year', max(${q(c.name)}))::int AS y1${i}`
        : base;
    })
    .join(", ");
  let source = sampleSource(table, cfg);
  let stats = await db.query(`SELECT count(*) AS n, ${aggregates} FROM ${source} s`);
  if (!stats.ok && stats.reason === "error" && source.includes("TABLESAMPLE")) {
    source = sampleSource(table, cfg, false);
    stats = await db.query(`SELECT count(*) AS n, ${aggregates} FROM ${source} s`);
  }
  if (!stats.ok) {
    // Statistics unavailable: keep the schema, show only declared keys, sample nothing.
    return { ...table, columns: cols.map((c) => ({ ...c, visible: shownRegardless(c) })) };
  }

  const row = stats.rows[0] as Row;
  const n = Number(row.n);
  const rowEstimate = table.rowEstimate < 0 ? n : table.rowEstimate; // never analyzed, or a view: use what the sample saw
  const columns: Column[] = cols.map((c, i) => {
    const distinct = Number(row[`d${i}`]);
    const nonNull = Number(row[`nn${i}`]);
    const maxLength = Number(row[`l${i}`] ?? 0);
    const categorical = distinct <= cfg.categoricalMaxDistinct && maxLength <= cfg.categoricalMaxValueLength;
    const visible = categorical || shownRegardless(c);
    const years = row[`y0${i}`] !== null && row[`y0${i}`] !== undefined ? ([Number(row[`y0${i}`]), Number(row[`y1${i}`])] as [number, number]) : undefined;
    return { ...c, nullRate: n === 0 ? 0 : 1 - nonNull / n, distinct, maxLength, visible, ...(years && !visible ? { years } : {}) };
  });

  if (!opts.samples) return { ...table, rowEstimate, columns };

  // Every distinct value of the categorical, visible columns.
  const listed = columns.filter(
    (c) => c.visible && c.distinct > 0 && c.distinct <= cfg.categoricalMaxDistinct && c.maxLength <= cfg.categoricalMaxValueLength,
  );
  if (listed.length > 0) {
    const lists = listed.map((c, i) => `array_agg(DISTINCT ${q(c.name)}::text) AS v${i}`).join(", ");
    const values = await db.query(`SELECT ${lists} FROM ${source} s`);
    if (values.ok) {
      const vrow = values.rows[0] as Row;
      listed.forEach((c, i) => {
        const v = vrow[`v${i}`];
        if (Array.isArray(v)) c.values = v.filter((x) => x !== null);
      });
    }
  }

  // A few rows shown, with cells hidden per column.visible.
  const shown = await db.query(`SELECT * FROM ${qualified(table)} LIMIT ${cfg.sampleRowsShown}`);
  const samples = shown.ok
    ? shown.rows.map((r) => {
        const cell: Record<string, unknown> = {};
        for (const c of columns) cell[c.name] = c.visible || r[c.name] === null ? r[c.name] : HIDDEN;
        return cell;
      })
    : [];

  return { ...table, rowEstimate, columns, samples };
}

// ---------- helpers ----------

export function displayName(schema: string, table: string): string {
  return schema === "public" ? table : `${schema}.${table}`;
}

/** The schema-only view used to measure whether the database fits in an agent's context. */
export function schemaOnly(tables: Table[]) {
  return tables.map((t) => ({
    name: t.name,
    kind: t.kind,
    comment: t.comment,
    definition: t.definition,
    populated: t.populated,
    partitions: t.partitions,
    primaryKey: t.primaryKey,
    foreignKeys: t.foreignKeys,
    columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, comment: c.comment })),
  }));
}
