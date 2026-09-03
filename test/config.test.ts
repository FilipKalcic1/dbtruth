import { test } from "node:test";
import assert from "node:assert/strict";
import { config, effortFor, resolveConfig } from "../src/config.js";

test("effort follows schema size in auto mode, and a fixed setting overrides it", () => {
  assert.equal(effortFor(1_000, config), "low");
  assert.equal(effortFor(config.effortBands.low, config), "low", "the boundary belongs to the smaller band");
  assert.equal(effortFor(config.effortBands.low + 1, config), "medium");
  assert.equal(effortFor(config.effortBands.medium + 1, config), "high", "above every band");
  assert.equal(effortFor(1_000, { ...config, modelEffort: "xhigh" }), "xhigh");
});

test("effort comes from the flag, then the environment, and rejects anything unknown", () => {
  assert.equal(resolveConfig({ DBTRUTH_MODEL_EFFORT: "low" }).modelEffort, "low");
  assert.equal(resolveConfig({ DBTRUTH_MODEL_EFFORT: "low" }, { modelEffort: "max" }).modelEffort, "max", "the flag wins");
  assert.equal(resolveConfig({ DBTRUTH_MODEL_EFFORT: "auto" }).modelEffort, "auto");
  assert.equal(resolveConfig({}).modelEffort, config.modelEffort);
  assert.throws(() => resolveConfig({ DBTRUTH_MODEL_EFFORT: "turbo" }), /DBTRUTH_MODEL_EFFORT/);
});

test("numbers come from the environment and flags, flags win, non-numbers are refused", () => {
  const c = resolveConfig({ DBTRUTH_SAMPLE_ROWS: "100", DBTRUTH_JOIN_BROKEN: "0.6" }, { sampleRows: "200" });
  assert.equal(c.sampleRows, 200);
  assert.equal(c.join.broken, 0.6);
  assert.equal(c.join.confirmed, config.join.confirmed, "untouched values keep their defaults");
  assert.throws(() => resolveConfig({ DBTRUTH_BUDGET_SECONDS: "soon" }), /not a number/);
  assert.deepEqual(config.join, { confirmed: 0.95, broken: 0.5 }, "resolveConfig never mutates the defaults");
  assert.deepEqual(config.effortBands, { low: 4_000, medium: 12_000 });
});

test("every override is checked against its range, and the invariants between tunables hold", () => {
  assert.throws(() => resolveConfig({ DBTRUTH_STATEMENT_TIMEOUT_SECONDS: "0" }), /below the minimum/, "zero would disable the timeout in Postgres");
  assert.throws(() => resolveConfig({ DBTRUTH_SAMPLE_ROWS: "2.5" }), /whole number/);
  assert.throws(() => resolveConfig({ DBTRUTH_JOIN_CONFIRMED: "1.5" }), /above the maximum/);
  assert.throws(() => resolveConfig({ DBTRUTH_JOIN_BROKEN: "0.99" }), /must not exceed join\.confirmed/, "the broken band cannot sit above the confirmed one");
  assert.throws(() => resolveConfig({ DBTRUTH_SAMPLE_ROWS: "10" }), /sampleRowsShown/, "cannot show more rows than are sampled");
  assert.throws(() => resolveConfig({ DBTRUTH_EFFORT_LOW_UP_TO_TOKENS: "20000" }), /effortBands\.low/);
  assert.equal(resolveConfig({ DBTRUTH_EFFORT_LOW_UP_TO_TOKENS: "100" }).effortBands.low, 100);
  assert.equal(resolveConfig({ DBTRUTH_EXTRACT_BUDGET_SHARE: "0.9" }).extractBudgetShare, 0.9);
  assert.throws(() => resolveConfig({ DBTRUTH_EXTRACT_BUDGET_SHARE: "2" }), /above the maximum/);
});
