// schemas.ts: the four objects that flow through the loop, and the zod schemas
// for the two the model produces (Claims, Files).

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

export type RelationKind = "table" | "view" | "materialized view";

export type Table = {
  name: string; // "table" in schema public, otherwise "schema.table"
  schema: string;
  kind: RelationKind;
  comment?: string;
  definition?: string; // the SQL of a view or materialized view
  populated?: boolean; // materialized view: false when it has never been refreshed
  partitions?: { count: number; withLocalForeignKeys: number }; // a partitioned table stands for its partitions
  rowEstimate: number; // -1 when unknown: a view, or a never-analyzed table, holding at least the sample size of rows
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
 * Claims are validated and then deduplicated by id, so each identity is measured exactly once
 * and every verdict maps back to one claim. A relationship stated twice keeps the "stated"
 * copy; suspicions with the same id merge their details.
 */
export const ClaimsSchema = ClaimsShape.transform((c) => {
  const relationships = new Map<string, Relationship>();
  for (const r of c.relationships) {
    const id = relationshipId(r);
    const prev = relationships.get(id);
    if (!prev || (prev.basis === "inferred" && r.basis === "stated")) relationships.set(id, r);
  }
  const suspicions = new Map<string, Suspicion>();
  for (const s of c.suspicions) {
    const id = suspicionId(s);
    const prev = suspicions.get(id);
    if (!prev) suspicions.set(id, { ...s });
    else if (!prev.detail.includes(s.detail)) prev.detail = `${prev.detail}; ${s.detail}`;
  }
  return { ...c, relationships: [...relationships.values()], suspicions: [...suspicions.values()] };
});

export type Claims = z.output<typeof ClaimsSchema>;

// ---------- Verified: claims + verdicts + evidence (tested) ----------

export type Measurement = {
  claimId: string;
  kind: "relationship" | Suspicion["kind"];
  query: string;
  numbers: Record<string, number>;
  /** set when the measurement could not be taken: timeout, budget, error, or no way to measure */
  skipped?: string;
  /** the source held no rows to measure. Only ever set alongside `skipped`. */
  empty?: boolean;
};

export type Verdict = {
  status: "confirmed" | "broken" | "rejected" | "unverifiable" | "empty";
  measurement: { query: string; numbers: Record<string, number> };
  skipped?: string;
};

/** Per-relation facts the writer needs that claims do not carry: kind, key, size, categorical values. */
export type TableFacts = Pick<Table, "name" | "kind" | "partitions" | "rowEstimate" | "primaryKey"> & {
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

export const FilesSchema = z.record(z.string(), z.string());
export type Files = z.infer<typeof FilesSchema>;
