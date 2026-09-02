import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { decide, exitCode, fitsInContext } from "../src/verdict.js";
import type { Extract, Measurement, Verified } from "../src/schemas.js";

const m = (kind: Measurement["kind"], numbers: Record<string, number>, skipped?: string): Measurement => ({
  claimId: `${kind === "relationship" ? "relationship" : "suspicion"}:x`,
  kind,
  query: "SELECT 1",
  numbers,
  ...(skipped ? { skipped } : {}),
});

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

test("dead_table: empty or stale is confirmed, otherwise rejected", () => {
  assert.equal(decide(m("dead_table", { count: 0 }), config).status, "confirmed");
  assert.equal(decide(m("dead_table", { count: 10, ageDays: config.staleAfterDays + 1 }), config).status, "confirmed");
  assert.equal(decide(m("dead_table", { count: 10, ageDays: 1 }), config).status, "rejected");
  assert.equal(decide(m("dead_table", { count: 10 }), config).status, "rejected");
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
  const base: Verified = { version: 1, database: "x", claims: { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, verdicts: {}, fitsInContext: true, tables: [] };
  const ok = { ...base, verdicts: { "relationship:a": { status: "confirmed" as const, measurement: { query: "", numbers: {} } } } };
  const broken = { ...base, verdicts: { "relationship:a": { status: "broken" as const, measurement: { query: "", numbers: {} } } } };
  const sus = { ...base, verdicts: { "suspicion:dead_table:cars": { status: "confirmed" as const, measurement: { query: "", numbers: {} } } } };
  const rejectedSus = { ...base, verdicts: { "suspicion:dead_table:cars": { status: "rejected" as const, measurement: { query: "", numbers: {} } } } };
  assert.equal(exitCode(ok), 0);
  assert.equal(exitCode(broken), 2);
  assert.equal(exitCode(sus), 2);
  assert.equal(exitCode(rejectedSus), 0);
});

test("fitsInContext is measured in tokens against config, and never true when tables were skipped", () => {
  const e = (schemaTokens: number, skipped: string[] = []): Extract => ({ database: "x", tables: [], skipped, schemaTokens });
  assert.equal(fitsInContext(e(config.fitsInContextTokens), config), true);
  assert.equal(fitsInContext(e(config.fitsInContextTokens + 1), config), false);
  assert.equal(fitsInContext(e(10, ["big"]), config), false);
});
