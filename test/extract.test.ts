import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { estimateRows, extract, fitToContext, isCategorical, readCatalog, type Size } from "../src/extract.js";
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
const sized = async (estimate: number, stats: QueryResult) => {
  const db = oneTable(estimate, stats);
  return (await extract(db, config, await readCatalog(db), { samples: false, reveal: new Set() })).tables[0]!.rowEstimate;
};

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

/** estimateRows at 100 pilot pages, with a pilot that counts n rows, or fails when n is undefined; and the percents it was asked for. */
async function estimate(size: Size & { leaves?: Size[] }, n?: number) {
  const asked: number[] = [];
  const sized = await estimateRows(size, 100, async (percent) => {
    asked.push(percent);
    return n;
  });
  return { ...sized, asked };
}

test("a table or materialized view whose estimate is known keeps the catalog's, and no pilot runs", async () => {
  assert.deepEqual(await estimate({ estimate: 500_000, pages: 3_000 }), { rowEstimate: 500_000, estimateSource: "catalog", asked: [] });
  assert.deepEqual(await estimate({ estimate: 0, pages: 0 }), { rowEstimate: 0, estimateSource: "catalog", asked: [] }, "0 with nothing on disk is an empty table, not an unknown one");
});

test("a partitioned table whose leaves all have an estimate is their sum, whatever its own reltuples says", async () => {
  const leaves = [{ estimate: 100_000, pages: 541 }, { estimate: 100_000, pages: 541 }, { estimate: 100_000, pages: 565 }];
  const partitions = { rowEstimate: 300_000, estimateSource: "partitions", asked: [] };
  assert.deepEqual(await estimate({ estimate: -1, pages: 0, leaves }), partitions, "never analyzed, Postgres 14 and later");
  assert.deepEqual(await estimate({ estimate: 0, pages: 0, leaves }), partitions, "never analyzed, Postgres 12 and 13");
  assert.deepEqual(await estimate({ estimate: 1_234, pages: 0, leaves }), partitions, "analyzed once, long ago");
  assert.deepEqual(await estimate({ estimate: -1, pages: 0, leaves: [] }), { rowEstimate: 0, estimateSource: "partitions", asked: [] }, "no partitions, no rows");
});

test("leaves without an estimate take the known leaves' rows per page, or a pilot over every leaf's pages when no known leaf has one", async () => {
  const analyzed = { estimate: 100_000, pages: 500 };
  assert.deepEqual(await estimate({ estimate: -1, pages: 0, leaves: [analyzed, { estimate: -1, pages: 250 }] }), { rowEstimate: 150_000, estimateSource: "partitions", asked: [] });
  assert.deepEqual(await estimate({ estimate: -1, pages: 0, leaves: [analyzed, { estimate: 0, pages: 250 }] }), { rowEstimate: 150_000, estimateSource: "partitions", asked: [] }, "0 over pages on disk is unknown too");
  assert.deepEqual(
    await estimate({ estimate: -1, pages: 0, leaves: [{ estimate: -1, pages: 300 }, { estimate: 0, pages: 200 }] }, 20_000),
    { rowEstimate: 100_000, estimateSource: "pilot", asked: [20] },
    "no known leaf: the parent's pages are its leaves'",
  );
  assert.deepEqual(
    await estimate({ estimate: -1, pages: 0, leaves: [{ estimate: 0, pages: 0 }, { estimate: -1, pages: 400 }] }, 10_000),
    { rowEstimate: 40_000, estimateSource: "pilot", asked: [25] },
    "an empty leaf has no rows per page to lend",
  );
});

test("a relation without an estimate is sized by a pilot over about pilotPages pages: rows per page on the pages read, times the pages", async () => {
  assert.deepEqual(await estimate({ estimate: -1, pages: 1_000 }, 5_000), { rowEstimate: 50_000, estimateSource: "pilot", asked: [10] }, "never analyzed, Postgres 14 and later");
  assert.deepEqual(await estimate({ estimate: 0, pages: 1_000 }, 5_000), { rowEstimate: 50_000, estimateSource: "pilot", asked: [10] }, "never analyzed on 12 and 13, or analyzed empty and loaded since");
  assert.deepEqual(await estimate({ estimate: -1, pages: 40 }, 7_000), { rowEstimate: 7_000, estimateSource: "pilot", asked: [100] }, "fewer pages than the pilot reads: all of them");
  assert.deepEqual(await estimate({ estimate: -1, pages: 100_000 }, 5), { rowEstimate: 5_000, estimateSource: "pilot", asked: [0.1] }, "a file left large by a mass delete: the rows are counted, not assumed from the pages");
  assert.deepEqual(await estimate({ estimate: -1, pages: 1_000 }, 0), { rowEstimate: 0, estimateSource: "pilot", asked: [10] }, "no rows on the pages read");
});

test("no pages, or a pilot that failed, leaves the size unknown", async () => {
  assert.deepEqual(await estimate({ estimate: -1, pages: 0 }), { rowEstimate: -1, asked: [] }, "a view, an empty table never analyzed, or a partitioned table the listing gave no leaves for a foreign partition: nothing to read");
  assert.deepEqual(await estimate({ estimate: -1, pages: 1_000 }), { rowEstimate: -1, asked: [10] });
  assert.deepEqual(await estimate({ estimate: -1, pages: 0, leaves: [{ estimate: -1, pages: 0 }] }), { rowEstimate: -1, asked: [] });
});

/** A database listing the given relations, each with one integer column and no keys; answer replies to every statement, and asked collects them. */
function listing(relations: Row[], answer: (sql: string) => QueryResult): { db: Db; asked: string[] } {
  const asked: string[] = [];
  const catalog: Row[][] = [relations, relations.map((r) => ({ oid: r.oid, attnum: 1, name: "id", type: "integer", nullable: false, comment: null })), []];
  const db: Db = {
    database: "x",
    readOnlyProven: true,
    catalog: async () => ({ ok: true, rows: catalog.shift()! }),
    query: async (sql) => {
      asked.push(sql);
      return answer(sql);
    },
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
  };
  return { db, asked };
}
const relation = (oid: number, name: string, estimate: number, pages: number, extra: Row = {}): Row =>
  ({ oid, schema: "public", table: name, relkind: "r", is_partition: false, parent: null, populated: true, estimate, pages, leaves: null, comment: null, definition: null, ...extra });
const isPilot = (sql: string) => /^SELECT count\(\*\) AS n FROM "public"\."\w+" TABLESAMPLE/.test(sql);
const tablesOf = async (db: Db) => (await extract(db, config, await readCatalog(db), { samples: false, reveal: new Set() })).tables;
const plainForm = new RegExp(`FROM \\(SELECT \\* FROM "public"\\."\\w+" LIMIT ${config.sampleRows}\\) s$`);

test("a size the plain scan counted is a count, not an estimate: it drops the pilot's source, which a random sample keeps", async () => {
  // small fits in the pilot's 100 pages, so the pilot counts all of it; the plain scan then counts it again.
  const { db } = listing([relation(1, "large", -1, 1_000), relation(2, "small", -1, 40)], (sql) =>
    isPilot(sql) ? { ok: true, rows: [{ n: sql.includes('"large"') ? 6_000 : 7_000 }] } : counted(7_000),
  );
  const [large, small] = await tablesOf(db);
  assert.equal(large!.rowEstimate, 60_000);
  assert.equal(large!.estimateSource, "pilot", "sampled at random, the size is still the pilot's");
  assert.equal(small!.rowEstimate, 7_000);
  assert.equal(small!.estimateSource, undefined, "counted, even though the pilot had the same number");
});

test("with the budget spent before the pilot, the size stays unknown and the sample takes the plain form, as before", async () => {
  const { db, asked } = listing([relation(1, "t", -1, 1_000)], () => ({ ok: false, reason: "budget", message: "time budget exhausted" }));
  const [t] = await tablesOf(db);
  assert.equal(t!.rowEstimate, -1);
  assert.equal(t!.estimateSource, undefined);
  assert.equal(asked.length, 2, "the pilot, then the statistics");
  assert.ok(isPilot(asked[0]!), asked[0]!);
  assert.match(asked[1]!, plainForm);
});

test("a pilot that finds no rows leaves the size to the plain scan, which counts it", async () => {
  const { db, asked } = listing([relation(1, "t", -1, 1_000)], (sql) => (isPilot(sql) ? { ok: true, rows: [{ n: 0 }] } : counted(1_234)));
  const [t] = await tablesOf(db);
  assert.equal(t!.rowEstimate, 1_234);
  assert.equal(t!.estimateSource, undefined);
  assert.match(asked[1]!, plainForm, "an estimate of 0 reads the plain form, which counts the relation");
});

test("when the sampled form is refused, the plain form measures the table, and an estimate the scan fills up under keeps its source", async () => {
  const leaves = [{ estimate: 40_000, pages: 200 }, { estimate: 30_000, pages: 150 }];
  const { db, asked } = listing([relation(1, "p", -1, 0, { relkind: "p", leaves })], (sql) =>
    /TABLESAMPLE/.test(sql) ? { ok: false, reason: "error", message: "this relation does not support TABLESAMPLE", sqlState: "0A000" } : counted(config.sampleRows),
  );
  const [p] = await tablesOf(db);
  assert.equal(p!.rowEstimate, 70_000);
  assert.equal(p!.estimateSource, "partitions");
  assert.deepEqual(asked.map((sql) => /TABLESAMPLE/.test(sql)), [true, false], "the sampled form, then the plain one");
  assert.match(asked[1]!, plainForm);
});

test("a dead-table count taken from the row estimate says where the estimate came from, or that there is none", () => {
  const big = (rowEstimate: number, estimateSource?: Table["estimateSource"]) =>
    deadTableQuery({ ...table("big", rowEstimate, [{ name: "id", type: "integer" }]), ...(estimateSource ? { estimateSource } : {}) }, config);
  assert.deepEqual(big(279_812, "pilot").fromSchema, { count: 279_812, exact: 0 });
  const undated = "; no date or timestamp column to date it by";
  assert.equal(big(279_812, "catalog").query, `-- from the schema: pg_class.reltuples for big${undated}`);
  assert.equal(big(279_812, "partitions").query, `-- from the schema: pg_class.reltuples of the leaf partitions of big${undated}`);
  assert.equal(big(279_812, "pilot").query, `-- from a pilot sample: count(*) over TABLESAMPLE SYSTEM on a few of the pages of big, scaled to all of them${undated}`);
  assert.equal(big(-1).query, `-- no row estimate for big${undated}`);
});

test("readCatalog reads three catalog statements and nothing inside the budget", async () => {
  const statements: string[] = [];
  const replies: Row[][] = [
    [relation(1, "events", 300, 0, { relkind: "p", leaves: [{ estimate: 300, pages: 3 }] }), relation(2, "events_2025", 300, 3, { is_partition: true, parent: 1 })],
    [1, 2].map((oid) => ({ oid, attnum: 1, name: "id", type: "integer", nullable: false, comment: null })),
    [{ oid: 1, contype: "p", conkey: [1], refoid: 0, confkey: null, local: true }],
  ];
  const db: Db = {
    database: "x",
    readOnlyProven: true,
    catalog: async (sql) => {
      statements.push(sql);
      return { ok: true, rows: replies.shift()! };
    },
    query: async (sql) => assert.fail(`a statement inside the budget: ${sql}`),
    budget: () => ({ budgetMs: 0, spentMs: 0, remainingMs: 0, exhausted: true }),
    close: async () => {},
  };
  assert.deepEqual(
    await readCatalog(db),
    [
      {
        name: "events",
        schema: "public",
        kind: "table",
        partitions: { count: 1, withLocalForeignKeys: 0 },
        primaryKey: ["id"],
        foreignKeys: [],
        columns: [{ name: "id", type: "integer", nullable: false }],
        size: { estimate: 300, pages: 0, leaves: [{ estimate: 300, pages: 3 }] },
      },
    ],
    "the partition folded into its parent, the columns and keys as the catalog has them, and the size not yet estimated",
  );
  assert.equal(statements.length, 3);
});

test("extract profiles only the relations of the catalog it is given", async () => {
  const { db, asked } = listing([relation(1, "a", 10, 1), relation(2, "b", 10, 1), relation(3, "c", 10, 1)], () => counted(10));
  const catalog = await readCatalog(db);
  const extracted = await extract(db, config, catalog.filter((r) => r.name === "b"), { samples: false, reveal: new Set() });
  assert.deepEqual(extracted.tables.map((t) => t.name), ["b"]);
  assert.deepEqual(extracted.skipped, [], "a relation left out of the catalog is not skipped: it was never asked for");
  assert.ok(asked.length > 0 && asked.every((sql) => sql.includes('"public"."b"')), asked.join("\n"));
});
