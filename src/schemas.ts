// schemas.ts: the four objects that flow through the loop, the zod schemas for
// the two the model produces (Claims, Files), the one for the snapshot, which
// dbtruth reads back, and what check reports.

import { z } from "zod";

// ---------- Extract: what the database looks like (facts) ----------

export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  comment?: string;
  nullRate: number; // on sample, 0..1
  distinct: number; // on sample
  maxLength: number; // characters in the longest value on the sample
  visible: boolean; // categorical, a declared non-text key, or revealed: values shown to the model
  values?: unknown[]; // every distinct value on the sample, only when visible and categorical
  years?: [number, number]; // hidden date or timestamp columns: the years of the oldest and newest value
};

const RelationKindSchema = z.enum(["table", "view", "materialized view"]);
export type RelationKind = z.infer<typeof RelationKindSchema>;

export type Table = {
  name: string; // "table" in schema public, otherwise "schema.table"
  schema: string;
  kind: RelationKind;
  comment?: string;
  definition?: string; // the SQL of a view or materialized view
  populated?: boolean; // materialized view: false when it has never been refreshed
  partitions?: { count: number; withLocalForeignKeys: number }; // a partitioned table stands for its partitions
  rowEstimate: number; // -1 when unknown: a view, or a table nothing could size, holding at least the sample size of rows
  estimateSource?: "catalog" | "partitions" | "pilot"; // where rowEstimate came from; none when it is a count, or unknown
  primaryKey: string[] | null;
  foreignKeys: { column: string; refTable: string; refColumn: string }[];
  columns: Column[];
  samples: Record<string, unknown>[]; // cells hidden per column.visible
};

export type Extract = {
  database: string; // name only, never the URL
  tables: Table[];
  skipped: string[]; // over budget, or dropped to fit the model's input
  schemaTokens: number; // size of the schema-only serialization
  unmatchedReveal: string[]; // --reveal entries that named no column
};

/** A relation as the catalog alone describes it, before it is sized or sampled. */
export type CatalogRelation = Omit<Table, "rowEstimate" | "estimateSource" | "columns" | "samples"> & {
  columns: Pick<Column, "name" | "type" | "nullable" | "comment">[];
};

/** The schema-only view: what sizes the schema against an agent's context, and what the snapshot's fingerprint is taken over. */
export function schemaOnly(relations: CatalogRelation[]) {
  return relations.map((t) => ({
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

// ---------- Claims: what the model thinks it means (hypotheses) ----------

const Basis = z.enum(["stated", "inferred"]);
const Confidence = z.number().min(0).max(1);
const ColumnRef = z.object({ table: z.string(), column: z.string() });

export const EntitySchema = z.object({
  name: z.string(),
  primaryTable: z.string(),
  referencedIn: z.array(z.string()).default([]),
  basis: Basis,
  confidence: Confidence,
  reason: z.string(),
});

export const TableMeaningSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  grain: z.string(),
  basis: Basis,
  confidence: Confidence,
  notes: z.array(z.string()).default([]),
});

export const RelationshipSchema = z.object({
  from: ColumnRef,
  to: ColumnRef,
  basis: Basis,
  confidence: Confidence,
  reason: z.string(),
});

export const SuspicionKind = z.enum(["duplicate_entity", "dead_table", "inconsistent_values", "missing_key", "other"]);

export const SuspicionSchema = z.object({
  kind: SuspicionKind,
  tables: z.array(z.string()).min(1),
  column: z.string().optional(),
  detail: z.string(),
});

export type Relationship = z.infer<typeof RelationshipSchema>;
export type Suspicion = z.infer<typeof SuspicionSchema>;

/** Stable, readable id for a claim. The writer sees these keys next to the verdicts. */
export function relationshipId(r: Relationship): string {
  return `relationship:${r.from.table}.${r.from.column}->${r.to.table}.${r.to.column}`;
}

export function suspicionId(s: Suspicion): string {
  return `suspicion:${s.kind}:${s.tables.join("+")}${s.column ? "." + s.column : ""}`;
}

const ClaimsShape = z.object({
  entities: z.array(EntitySchema).default([]),
  tables: z.array(TableMeaningSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  suspicions: z.array(SuspicionSchema).default([]),
  questions: z.array(z.string()).default([]),
});

/**
 * The relation a claim names, by the display name or the schema-qualified name: an exact match
 * first, then regardless of case. Undefined when the claim names nothing the extract has.
 */
export function findTable<T extends { name: string; schema: string }>(tables: T[], name: string | undefined): T | undefined {
  if (name === undefined) return undefined;
  const wanted = name.trim();
  const spellings = (t: T) => [t.name, t.name.startsWith(`${t.schema}.`) ? t.name : `${t.schema}.${t.name}`];
  return tables.find((t) => spellings(t).includes(wanted)) ?? tables.find((t) => spellings(t).some((s) => s.toLowerCase() === wanted.toLowerCase()));
}

/**
 * Claims are validated, every table they name is spelled as the extract spells it (a name the
 * extract does not have is kept, and verify reports it), and then they are deduplicated by id,
 * so each identity is measured exactly once and every verdict maps back to one claim. A
 * relationship stated twice keeps the "stated" copy, and of two with one basis the one whose text
 * sorts first; suspicions with the same id merge their details, each once, in code-unit order. So
 * the order of the copies never decides what is kept.
 */
export function claimsSchema(tables: { name: string; schema: string }[]) {
  const spell = (name: string) => findTable(tables, name)?.name ?? name;
  return ClaimsShape.transform((c) => {
    const relationships = new Map<string, Relationship>();
    for (const r of c.relationships) {
      const named = { ...r, from: { ...r.from, table: spell(r.from.table) }, to: { ...r.to, table: spell(r.to.table) } };
      const id = relationshipId(named);
      const prev = relationships.get(id);
      if (!prev || (prev.basis === named.basis ? JSON.stringify(named) < JSON.stringify(prev) : named.basis === "stated")) relationships.set(id, named);
    }
    // Gathered, then joined once: time in proportion to the copies, however many a hand-edited snapshot holds.
    const suspicions = new Map<string, { claim: Suspicion; details: Set<string> }>();
    for (const s of c.suspicions) {
      const named = { ...s, tables: s.tables.map(spell) };
      const id = suspicionId(named);
      const prev = suspicions.get(id);
      if (prev) prev.details.add(s.detail);
      else suspicions.set(id, { claim: named, details: new Set([s.detail]) });
    }
    return {
      ...c,
      entities: c.entities.map((e) => ({ ...e, primaryTable: spell(e.primaryTable), referencedIn: e.referencedIn.map(spell) })),
      tables: c.tables.map((t) => ({ ...t, name: spell(t.name) })),
      relationships: [...relationships.values()],
      suspicions: [...suspicions.values()].map(({ claim, details }) => ({ ...claim, detail: [...details].sort().join("; ") })),
    };
  });
}

export type Claims = z.output<ReturnType<typeof claimsSchema>>;

// ---------- Verified: claims + verdicts + evidence (tested) ----------

export type Measurement = {
  claimId: string;
  kind: "relationship" | Suspicion["kind"];
  query: string;
  numbers: Record<string, number>;
  /** set when the measurement could not be taken: timeout, budget, error, or no way to measure */
  skipped?: string;
  /** a relation the claim names held no rows to measure. Only ever set alongside `skipped`. */
  empty?: boolean;
};

const VerdictSchema = z.object({
  status: z.enum(["confirmed", "broken", "rejected", "unverifiable", "empty"]),
  measurement: z.object({ query: z.string(), numbers: z.record(z.string(), z.number()) }),
  skipped: z.string().optional(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** Per-relation facts the writer needs that claims do not carry: kind, key, size, categorical values. */
export type TableFacts = Pick<Table, "name" | "kind" | "partitions" | "rowEstimate" | "estimateSource" | "primaryKey"> & {
  categorical: Record<string, unknown[]>;
};

export type Verified = {
  version: 1;
  database: string;
  /** the relations examined, by kind: "9 tables, 1 view" */
  relations: string;
  claims: Claims;
  verdicts: Record<string, Verdict>;
  fitsInContext: boolean;
  tables: TableFacts[];
};

// ---------- Files: markdown for the agent (trusted) ----------

/** The two files the model writes. The per-table files are rendered from Verified, not asked of it. */
export const FilesSchema = z.object({ "context/README.md": z.string(), "context/ENTITIES.md": z.string() });
export type Files = Record<string, string>;

// ---------- Snapshot: Verified as check reads it back (untrusted: a pull request can edit it) ----------

/**
 * Raised whenever a reader of an older format would misread the file. A key an older reader can ignore does not
 * raise it: unknown keys are dropped when the file is read.
 */
export const SNAPSHOT_FORMAT = 1;

export const SnapshotSchema = z.object({
  snapshot: z.literal(SNAPSHOT_FORMAT),
  tool: z.literal("dbtruth"),
  toolVersion: z.string(),
  database: z.string(),
  serverVersionNum: z.number().int(),
  // The settings a measurement depends on, so check measures as the run that wrote the file did. parseSnapshot holds
  // each one a flag sets to that flag's range; of the two no flag sets, the seed can be any number, and an oversampling
  // below 1 would cut every sample short, at 0 to nothing.
  measuredWith: z.object({
    sampleRows: z.number(),
    sampleOversample: z.number().min(1),
    sampleSeed: z.number(),
    pilotPages: z.number(),
    join: z.object({ confirmed: z.number(), broken: z.number() }),
    staleAfterDays: z.number(),
    duplicateOverlap: z.number(),
    categoricalMaxDistinct: z.number(),
    categoricalMaxValueLength: z.number(),
  }),
  schema: z.object({
    fingerprint: z.string(),
    relations: z.array(
      z.object({
        name: z.string(),
        schema: z.string(),
        kind: RelationKindSchema,
        columns: z.array(z.tuple([z.string(), z.string()])), // [name, type], in the table's order
        examined: z.literal(false).optional(), // skipped over budget, or dropped to fit the model's input
      }),
    ),
  }),
  // The model reply's own schema: with no tables to spell against, names stay as written, and a claim stated twice is one.
  claims: claimsSchema([]),
  verdicts: z.record(z.string(), VerdictSchema),
});

export type Snapshot = z.output<typeof SnapshotSchema>;

// ---------- CheckReport: the snapshot measured again (check) ----------

/** What happened to a claim between the snapshot and now, as check.ts classifies it, in the report's order: what fails a build first. */
export const CHECK_CLASSES = ["regression", "stale", "drift", "improved", "changed", "not measured", "unchanged"] as const;
export type CheckClass = (typeof CHECK_CLASSES)[number];

export type ClaimCheck = {
  id: string;
  class: CheckClass;
  /** the snapshot's status: unverifiable when it holds no verdict for the claim */
  before: Verdict["status"];
  hitBefore?: number;
  /** measured now, with the statement verify builds, never the one the snapshot stores */
  after: Verdict;
  /** stale only: the "table" or "table.column" the database no longer has */
  missing?: string;
};

export type CheckReport = {
  database: { snapshot: string; now: string };
  /** the fingerprints differ */
  schemaChanged: boolean;
  /** the settings the snapshot was measured with, and measured with again, that differ from this run's */
  settings: { name: string; snapshot: number; now: number }[];
  claims: ClaimCheck[];
  /** relations in the database and not in the snapshot, or the other way round: stale */
  relations: { name: string; in: "database" | "context" }[];
};
