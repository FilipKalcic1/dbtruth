import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { extract, fitToContext, isCategorical } from "../src/extract.js";
import type { Db, QueryResult, Row } from "../src/safety.js";
import type { Extract, Table } from "../src/schemas.js";
import { deadTableQuery } from "../src/verify.js";

test("categorical means few, short, and repeating values, whatever the type", () => {
  assert.equal(isCategorical({ nonNull: 250, distinct: 4, maxLength: 2 }, config), true, "country codes");
  assert.equal(isCategorical({ nonNull: 40, distinct: 40, maxLength: 17 }, config), false, "40 emails in a 40-row table: every row distinct, an identifier");
  assert.equal(isCategorical({ nonNull: 40, distinct: 3, maxLength: 9 }, config), true, "three statuses in a 40-row table");
  assert.equal(isCategorical({ nonNull: 0, distinct: 0, maxLength: 0 }, config), false, "an empty sample proves nothing, so nothing is shown");
  assert.equal(isCategorical({ nonNull: 250, distinct: 1, maxLength: 32 }, config), false, "a constant 32-character value is a secret, not a category");
  assert.equal(isCategorical({ nonNull: 250, distinct: 51, maxLength: 5 }, config), false, "one over the distinct limit");
  assert.equal(isCategorical({ nonNull: 1, distinct: 1, maxLength: 5 }, config), false, "a single row repeats nothing");
});

function table(name: string, rowEstimate: number, columns: { name: string; type: string }[]): Table {
  return {
    name,
    schema: "public",
    kind: "table",
    rowEstimate,
    primaryKey: null,
    foreignKeys: [],
    columns: columns.map((c) => ({ ...c, nullable: true, nullRate: 0, distinct: 0, maxLength: 0, visible: false })),
    samples: [],
  };
}

test("the dead-table statement is always an aggregate, or no statement at all", () => {
  const small = deadTableQuery(table("t", 200, [{ name: "id", type: "integer" }]), config);
  assert.match(small.query, /count\(\*\)::float8 AS count/);
  assert.equal(small.exact, true);

  const big = deadTableQuery(table("t", 2_000_000, [{ name: "id", type: "integer" }]), config);
  assert.deepEqual(big.fromSchema, { count: 2_000_000, exact: 0 }, "no timestamp column and too big to count: the estimate answers, no query runs");

  const unknown = deadTableQuery(table("t", -1, [{ name: "id", type: "integer" }]), config);
  assert.deepEqual(unknown.fromSchema, { exact: 0 }, "unknown size and nothing to date it by: nothing to decide on");

  const dated = deadTableQuery(table("t", 2_000_000, [{ name: "created_at", type: "timestamp with time zone" }]), config);
  assert.equal(dated.fromSchema, undefined);
  assert.match(dated.query, /2000000::float8 AS count/);
  assert.match(dated.query, /max\("created_at"\)/, "an aggregate, so one row comes back however big the table is");
  assert.doesNotMatch(dated.query, /count\(\*\)/);

  const arrays = deadTableQuery(table("t", 10, [{ name: "dates", type: "date[]" }]), config);
  assert.doesNotMatch(arrays.query, /max\("dates"\)/, "an array of dates is not a date column");
});

/** A database with one integer-column relation at the given catalog estimate, answering every statement over it the same way. */
function oneTable(estimate: number, stats: QueryResult): Db {
  const catalog: Row[][] = [
    [{ oid: 1, schema: "public", table: "t", relkind: "r", is_partition: false, parent: null, populated: true, estimate, comment: null, definition: null }],
    [{ oid: 1, attnum: 1, name: "id", type: "integer", nullable: false, comment: null }],
    [],
  ];
  return {
    database: "x",
    readOnlyProven: true,
    catalog: async () => ({ ok: true, rows: catalog.shift()! }),
    query: async () => stats,
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
  };
}
const counted = (n: number): QueryResult => ({ ok: true, rows: [{ n, nn0: n, d0: n, l0: 5 }] });
const failed: QueryResult = { ok: false, reason: "timeout", message: "canceling statement due to statement timeout" };
const sized = async (estimate: number, stats: QueryResult) => (await extract(oneTable(estimate, stats), config, { samples: false, reveal: new Set() })).tables[0]!.rowEstimate;

test("the row estimate after the scan: a short plain scan counts, a full one proves at least the sample size, a random sample keeps the catalog's word", async () => {
  assert.equal(await sized(0, counted(7)), 7, "a plain scan that came back short counted the relation");
  assert.equal(await sized(0, counted(config.sampleRows)), -1, "a stale catalog 0 does not survive a scan that filled the sample");
  assert.equal(await sized(-1, counted(config.sampleRows)), -1, "never analyzed, at least the sample size");
  assert.equal(await sized(config.sampleRows, counted(config.sampleRows)), config.sampleRows, "an estimate the scan agrees with stands");
  assert.equal(await sized(60_000, counted(60_001)), 60_000, "a random sample larger than its estimate is sampling variance, not a count");
  assert.equal(await sized(60_000, counted(0)), 0, "an empty random sample is settled by the plain form");
  assert.equal(await sized(0, failed), -1, "statistics unavailable: a catalog 0 that nothing confirmed is not a count");
  assert.equal(await sized(500, failed), 500, "statistics unavailable: a positive estimate stands");
});

test("fitToContext drops sample rows, then value lists, then tables, until the extract fits", () => {
  const wide = (name: string): Table => ({
    ...table(name, 100, [{ name: "id", type: "integer" }, { name: "kind", type: "text" }]),
    columns: [
      { name: "id", type: "integer", nullable: false, nullRate: 0, distinct: 100, maxLength: 3, visible: true },
      { name: "kind", type: "text", nullable: false, nullRate: 0, distinct: 3, maxLength: 5, visible: true, values: ["a", "b", "c"] },
    ],
    samples: Array.from({ length: 15 }, (_, i) => ({ id: i, kind: "x".repeat(200) })),
  });
  const extract: Extract = { database: "d", tables: [wide("a"), wide("b"), wide("c")], skipped: [], schemaTokens: 100, unmatchedReveal: [] };
  const size = (e: Extract) => JSON.stringify(e).length / config.charsPerToken;

  assert.equal(fitToContext(extract, config).reduced, undefined, "fits: untouched");

  const noSamples = fitToContext(extract, { ...config, modelMaxInputTokens: Math.ceil(size(extract)) - 1 });
  assert.match(noSamples.reduced!, /sample rows dropped/);
  assert.ok(noSamples.extract.tables.every((t) => t.samples.length === 0));
  assert.ok(noSamples.extract.tables.every((t) => t.columns[1]!.values !== undefined), "value lists survive the first tier");

  const noValues = fitToContext(extract, { ...config, modelMaxInputTokens: Math.ceil(size(noSamples.extract)) - 1 });
  assert.match(noValues.reduced!, /value lists dropped/);
  assert.ok(noValues.extract.tables.every((t) => t.columns[1]!.values === undefined));

  const fewer = fitToContext(extract, { ...config, modelMaxInputTokens: Math.ceil(size(noValues.extract)) - 1 });
  assert.match(fewer.reduced!, /1 tables dropped/);
  assert.deepEqual(fewer.extract.skipped, ["c"], "tables go from the end of the list into skipped");
  assert.equal(fewer.extract.tables.length, 2);
});
