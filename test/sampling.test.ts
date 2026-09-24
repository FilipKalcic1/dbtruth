import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { config } from "../src/config.js";
import { doctor } from "../src/doctor.js";
import { extract } from "../src/extract.js";
import { connect, DESCRIBED_RELATIONS, sampleSource } from "../src/safety.js";
import type { Extract, Table } from "../src/schemas.js";
import { assemble } from "../src/verdict.js";
import { tableFile } from "../src/write.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const SAMPLING_URL = FIXTURE_URL.replace(/\/[^/]+$/, "/sampling");
const ROWS = 300_000;

/** One extract of the sampling database, as a full run takes it. */
async function sampled(): Promise<Extract> {
  const db = await connect(SAMPLING_URL, config);
  try {
    return await extract(db, config, { samples: true, reveal: new Set() });
  } finally {
    await db.close();
  }
}

const relation = (e: Extract, name: string): Table => e.tables.find((t) => t.name === name)!;
const values = (t: Table, column: string) => t.columns.find((c) => c.name === column)?.values ?? [];
const within = (estimate: number, share: number) => Math.abs(estimate - ROWS) <= ROWS * share;

test("the sampling fixture leaves fresh_big and ev without an estimate on this server, and ev's leaves with one", { timeout: 30_000 }, async () => {
  // Without this the tests below prove nothing: an index built after the load, or an ANALYZE of the whole database,
  // fills in the estimates, and then the catalog path, unchanged since 0.1.8, sizes both tables.
  const db = await connect(SAMPLING_URL, config);
  try {
    const r = await db.catalog(
      `SELECT c.relname AS name, c.reltuples::float8 AS estimate,
              coalesce((SELECT sum(pg_relation_size(t.relid)) FROM pg_partition_tree(c.oid) t), pg_relation_size(c.oid))::float8 AS bytes
         FROM pg_class c
        WHERE c.relname IN ('fresh_big', 'ev', 'ev_2024', 'ev_2025', 'ev_2026')
        ORDER BY 1`,
    );
    assert.ok(r.ok, !r.ok ? r.message : "");
    const estimates = Object.fromEntries(r.rows.map((row) => [row.name, { estimate: Number(row.estimate), bytes: Number(row.bytes) }]));
    for (const name of ["fresh_big", "ev"]) {
      const { estimate, bytes } = estimates[name]!;
      assert.ok(estimate === -1 || (estimate === 0 && bytes > 0), `${name}: reltuples ${estimate} over ${bytes} bytes on disk is an estimate`);
    }
    for (const leaf of ["ev_2024", "ev_2025", "ev_2026"]) assert.ok(estimates[leaf]!.estimate > 0, `${leaf} is analyzed`);
  } finally {
    await db.close();
  }
});

test("a never-analyzed large table is sized by a pilot sample and sampled across its whole file", { timeout: 30_000 }, async () => {
  const fresh = relation(await sampled(), "fresh_big");
  assert.ok(values(fresh, "status").includes("introduced_late"), `status ${JSON.stringify(values(fresh, "status"))}: the value of the last 5% of rows`);
  const batches = values(fresh, "batch").map(Number);
  assert.ok(batches.includes(1) && batches.includes(30), `batches ${JSON.stringify(batches)}: the first and the last of 30, in insertion order`);
  assert.match(sampleSource(fresh, config), /TABLESAMPLE SYSTEM/, "a random sample, not the oldest pages");
  assert.ok(within(fresh.rowEstimate, 0.2), `${fresh.rowEstimate} rows estimated for ${ROWS}`);
  assert.equal(fresh.estimateSource, "pilot");
});

test("a partitioned table whose parent was never analyzed is sized by its leaves and sampled across all partitions", { timeout: 30_000 }, async () => {
  const ev = relation(await sampled(), "ev");
  assert.ok(values(ev, "kind").includes("only_2026"), `kind ${JSON.stringify(values(ev, "kind"))}: the value only the 2026 leaf holds`);
  assert.deepEqual(ev.columns.find((c) => c.name === "happened_on")?.years, [2024, 2026], "the hidden date's years, from every partition");
  assert.match(sampleSource(ev, config), /TABLESAMPLE SYSTEM/, "a random sample, not the first partition");
  assert.ok(within(ev.rowEstimate, 0.2), `${ev.rowEstimate} rows estimated for ${ROWS}`);
  assert.equal(ev.estimateSource, "partitions");
  assert.deepEqual(ev.partitions, { count: 3, withLocalForeignKeys: 0 });
});

test("a sub-partitioned table is the sum of its leaves at every level, and sampled across all of them", { timeout: 30_000 }, async () => {
  const nested = relation(await sampled(), "nested");
  assert.equal(nested.rowEstimate, 200_000, "nested_1, and nested_2a and nested_2b one level further down");
  assert.equal(nested.estimateSource, "partitions");
  assert.ok(values(nested, "kind").includes("only_deep"), `kind ${JSON.stringify(values(nested, "kind"))}: the value only a second-level leaf holds`);
  assert.deepEqual(nested.partitions, { count: 2, withLocalForeignKeys: 0 }, "the partitions of nested itself");
});

test("a partitioned table with a foreign partition is sized and sampled as before 0.2.0, since TABLESAMPLE reads that partition whole", { timeout: 30_000 }, async () => {
  const mixed = relation(await sampled(), "mixed");
  assert.equal(mixed.estimateSource, undefined, "no pilot, which would count every row of mixed_remote as a sampled one");
  assert.equal(mixed.rowEstimate, -1, "the plain form filled up: at least the sample size");
  assert.doesNotMatch(sampleSource(mixed, config), /TABLESAMPLE/);
});

test("the listing opens no file the catalog has sized, so a table another session holds under an exclusive lock loses only its statistics", { timeout: 30_000 }, async () => {
  const other = new pg.Client({ connectionString: SAMPLING_URL });
  await other.connect();
  try {
    // ONLY: the parent alone, as DETACH PARTITION holds it. A partition under that lock holds pg_partition_tree, and the listing with it.
    await other.query("BEGIN");
    await other.query("LOCK TABLE ONLY ev, analyzed IN ACCESS EXCLUSIVE MODE");
    const locked = { ...config, statementTimeoutSeconds: 2 };
    const db = await connect(SAMPLING_URL, locked);
    try {
      const e = await extract(db, locked, { samples: false, reveal: new Set() });
      for (const [name, rowEstimate, estimateSource] of [["ev", 300_000, "partitions"], ["analyzed", 1_000, "catalog"]] as const) {
        const t = relation(e, name);
        assert.deepEqual([t.rowEstimate, t.estimateSource], [rowEstimate, estimateSource], `${name}: its statistics timed out, and its estimate stands`);
      }
    } finally {
      await db.close();
    }
  } finally {
    await other.end();
  }
});

test("the per-table file says when a size was estimated from a sample, and only then", { timeout: 30_000 }, async () => {
  const e = await sampled();
  const verified = assemble(e, { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, [], config);
  const file = (name: string) => tableFile(verified, verified.tables.find((t) => t.name === name)!);
  assert.equal(verified.tables.find((t) => t.name === "fresh_big")?.estimateSource, "pilot");
  assert.match(file("fresh_big"), new RegExp(`\\ntable, ~${Math.round(relation(e, "fresh_big").rowEstimate)} rows \\(estimated from a sample\\), primary key: none\\n`));
  assert.match(file("ev"), /\ntable, 3 partitions, ~300000 rows, primary key: none\n/, "the leaves' catalog estimates are not a sample");
});

test("a partitioned table is not one of its own leaves: the fixture's events, analyzed whole, is the sum of its partitions", { timeout: 30_000 }, async () => {
  // The fixture's ANALYZE of the whole database gave the parent 300 rows of its own (on Postgres 16 and 18; 12 leaves it
  // at 0), and a sample smaller than 300 keeps the estimate from being replaced by a count.
  const db = await connect(FIXTURE_URL, config);
  try {
    const events = relation(await extract(db, { ...config, sampleRows: 100 }, { samples: false, reveal: new Set() }), "events");
    assert.equal(events.rowEstimate, 300);
    assert.equal(events.estimateSource, "partitions");
  } finally {
    await db.close();
  }
});

test("two runs give the same estimates and the same values", { timeout: 30_000 }, async () => {
  const [first, second] = [await sampled(), await sampled()];
  for (const name of ["fresh_big", "ev"]) {
    const [a, b] = [relation(first, name), relation(second, name)];
    assert.equal(a.rowEstimate, b.rowEstimate, `${name}: the pilot reads the same pages every run`);
    assert.deepEqual(
      a.columns.map((c) => c.values),
      b.columns.map((c) => c.values),
      `${name}: the sample reads the same pages every run`,
    );
  }
});

test("a temporary table is not the user's schema: neither the extract nor doctor lists another session's, nor the listing its own session's", { timeout: 30_000 }, async () => {
  const other = new pg.Client({ connectionString: SAMPLING_URL });
  await other.connect();
  try {
    await other.query("CREATE TEMP TABLE scratch (id integer)");
    const e = await sampled();
    assert.deepEqual(e.tables.map((t) => t.name).sort(), ["analyzed", "ev", "fresh_big", "mixed", "nested"]);
    const lines: string[] = [];
    await doctor({ url: SAMPLING_URL, flags: {}, cwd: mkdtempSync(join(tmpdir(), "dbtruth-sampling-")), env: {}, node: process.version, err: (line) => lines.push(line) });
    assert.ok(lines.includes("ok 5 relations readable, 0 not"), lines.join("\n"));
    // Behind a pooler that shares server sessions, dbtruth's session can hold another client's temporary tables.
    const own = await other.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE ${DESCRIBED_RELATIONS} AND c.relname = 'scratch'`);
    assert.equal(own.rowCount, 0, "the session that created it does not list it either");
  } finally {
    await other.end();
  }
});
