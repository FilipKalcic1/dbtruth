import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { assemble, decide, describeKinds, exitCode, fitsInContext } from "../src/verdict.js";
import type { Claims, Extract, Measurement, Table, Verified } from "../src/schemas.js";

const m = (kind: Measurement["kind"], numbers: Record<string, number>, skipped?: string): Measurement => ({
  claimId: `${kind === "relationship" ? "relationship" : "suspicion"}:x`,
  kind,
  query: "SELECT 1",
  numbers,
  ...(skipped ? { skipped } : {}),
});

const empty = (kind: Measurement["kind"], numbers: Record<string, number>, reason: string): Measurement => ({ ...m(kind, numbers, reason), empty: true });

test("relationship bands come from config: confirmed, broken, rejected", () => {
  assert.equal(decide(m("relationship", { hit: 1 }), config).status, "confirmed");
  assert.equal(decide(m("relationship", { hit: config.join.confirmed }), config).status, "confirmed");
  assert.equal(decide(m("relationship", { hit: 0.88 }), config).status, "broken");
  assert.equal(decide(m("relationship", { hit: config.join.broken }), config).status, "broken");
  assert.equal(decide(m("relationship", { hit: 0.49 }), config).status, "rejected");
  assert.equal(decide(m("relationship", { hit: 0 }), config).status, "rejected");
});

test("the broken band moves with config, not code", () => {
  const strict = { ...config, join: { confirmed: 0.999, broken: 0.9 } };
  assert.equal(decide(m("relationship", { hit: 0.995 }), strict).status, "broken");
  assert.equal(decide(m("relationship", { hit: 0.88 }), strict).status, "rejected");
});

test("a skipped measurement is unverifiable whatever its numbers", () => {
  assert.equal(decide(m("relationship", { hit: 1 }, "timeout"), config).status, "unverifiable");
  assert.equal(decide(m("dead_table", { count: 0 }, "budget"), config).status, "unverifiable");
});

test("a measurement with nothing to measure is empty, not unverifiable", () => {
  const nothing = decide(empty("relationship", { total: 0 }, "no non-null rows to test"), config);
  assert.equal(nothing.status, "empty", "an empty source proves nothing about the claim either way");
  assert.equal(nothing.skipped, "no non-null rows to test");
  assert.equal(nothing.measurement.numbers.total, 0, "the evidence is still carried");
  assert.equal(decide(empty("duplicate_entity", {}, "cars has no rows to compare"), config).status, "empty");
});

test("a measurement that was attempted and failed stays unverifiable, with its reason", () => {
  const failed = decide(m("relationship", { hit: 1 }, "timeout"), config);
  assert.equal(failed.status, "unverifiable");
  assert.equal(failed.skipped, "timeout");
});

test("an empty claim is not a finding: the exit code stays 0", () => {
  const base: Verified = { version: 1, database: "x", relations: "1 table", claims: { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, verdicts: {}, fitsInContext: true, tables: [] };
  const measurement = { query: "", numbers: {} };
  assert.equal(exitCode({ ...base, verdicts: { "relationship:a": { status: "empty", measurement, skipped: "no non-null rows to test" } } }), 0);
  assert.equal(exitCode({ ...base, verdicts: { "suspicion:dead_table:cars": { status: "empty", measurement, skipped: "no non-null rows to test" } } }), 0);
});

test("dead_table: empty or stale is confirmed, otherwise rejected", () => {
  assert.equal(decide(m("dead_table", { count: 0 }), config).status, "confirmed");
  assert.equal(decide(m("dead_table", { count: 10, ageDays: config.staleAfterDays + 1 }), config).status, "confirmed");
  assert.equal(decide(m("dead_table", { count: 10, ageDays: 1 }), config).status, "rejected");
  assert.equal(decide(m("dead_table", { count: 10 }), config).status, "rejected");
  assert.equal(decide(m("dead_table", { ageDays: config.staleAfterDays + 1 }), config).status, "confirmed", "age alone can prove death");
  assert.equal(decide(m("dead_table", { exact: 0 }), config).status, "unverifiable", "neither count nor age: nothing to decide on");
});

test("dead_table: a materialized view never refreshed is dead on the schema's word alone, with no count", () => {
  assert.equal(decide(m("dead_table", { populated: 0 }), config).status, "confirmed", "populated 0 proves it dead: reading it raises an error, so there is no count to decide on");
});

test("a verdict names the table its numbers were measured over when its measurement does, and none otherwise", () => {
  const duplicate = decide({ ...m("duplicate_entity", { total: 80, matched: 70, sharedColumns: 5, overlap: 0.875 }), over: "products" }, config);
  assert.equal(duplicate.measurement.over, "products", "the writer is told by name whose rows the overlap is a share of");
  assert.ok(!("over" in decide(m("dead_table", { count: 0 }), config).measurement), "a measurement that names no table gives the verdict none");
});

test("inconsistent_values: any canonical-form collision confirms", () => {
  assert.equal(decide(m("inconsistent_values", { distinctValues: 5, canonicalForms: 3, collisions: 2 }), config).status, "confirmed");
  assert.equal(decide(m("inconsistent_values", { distinctValues: 3, canonicalForms: 3, collisions: 0 }), config).status, "rejected");
});

test("duplicate_entity: overlap at or above config confirms", () => {
  assert.equal(decide(m("duplicate_entity", { overlap: config.duplicateOverlap }), config).status, "confirmed");
  assert.equal(decide(m("duplicate_entity", { overlap: 0.875 }), config).status, "confirmed");
  assert.equal(decide(m("duplicate_entity", { overlap: 0.1 }), config).status, "rejected");
});

test("duplicate_entity: two views with the same definition are confirmed, and with different ones rejected", () => {
  assert.equal(decide(m("duplicate_entity", { sameDefinition: 1 }), config).status, "confirmed", "the same query holds the same rows, read or not");
  assert.equal(decide(m("duplicate_entity", { sameDefinition: 0 }), config).status, "rejected", "a different query is another relation, whatever rows the two share");
});

test("missing_key: from the schema", () => {
  assert.equal(decide(m("missing_key", { hasPrimaryKey: 0 }), config).status, "confirmed");
  assert.equal(decide(m("missing_key", { hasPrimaryKey: 1 }), config).status, "rejected");
});

test("other kinds are unverifiable", () => {
  assert.equal(decide(m("other", {}), config).status, "unverifiable");
});

test("verdicts carry the query and the numbers so a human can rerun them", () => {
  const v = decide(m("relationship", { total: 500, hits: 440, orphans: 60, hit: 0.88 }), config);
  assert.equal(v.measurement.query, "SELECT 1");
  assert.deepEqual(v.measurement.numbers, { total: 500, hits: 440, orphans: 60, hit: 0.88 });
});

test("exit code is 2 for a broken relationship or a confirmed suspicion, else 0", () => {
  const base: Verified = { version: 1, database: "x", relations: "1 table", claims: { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, verdicts: {}, fitsInContext: true, tables: [] };
  const ok = { ...base, verdicts: { "relationship:a": { status: "confirmed" as const, measurement: { query: "", numbers: {} } } } };
  const broken = { ...base, verdicts: { "relationship:a": { status: "broken" as const, measurement: { query: "", numbers: {} } } } };
  const sus = { ...base, verdicts: { "suspicion:dead_table:cars": { status: "confirmed" as const, measurement: { query: "", numbers: {} } } } };
  const rejectedSus = { ...base, verdicts: { "suspicion:dead_table:cars": { status: "rejected" as const, measurement: { query: "", numbers: {} } } } };
  assert.equal(exitCode(ok), 0);
  assert.equal(exitCode(broken), 2);
  assert.equal(exitCode(sus), 2);
  assert.equal(exitCode(rejectedSus), 0);
});

const relation = (name: string, kind: Table["kind"], partitions?: Table["partitions"]): Table => ({
  name,
  schema: "public",
  kind,
  ...(partitions ? { partitions } : {}),
  rowEstimate: 0,
  primaryKey: null,
  foreignKeys: [],
  columns: [],
  samples: [],
});

test("relations are named by kind", () => {
  assert.equal(describeKinds([relation("a", "table"), relation("b", "table")]), "2 tables");
  assert.equal(describeKinds([relation("a", "table"), relation("v", "view"), relation("m", "materialized view")]), "1 table, 1 view, 1 materialized view");
  assert.equal(describeKinds([relation("e", "table", { count: 2, withLocalForeignKeys: 0 })]), "1 table, 1 partitioned");
  assert.equal(describeKinds([]), "no relations");
});

test("assemble counts the relations for the writer, and says how many were left out", () => {
  const claims: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [] };
  const extract: Extract = {
    database: "shop",
    tables: [relation("orders", "table"), relation("customers", "table"), relation("shipped_orders", "view")],
    skipped: [],
    schemaTokens: 10,
    unmatchedReveal: [],
  };
  assert.equal(assemble(extract, claims, [], config).relations, "2 tables, 1 view");
  assert.equal(assemble({ ...extract, skipped: ["a", "b"] }, claims, [], config).relations, "2 tables, 1 view, 2 not examined");
});

test("fitsInContext is measured in tokens against config, and never true when tables were skipped", () => {
  const e = (schemaTokens: number, skipped: string[] = []): Extract => ({ database: "x", tables: [], skipped, schemaTokens, unmatchedReveal: [] });
  assert.equal(fitsInContext(e(config.fitsInContextTokens), config), true);
  assert.equal(fitsInContext(e(config.fitsInContextTokens + 1), config), false);
  assert.equal(fitsInContext(e(10, ["big"]), config), false);
});

test("assemble carries where each row estimate came from to the writer, and nothing for a size with no source", () => {
  const claims: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [] };
  const extract: Extract = {
    database: "shop",
    tables: [{ ...relation("fresh_big", "table"), rowEstimate: 279_815, estimateSource: "pilot" }, { ...relation("ev", "table"), rowEstimate: 300_000, estimateSource: "partitions" }, relation("orders", "table")],
    skipped: [],
    schemaTokens: 10,
    unmatchedReveal: [],
  };
  const [pilot, partitions, counted] = assemble(extract, claims, [], config).tables;
  assert.equal(pilot!.estimateSource, "pilot");
  assert.equal(partitions!.estimateSource, "partitions");
  assert.ok(!("estimateSource" in counted!), "a count, or an unknown size, has none");
});

test("assemble gives the writer a relation's comment with that relation's facts, and no comment to one without", () => {
  const claims: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [] };
  const extract: Extract = {
    database: "shop",
    tables: [{ ...relation("vehicles", "table"), comment: "Replaced the old cars table." }, relation("cars", "table")],
    skipped: [],
    schemaTokens: 10,
    unmatchedReveal: [],
  };
  const [vehicles, cars] = assemble(extract, claims, [], config).tables;
  assert.equal(vehicles!.comment, "Replaced the old cars table.", "the comment is on vehicles, so it goes with vehicles' facts");
  assert.ok(!("comment" in cars!), "cars has none, and its facts carry no comment key");
});
