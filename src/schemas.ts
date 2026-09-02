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
  visible: boolean; // categorical, or a declared key: values shown to the model
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
  populated?: boolean; // materialized view only: false when it has never been refreshed, so it cannot be read
  partitions?: { count: number; withLocalForeignKeys: number }; // a partitioned table stands for its partitions
  rowEstimate: number;
  primaryKey: string[] | null;
  foreignKeys: { column: string; refTable: string; refColumn: string }[];
  columns: Column[];
  samples: Record<string, unknown>[]; // cells hidden per column.visible
};

export type Extract = {
  database: string; // name only, never the URL
  tables: Table[];
  skipped: string[]; // over budget
  schemaTokens: number; // size of the schema-only serialization
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

export const SuspicionKind = z.enum([
  "duplicate_entity",
  "dead_table",
  "inconsistent_values",
  "missing_key",
  "other",
]);

export const SuspicionSchema = z.object({
  kind: SuspicionKind,
  tables: z.array(z.string()).min(1),
  column: z.string().optional(),
  detail: z.string(),
});

export const ClaimsSchema = z.object({
  entities: z.array(EntitySchema).default([]),
  tables: z.array(TableMeaningSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  suspicions: z.array(SuspicionSchema).default([]),
  questions: z.array(z.string()).default([]),
});

export type Claims = z.infer<typeof ClaimsSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Suspicion = z.infer<typeof SuspicionSchema>;

// ---------- Verified: claims + verdicts + evidence (tested) ----------

export type Measurement = {
  claimId: string;
  kind: "relationship" | Suspicion["kind"];
  query: string;
  numbers: Record<string, number>;
  /** set when the measurement could not be taken: timeout, budget, error, or no way to measure */
  skipped?: string;
};

export type Verdict = {
  status: "confirmed" | "broken" | "rejected" | "unverifiable";
  measurement: { query: string; numbers: Record<string, number> };
};

/** Per-table facts the writer needs that claims do not carry: kind, key, size, categorical values. */
export type TableFacts = {
  name: string;
  kind: RelationKind;
  partitions?: { count: number; withLocalForeignKeys: number };
  rowEstimate: number;
  primaryKey: string[] | null;
  categorical: Record<string, unknown[]>;
};

export type Verified = {
  version: 1;
  database: string;
  claims: Claims;
  verdicts: Record<string, Verdict>;
  fitsInContext: boolean;
  tables: TableFacts[];
};

/** Stable, readable id for a claim. The writer sees these keys next to the verdicts. */
export function relationshipId(r: Relationship): string {
  return `relationship:${r.from.table}.${r.from.column}->${r.to.table}.${r.to.column}`;
}

export function suspicionId(s: Suspicion): string {
  return `suspicion:${s.kind}:${s.tables.join("+")}${s.column ? "." + s.column : ""}`;
}

// ---------- Files: markdown for the agent (trusted) ----------

export const FilesSchema = z.record(z.string(), z.string());
export type Files = z.infer<typeof FilesSchema>;
