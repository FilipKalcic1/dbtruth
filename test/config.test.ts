import { test } from "node:test";
import assert from "node:assert/strict";
import { config, effortFor, resolveConfig } from "../src/config.js";

test("effort follows schema size in auto mode, and a fixed setting overrides it", () => {
  const [small, mid] = config.modelEffortBands;
  assert.equal(effortFor(1_000, config), "low");
  assert.equal(effortFor(small!.upToSchemaTokens, config), "low", "the boundary belongs to the smaller band");
  assert.equal(effortFor(small!.upToSchemaTokens + 1, config), "medium");
  assert.equal(effortFor(mid!.upToSchemaTokens + 1, config), "high", "above every band");
  assert.equal(effortFor(1_000, { ...config, modelEffort: "xhigh" }), "xhigh");
  assert.equal(effortFor(1_000, { ...config, modelEffort: "auto", modelEffortBands: [] }), "high");
});

test("DBTRUTH_MODEL_EFFORT accepts auto or a level and rejects anything else", () => {
  assert.equal(resolveConfig({ DBTRUTH_MODEL_EFFORT: "low" }).modelEffort, "low");
  assert.equal(resolveConfig({ DBTRUTH_MODEL_EFFORT: "auto" }).modelEffort, "auto");
  assert.equal(resolveConfig({}).modelEffort, config.modelEffort);
  assert.throws(() => resolveConfig({ DBTRUTH_MODEL_EFFORT: "turbo" }), /DBTRUTH_MODEL_EFFORT/);
});

test("numbers come from the environment and flags, flags win, non-numbers are refused", () => {
  const c = resolveConfig({ DBTRUTH_SAMPLE_ROWS: "10", DBTRUTH_JOIN_BROKEN: "0.6" }, { sampleRows: "20" });
  assert.equal(c.sampleRows, 20);
  assert.equal(c.join.broken, 0.6);
  assert.equal(c.join.confirmed, config.join.confirmed, "untouched values keep their defaults");
  assert.throws(() => resolveConfig({ DBTRUTH_BUDGET_SECONDS: "soon" }), /not a number/);
  assert.deepEqual(config.join, { confirmed: 0.95, broken: 0.5 }, "resolveConfig never mutates the defaults");
});
