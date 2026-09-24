// snapshot.ts: Verified -> context/snapshot.json, and back. What was claimed and measured, for check to measure again.
//
// Written so that a rerun on an unchanged database gives the same bytes, and git shows only real changes: keys sorted
// at every level, claims by id or name and relations by name, in UTF-16 code-unit order, never a locale's, and no
// timestamp. Nothing from Verified.tables goes in, so no value the model was shown does either.
//
// Read as untrusted input, since a pull request can edit it: its kind and size are checked before a byte is read, and
// it is parsed against SnapshotSchema, its settings held to their flags' ranges, before anything uses it.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { resolveConfig, type Config } from "./config.js";
import { relationshipId, schemaOnly, SNAPSHOT_FORMAT, SnapshotSchema, suspicionId, type CatalogRelation, type Snapshot, type Verified } from "./schemas.js";

// Part of the format, not a tunable: the file is written on one machine and read on another, and a limit set on one
// would refuse there what the other wrote. A relation of five columns takes about half a kilobyte, so it is reached at
// some twenty thousand relations.
const SNAPSHOT_MAX_MB = 10;
const BYTES_PER_MB = 1024 * 1024;

/** Every relation of the catalog with its columns, and a fingerprint of the schema that no size, budget or claim moves. */
export function schemaOf(catalog: CatalogRelation[]): Snapshot["schema"] {
  const sorted = sortedBy(catalog, (r) => r.name);
  return {
    fingerprint: `sha256:${createHash("sha256").update(JSON.stringify(canonical(schemaOnly(sorted)))).digest("hex")}`,
    // The schema with each name, so check can look a claim's table up as verify does.
    relations: sorted.map((r) => ({ name: r.name, schema: r.schema, kind: r.kind, columns: r.columns.map((c): [string, string] => [c.name, c.type]) })),
  };
}

/**
 * The snapshot of a run. The catalog, not the extract, gives the schema: a relation skipped over budget or dropped to
 * fit the model has no columns in the extract, and is listed all the same, marked as not examined.
 */
export function toSnapshot(verified: Verified, catalog: CatalogRelation[], cfg: Config, meta: { toolVersion: string; serverVersionNum: number }): Snapshot {
  const examined = new Set(verified.tables.map((t) => t.name));
  const { fingerprint, relations } = schemaOf(catalog);
  return {
    snapshot: SNAPSHOT_FORMAT,
    tool: "dbtruth",
    ...meta,
    database: verified.database,
    // The schema lists the settings a measurement depends on; parsing keeps just those.
    measuredWith: SnapshotSchema.shape.measuredWith.parse(cfg),
    schema: { fingerprint, relations: relations.map((r) => (examined.has(r.name) ? r : { ...r, examined: false as const })) },
    claims: verified.claims,
    verdicts: verified.verdicts,
  };
}

/**
 * Two-space JSON with a final newline. The claims are sorted by id or name; an array inside a claim keeps its order,
 * since a suspicion's tables are part of its id and a key's columns, like a table's notes, mean something in order.
 */
export function serialize(s: Snapshot): string {
  const claims = {
    ...s.claims,
    entities: sortedBy(s.claims.entities, (e) => e.name),
    tables: sortedBy(s.claims.tables, (t) => t.name),
    relationships: sortedBy(s.claims.relationships, relationshipId),
    suspicions: sortedBy(s.claims.suspicions, suspicionId),
    questions: sortedBy(s.claims.questions, (q) => q),
  };
  return JSON.stringify(canonical({ ...s, claims }), null, 2) + "\n";
}

/** The snapshot in text, or the sentence that says why it is not one. */
export function parseSnapshot(text: string, file: string): Snapshot | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Not the parser's message: it quotes the text, and a snapshot that is a symbolic link can point at any file.
    return `${file} is not valid JSON: run npx dbtruth and commit context/`;
  }
  const format = (json as { snapshot?: unknown } | null)?.snapshot;
  if (typeof format === "number" && format > SNAPSHOT_FORMAT) return `${file} was written by a newer dbtruth (snapshot format ${format}); upgrade dbtruth to check it`;
  const parsed = SnapshotSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return `${file} is not a dbtruth snapshot: ${issue.path.length > 0 ? issue.path.join(".") : "the top level"}: ${issue.message}`;
  }
  // check measures with these, so they are held to the ranges a flag is. It shows no sample rows, which the snapshot
  // does not record, so their rule against sampleRows does not apply.
  const { join, ...settings } = parsed.data.measuredWith;
  try {
    resolveConfig({}, { ...settings, "join.confirmed": join.confirmed, "join.broken": join.broken, sampleRowsShown: 0 });
  } catch (e) {
    return `${file} is not a dbtruth snapshot: measuredWith: ${e instanceof Error ? e.message : String(e)}`;
  }
  return parsed.data;
}

/** The snapshot at file, relative to cwd, or the sentence that says why there is none. Only a file of a sane size is read. */
export function readSnapshot(cwd: string, file: string): Snapshot | string {
  const path = resolve(cwd, file);
  let text: string;
  try {
    const found = statSync(path, { throwIfNoEntry: false });
    if (!found) return `no ${file}: run npx dbtruth first`;
    // A directory, or a device a symbolic link points at, is never read.
    if (!found.isFile()) return `${file} is not a file`;
    if (found.size > SNAPSHOT_MAX_MB * BYTES_PER_MB) return `${file} is larger than ${SNAPSHOT_MAX_MB} MB, the most dbtruth reads`;
    text = readFileSync(path, "utf8");
  } catch (e) {
    return `could not read ${file} (${e instanceof Error ? e.message : String(e)})`;
  }
  return parseSnapshot(text, file);
}

/** The value with every object's keys in code-unit order, so the same data always has the same text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonical(object[key])]));
}

/** A copy of list in the code-unit order of key, two items with one key in the order of their whole text. */
function sortedBy<T>(list: T[], key: (item: T) => string): T[] {
  const text = (item: T) => JSON.stringify(canonical(item));
  return [...list].sort((a, b) => byCodeUnits(key(a), key(b)) || byCodeUnits(text(a), text(b)));
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
