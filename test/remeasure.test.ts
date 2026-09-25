import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { COMMENT_MARKER, remeasure, type FailOn } from "../src/check.js";
import { run, runCheck, type RunOptions } from "../src/cli.js";
import { config, type Overrides } from "../src/config.js";
import { connect, type Db } from "../src/safety.js";
import { CheckReportSchema, relationshipId, suspicionId, type CheckReport, type Snapshot } from "../src/schemas.js";
import { readSnapshot, serialize } from "../src/snapshot.js";
import { cannedClaims, fakeModel } from "./canned.js";
import { copyOfFixture } from "./copies.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const FIXTURE_SNAPSHOT = fileURLToPath(new URL("../scripts/make-fixture-snapshot.mjs", import.meta.url));
const SNAPSHOT = "context/snapshot.json";
const CANARY = /canary-pii/i;
// Each test makes a copy of fixture_template and runs dbtruth on it at least twice.
const LIMIT = { timeout: 60_000 };
const FIX = "run npx dbtruth and commit context/";
const SCHEMA_CHANGED = "note the schema changed since the snapshot";

/** An offline full run on url into a new directory, which it returns with context/snapshot.json in it. */
async function fullRun(url: string, claims: object = cannedClaims, opts: Partial<RunOptions> = {}): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-check-"));
  const err: string[] = [];
  const code = await run({ url, samples: true, reveal: [], json: false, flags: {}, cwd, env: {}, out: () => {}, err: (line) => err.push(line), ...opts }, { transport: fakeModel(claims).transport });
  assert.notEqual(code, 1, err.join("\n"));
  return cwd;
}

/** check of the snapshot in cwd against url, in this process: its exit code, its lines, and how long it took. No line may hold a hidden value. */
async function checkIn(cwd: string, url: string, flags: Overrides = {}, failOn: FailOn = "regression"): Promise<{ code: number; err: string[]; ms: number }> {
  const err: string[] = [];
  const started = performance.now();
  const code = await runCheck({ url, snapshot: SNAPSHOT, failOn, json: false, flags, cwd, env: {}, out: () => {}, err: (line) => err.push(line) });
  const ms = performance.now() - started;
  for (const line of err) assert.doesNotMatch(line, CANARY);
  return { code, err, ms };
}

/** The snapshot in cwd, as check reads it. */
function snapshotIn(cwd: string): Snapshot {
  const snapshot = readSnapshot(cwd, SNAPSHOT);
  if (typeof snapshot === "string") assert.fail(snapshot);
  return snapshot;
}

/** remeasure over a connection to url that records the statements it is asked to run, inside the budget and outside it. */
async function recorded(url: string, snapshot: Snapshot): Promise<{ report: CheckReport; queries: string[]; catalog: string[] }> {
  const db = await connect(url, config);
  const queries: string[] = [];
  const catalog: string[] = [];
  const recording: Db = {
    ...db,
    query: (sql, params) => (queries.push(sql), db.query(sql, params)),
    catalog: (sql, params) => (catalog.push(sql), db.catalog(sql, params)),
  };
  try {
    return { report: await remeasure(recording, config, snapshot), queries, catalog };
  } finally {
    await db.close();
  }
}

/**
 * `dbtruth <args>` as a user runs it, or another script under tsx, from cwd, with no database URL and no API key unless
 * env gives them; one that hangs is killed at 30 s.
 */
async function command(args: string[], cwd: string, env: Record<string, string> = {}, script = CLI): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const base = { ...process.env, DATABASE_URL: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" };
  const child = spawn(process.execPath, ["--import", TSX, script, ...args], { cwd, env: { ...base, ...env }, timeout: 30_000 });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const [status] = (await once(child, "close")) as [number | null];
  return { status, stdout, stderr };
}

/** The first n of the 60 customers the orphan orders point at, named with the canary as the fixture's customers are. */
const missingCustomers = (n: number) =>
  `INSERT INTO customers (id, full_name, email, country, created_at)
   SELECT 9000 + i, 'canary-pii Person ' || (9000 + i), 'person' || (9000 + i) || '@canary-pii.example', 'CZ', now()
     FROM generate_series(1, 500) AS i WHERE i % 25 < 3 ORDER BY i LIMIT ${n}`;

test("an unchanged database passes with identical numbers, in under 5 seconds", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  const { code, err, ms } = await checkIn(cwd, copy.url);
  assert.equal(code, 0);
  assert.deepEqual(err, [`check ${copy.name}: 12 unchanged`], "no note, and no line but the count");
  assert.ok(ms < 5_000, `check took ${Math.round(ms)} ms`);

  // Every verdict measured again, its query and numbers included, is the one the snapshot holds. remeasure is handed
  // the snapshot with its statuses alone, so the database is the only place it can take them from.
  const blank = (s: Snapshot): Snapshot => ({ ...s, verdicts: Object.fromEntries(Object.entries(s.verdicts).map(([id, v]) => [id, { ...v, measurement: { query: "", numbers: {} } }])) });
  const snapshot = snapshotIn(cwd);
  const { report } = await recorded(copy.url, blank(snapshot));
  assert.deepEqual(Object.fromEntries(report.claims.map((c) => [c.id, c.after])), snapshot.verdicts);

  // Sampled too: written with a sample of 100 rows, orders is read through TABLESAMPLE ... REPEATABLE, a part of its
  // 500 rows, and the snapshot's sample size and seed give the same pages again, whatever this run's settings are.
  const sampledCwd = await fullRun(copy.url, cannedClaims, { flags: { sampleRows: 100, sampleRowsShown: 10 } });
  const sampled = snapshotIn(sampledCwd);
  const orders = sampled.verdicts["relationship:orders.customer_id->customers.id"]!.measurement;
  assert.match(orders.query, /TABLESAMPLE SYSTEM \([\d.]+\) REPEATABLE/);
  assert.ok(orders.numbers.total! > 0 && orders.numbers.total! < 500, `${orders.numbers.total} of 500 orders sampled`);
  const again = await checkIn(sampledCwd, copy.url);
  assert.equal(again.code, 0);
  assert.deepEqual(again.err, ["note measured with the snapshot's settings, which differ from this run's: sampleRows 100 (this run 50000)", `check ${copy.name}: 12 unchanged`]);
  assert.deepEqual(Object.fromEntries((await recorded(copy.url, blank(sampled))).report.claims.map((c) => [c.id, c.after])), sampled.verdicts);
});

test("a broken foreign key is a regression, named with both hit rates", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  await copy.sql("ALTER TABLE order_items DROP CONSTRAINT order_items_order_id_fkey");
  // Every fifth line item now points past the last order: 240 of 1,200.
  await copy.sql("UPDATE order_items SET order_id = order_id + 1000 WHERE id % 5 = 0");
  const line = "regression relationship:order_items.order_id->orders.id: confirmed 100.0% -> broken 80.0%";

  const failed = await checkIn(cwd, copy.url);
  assert.equal(failed.code, 2);
  assert.deepEqual(failed.err, [SCHEMA_CHANGED, line, `check ${copy.name}: 1 regression, 11 unchanged`, FIX]);
  const never = await checkIn(cwd, copy.url, {}, "never");
  assert.equal(never.code, 0, "reported, and the build passes");
  assert.deepEqual(never.err, failed.err);

  // Four of every five: below the broken band, rejected, a regression from confirmed too.
  await copy.sql("UPDATE order_items SET order_id = order_id + 1000 WHERE id % 5 IN (1, 2, 3)");
  const rejected = await checkIn(cwd, copy.url);
  assert.equal(rejected.code, 2, rejected.err.join("\n"));
  assert.deepEqual(rejected.err, [SCHEMA_CHANGED, "regression relationship:order_items.order_id->orders.id: confirmed 100.0% -> rejected 20.0%", `check ${copy.name}: 1 regression, 11 unchanged`, FIX]);
});

test("a suspicion that comes true is a regression", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  // Each country is spelled one way in the fixture, so the full run rejects the suspicion.
  const countries = { kind: "inconsistent_values", tables: ["customers"], column: "country", detail: "CZ / cz" };
  const cwd = await fullRun(copy.url, { ...cannedClaims, suspicions: [...cannedClaims.suspicions, countries] });
  assert.equal(snapshotIn(cwd).verdicts["suspicion:inconsistent_values:customers.country"]?.status, "rejected");
  await copy.sql("UPDATE customers SET country = 'cz' WHERE id = 1");
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 2, err.join("\n"));
  assert.deepEqual(err, ["regression suspicion:inconsistent_values:customers.country: rejected -> confirmed", `check ${copy.name}: 1 regression, 12 unchanged`, FIX]);
});

test("a dropped table makes its claims and itself stale", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  await copy.sql("DROP TABLE cars");
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 2);
  assert.deepEqual(err, [
    SCHEMA_CHANGED,
    "stale relationship:cars.customer_id->customers.id: cars is not in the database",
    "stale suspicion:dead_table:cars: cars is not in the database",
    "stale suspicion:inconsistent_values:cars.make: cars is not in the database",
    "stale cars: in the context, not in the database",
    `check ${copy.name}: 4 stale, 9 unchanged`,
    FIX,
  ]);
});

test("a new table is stale", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  await copy.sql("CREATE TABLE added (id integer)");
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 2);
  assert.deepEqual(err, [SCHEMA_CHANGED, "stale added: in the database, not in the context", `check ${copy.name}: 1 stale, 12 unchanged`, FIX]);
});

test("the missing customers inserted: improved, reported, failing only under change", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  await copy.sql(missingCustomers(60));
  const lines = [`improved relationship:orders.customer_id->customers.id: broken 88.0% -> confirmed 100.0%`, `check ${copy.name}: 1 improved, 11 unchanged`, FIX];
  const passed = await checkIn(cwd, copy.url);
  assert.equal(passed.code, 0);
  assert.deepEqual(passed.err, lines);
  const failed = await checkIn(cwd, copy.url, {}, "change");
  assert.equal(failed.code, 2);
  assert.deepEqual(failed.err, lines);
});

test("drift fails only under change", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // 450 of 500 orders now find their customer: 90%, still broken, and two points up.
  await copy.sql(missingCustomers(10));
  const codes: Record<FailOn, number> = { regression: 0, change: 2, never: 0 };
  for (const [failOn, expected] of Object.entries(codes) as [FailOn, number][]) {
    const { code, err } = await checkIn(cwd, copy.url, {}, failOn);
    assert.equal(code, expected, failOn);
    assert.deepEqual(err, ["drift relationship:orders.customer_id->customers.id: broken 88.0% -> broken 90.0%", `check ${copy.name}: 1 drift, 11 unchanged`, FIX], failOn);
  }
});

test("an empty table that fills up changes its claims", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // Registered now, so that cars is alive whenever the fixture was loaded.
  await copy.sql("INSERT INTO cars SELECT id, vin, make, model, model_year, customer_id, now() FROM vehicles");
  const lines = [
    "improved suspicion:dead_table:cars: confirmed -> rejected",
    "changed relationship:cars.customer_id->customers.id: empty -> confirmed 100.0%",
    "changed suspicion:inconsistent_values:cars.make: empty -> rejected",
    `check ${copy.name}: 1 improved, 2 changed, 9 unchanged`,
    FIX,
  ];
  const passed = await checkIn(cwd, copy.url);
  assert.equal(passed.code, 0);
  assert.deepEqual(passed.err, lines);
  assert.equal((await checkIn(cwd, copy.url, {}, "change")).code, 2);
});

test("claims the budget leaves unmeasured never fail", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  const { code, err } = await checkIn(cwd, copy.url, { budgetSeconds: 0 }, "change");
  assert.equal(code, 0);
  // Every claim the full run measured; the one it could not was not measured either time.
  assert.equal(err.filter((line) => line.startsWith("not measured ")).length, 11, err.join("\n"));
  assert.deepEqual(err.slice(-1), [`check ${copy.name}: 11 not measured, 1 unchanged`], "and nothing to fix");
});

test("the snapshot's settings are the ones measured with", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // As if written with --join-confirmed 0.85, under which the 88% join is confirmed; this run's band is 0.95.
  const snapshot = snapshotIn(cwd);
  writeFileSync(join(cwd, SNAPSHOT), serialize({ ...snapshot, measuredWith: { ...snapshot.measuredWith, join: { ...snapshot.measuredWith.join, confirmed: 0.85 } } }));
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 0);
  assert.deepEqual(err, [
    "note measured with the snapshot's settings, which differ from this run's: join.confirmed 0.85 (this run 0.95)",
    "improved relationship:orders.customer_id->customers.id: broken 88.0% -> confirmed 88.0%",
    `check ${copy.name}: 1 improved, 11 unchanged`,
    FIX,
  ]);
});

test("a snapshot of another database is a note", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(FIXTURE_URL);
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 0);
  assert.deepEqual(err, [`note the snapshot is of database fixture; this is ${copy.name}`, `check ${copy.name}: 12 unchanged`]);
});

test("a claimed column that changes type is re-measured as text", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // Its foreign key goes first: Postgres keeps none between text and integer.
  await copy.sql("ALTER TABLE order_items DROP CONSTRAINT order_items_order_id_fkey, ALTER COLUMN order_id TYPE text");
  const { code, err } = await checkIn(cwd, copy.url);
  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, [SCHEMA_CHANGED, `check ${copy.name}: 12 unchanged`]);
  const { report } = await recorded(copy.url, snapshotIn(cwd));
  const claim = report.claims.find((c) => c.id === "relationship:order_items.order_id->orders.id")!;
  assert.deepEqual([claim.after.status, claim.after.measurement.numbers.hit], ["confirmed", 1], "every line item still finds its order");
  assert.match(claim.after.measurement.query, /"order_id"::text/, "compared as text, since text and the integer key have no = between them");
});

test("a snapshot with no claims is checked for staleness only", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url, {});
  const unchanged = await checkIn(cwd, copy.url);
  assert.equal(unchanged.code, 0);
  assert.deepEqual(unchanged.err, [`check ${copy.name}: no claims`]);
  await copy.sql("CREATE TABLE added (id integer)");
  const added = await checkIn(cwd, copy.url);
  assert.equal(added.code, 2);
  assert.deepEqual(added.err, [SCHEMA_CHANGED, "stale added: in the database, not in the context", `check ${copy.name}: 1 stale`, FIX]);
});

test("a hostile snapshot runs no SQL of its own", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // A real snapshot, edited as a pull request could edit it: two claims whose names are SQL, both said to be
  // confirmed, and every stored query one that would hold the connection for a minute.
  const real = snapshotIn(cwd);
  const table = 'orders"; DROP TABLE customers; --';
  const column = 'status" FROM orders; SELECT pg_sleep(60); --';
  const dropping = { from: { table, column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "stated" as const, confidence: 1, reason: "hostile" };
  const sleeping = { kind: "inconsistent_values" as const, tables: ["orders"], column, detail: "hostile" };
  const sleep = { query: "SELECT pg_sleep(60)", numbers: { hit: 1 } };
  const hostile: Snapshot = {
    ...real,
    claims: { ...real.claims, relationships: [...real.claims.relationships, dropping], suspicions: [...real.claims.suspicions, sleeping] },
    verdicts: {
      ...Object.fromEntries(Object.entries(real.verdicts).map(([id, v]) => [id, { ...v, measurement: { ...v.measurement, query: sleep.query } }])),
      [relationshipId(dropping)]: { status: "confirmed", measurement: sleep },
      [suspicionId(sleeping)]: { status: "confirmed", measurement: sleep },
    },
  };
  writeFileSync(join(cwd, SNAPSHOT), serialize(hostile));

  const { report, queries, catalog } = await recorded(copy.url, snapshotIn(cwd));
  for (const sql of [...queries, ...catalog]) {
    for (const words of ["pg_sleep", "DROP", table, column]) assert.ok(!sql.includes(words), `${words} in ${sql}`);
  }
  assert.deepEqual(
    report.claims.filter((c) => c.class === "stale").map((c) => [c.id, c.missing]),
    [[relationshipId(dropping), table], [suspicionId(sleeping), `orders.${column}`]],
  );
  // Below the 10 s statement timeout, so a pg_sleep that ran and was cancelled would fail here too.
  const { code, ms } = await checkIn(cwd, copy.url);
  assert.equal(code, 2);
  assert.ok(ms < 5_000, `check took ${Math.round(ms)} ms`);
  await assert.doesNotReject(copy.sql("SELECT FROM customers"), "customers is still there");
});

test("check profiles only the relations its claims name", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url, { relationships: [cannedClaims.relationships[0]] });
  const { report, queries } = await recorded(copy.url, snapshotIn(cwd));
  assert.deepEqual(report.claims.map((c) => [c.id, c.class]), [["relationship:orders.customer_id->customers.id", "unchanged"]]);
  assert.ok(queries.length > 0);
  for (const sql of queries) {
    const named = [...sql.matchAll(/"public"\."([^"]+)"/g)].map((m) => m[1]);
    assert.ok(named.length > 0 && named.every((name) => name === "orders" || name === "customers"), sql);
  }
});

test("check sends nothing to the Anthropic API and needs no key", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  // Where the API would be, a server that records every request made to it.
  const requests: string[] = [];
  const api = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(500).end();
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  try {
    // With a key, as in a CI job that also runs full dbtruth: without one the SDK would send nothing anyway.
    const keyed = { ANTHROPIC_API_KEY: "sk-ant-dummy", ANTHROPIC_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` };
    const { status, stdout, stderr } = await command(["check", "--url", copy.url], cwd, keyed);
    assert.equal(status, 0, stderr);
    assert.equal(stdout, "");
    assert.deepEqual(requests, []);
  } finally {
    api.close();
  }
  const keyless = await command(["check", "--url", copy.url], cwd);
  assert.equal(keyless.status, 0, keyless.stderr);
});

test("no hidden value reaches check's output or the snapshot, and stdout stays empty", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url, cannedClaims, { reveal: ["customers.email"] });
  assert.doesNotMatch(readFileSync(join(cwd, SNAPSHOT), "utf8"), CANARY);
  await copy.sql(missingCustomers(60));
  const { status, stdout, stderr } = await command(["check", "--url", copy.url, "--fail-on", "change"], cwd);
  assert.equal(status, 2, stderr);
  assert.equal(stdout, "");
  assert.match(stderr, /^improved relationship:orders\.customer_id->customers\.id: /m);
  assert.doesNotMatch(stderr, CANARY);
});

test("check runs as the reader role without a warning", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const reader = copy.url.replace("dbtruth:dbtruth@", "reader:reader@");
  const cwd = await fullRun(reader);
  const { code, err } = await checkIn(cwd, reader);
  assert.equal(code, 0);
  assert.deepEqual(err, [`check ${copy.name}: 12 unchanged`]);
});

/** What "a broken foreign key is a regression" does to the copy, in one statement: every fifth line item points past the last order. */
const REGRESSION = "ALTER TABLE order_items DROP CONSTRAINT order_items_order_id_fkey; UPDATE order_items SET order_id = order_id + 1000 WHERE id % 5 = 0";

test("check --json prints the report alone on stdout, and --markdown writes the comment the README shows", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url);
  await copy.sql(REGRESSION);
  const { status, stdout, stderr } = await command(["check", "--url", copy.url, "--json", "--markdown", "comment.md"], cwd);
  assert.equal(status, 2, stderr);
  // The whole of stdout is one JSON value, which JSON.parse refuses otherwise, and the schema describes all of it, the
  // format 1 included.
  const report = JSON.parse(stdout) as CheckReport;
  assert.deepEqual(CheckReportSchema.parse(report), report);
  assert.deepEqual([report.claims.map((c) => c.class).sort(), report.relations], [["regression", ...Array<string>(11).fill("unchanged")], []]);
  assert.equal(stderr, [SCHEMA_CHANGED, "regression relationship:order_items.order_id->orders.id: confirmed 100.0% -> broken 80.0%", `check ${copy.name}: 1 regression, 11 unchanged`, FIX, ""].join("\n"));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const section = /^## Keeping context true: dbtruth check$([\s\S]*?)^## /m.exec(readme)?.[1] ?? "";
  assert.equal(readFileSync(join(cwd, "comment.md"), "utf8"), /^```markdown\n([\s\S]*?)^```$/m.exec(section)?.[1], "the README's example comment");

  // A check that cannot run writes no comment, and prints nothing on stdout.
  const failed = await command(["check", "--url", copy.url, "--snapshot", "missing.json", "--json", "--markdown", "other.md"], cwd);
  assert.deepEqual([failed.status, failed.stdout, existsSync(join(cwd, "other.md"))], [1, "", false], failed.stderr);
});

test("no hidden value reaches --json or --markdown", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const cwd = await fullRun(copy.url, cannedClaims, { reveal: ["customers.email"] });
  await copy.sql(missingCustomers(60));
  await copy.sql(REGRESSION);
  const { status, stdout, stderr } = await command(["check", "--url", copy.url, "--json", "--markdown", "comment.md"], cwd);
  assert.equal(status, 2, stderr);
  const comment = readFileSync(join(cwd, "comment.md"), "utf8");
  assert.deepEqual(comment.split("\n").slice(0, 2), [COMMENT_MARKER, "dbtruth: 1 regression, 1 improved, 10 unchanged"]);
  for (const output of [stdout, stderr, comment]) assert.doesNotMatch(output, CANARY);
});

test("a comment that cannot be written stops check with exit 1 and no JSON", LIMIT, async () => {
  const cwd = await fullRun(FIXTURE_URL);
  const out: string[] = [];
  const err: string[] = [];
  // context/ is a directory, which no file can be written over.
  const code = await runCheck({ url: FIXTURE_URL, snapshot: SNAPSHOT, failOn: "regression", json: true, markdown: "context", flags: {}, cwd, env: {}, out: (line) => out.push(line), err: (line) => err.push(line) });
  assert.equal(code, 1, err.join("\n"));
  assert.deepEqual(out, [], "no JSON");
  assert.match(err.at(-1)!, /^could not write context: EISDIR/);
});

test("the fixture snapshot script writes a context/ that check passes on", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const root = mkdtempSync(join(tmpdir(), "dbtruth-fixture-"));
  // Into a directory that does not exist yet and with no API key, as the Action's tests run it. The fixture's broken
  // join makes the full run exit 2, which the script does not pass on.
  const { status, stderr } = await command(["project"], root, { DATABASE_URL: copy.url }, FIXTURE_SNAPSHOT);
  assert.equal(status, 0, stderr);
  const { code, err } = await checkIn(join(root, "project"), copy.url);
  assert.deepEqual([code, err], [0, [`check ${copy.name}: 12 unchanged`]], "check passes on the snapshot the script wrote in project/");
});

test("the fixture snapshot script fails when the run does, and says why", async () => {
  // DATABASE_URL set and empty, as a step whose variable is missing sets it: the run finds no URL and exits 1, and so
  // must the script, or the Action's tests would go on without a snapshot.
  const root = mkdtempSync(join(tmpdir(), "dbtruth-fixture-"));
  const { status, stderr } = await command(["project"], root, { DATABASE_URL: "" }, FIXTURE_SNAPSHOT);
  const reason = "no database URL: DATABASE_URL is not in the environment or in a .env";
  assert.deepEqual([status, stderr.split("\n")[0]], [1, reason], "the script exits 1 as the run did, with the run's reason on stderr");
});
