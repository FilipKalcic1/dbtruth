import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, type RunOptions } from "../src/cli.js";
import { config } from "../src/config.js";
import { readCatalog } from "../src/extract.js";
import type { Transport } from "../src/model.js";
import { connect } from "../src/safety.js";
import { relationshipId, suspicionId, type Claims, type Extract, type Verified } from "../src/schemas.js";
import { parseSnapshot, readSnapshot, schemaOf } from "../src/snapshot.js";
import { cannedClaims, fakeModel } from "./canned.js";
import { copyOfFixture } from "./copies.js";
import { writeUnreadable } from "./unreadable.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const TSX = import.meta.resolve("tsx");
const CLI = new URL("../src/cli.ts", import.meta.url);
const CANARY = /canary-pii/i;

test("the whole loop on the fixture, offline: verdicts, files, exit code, no personal data sent", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const out: string[] = [];
  const err: string[] = [];
  const model = fakeModel();

  const code = await run(
    { url: FIXTURE_URL, samples: true, reveal: [], json: true, flags: {}, cwd, env: {}, out: (l) => out.push(l), err: (l) => err.push(l) },
    { transport: model.transport },
  );

  assert.equal(code, 2, "broken join and confirmed suspicions exit 2");
  assert.match(
    err[0]!,
    /^Sending to claude-sonnet-5 at effort low \(by schema size, \d+ tokens\): 11 relations \(9 tables, 1 view, 1 materialized view, 1 partitioned\)/,
    "disclosure line comes first, on stderr, and names the effort",
  );
  assert.match(err[0]!, /high-cardinality columns hidden/);
  assert.ok(err.some((l) => /^contextualize: \d+ tables described, \d+ claims to test, [\d.]+s$/.test(l)), "one progress line per step");
  assert.ok(err.some((l) => /^verify: \d+ measurements, [\d.]+s$/.test(l)));
  assert.ok(err.some((l) => /^write: 13 files, [\d.]+s$/.test(l)), "README, ENTITIES and one file per relation");

  const verified = JSON.parse(out.join("\n")) as Verified; // stdout is the JSON and nothing else
  assert.equal(verified.version, 1);
  assert.equal(verified.database, "fixture");
  const v = verified.verdicts;

  const broken = v["relationship:orders.customer_id->customers.id"]!;
  assert.equal(broken.status, "broken");
  assert.equal(broken.measurement.numbers.hit, 0.88);
  assert.equal(broken.measurement.numbers.orphans, 60);
  assert.match(broken.measurement.query, /customer_id/);

  assert.equal(v["relationship:order_items.order_id->orders.id"]!.status, "confirmed");
  assert.equal(v["relationship:vehicles.model_year->customers.id"]!.status, "rejected");
  const nullable = v["relationship:customers.address->customers.full_name"]!;
  assert.equal(nullable.status, "rejected");
  assert.equal(nullable.measurement.numbers.nulls, 25, "every tenth address is null: counted apart, neither a hit nor an orphan");
  assert.equal(nullable.measurement.numbers.total, 225);
  assert.equal(nullable.measurement.numbers.orphans, 225);
  assert.equal(broken.measurement.numbers.nulls, 0);
  assert.equal(v["suspicion:dead_table:cars"]!.status, "confirmed");
  assert.equal(v["suspicion:dead_table:cars"]!.measurement.numbers.count, 0);
  assert.equal(v["suspicion:inconsistent_values:orders.status"]!.status, "confirmed");
  assert.equal(v["suspicion:inconsistent_values:orders.status"]!.measurement.numbers.collisions, 2);
  assert.equal(v["suspicion:duplicate_entity:products+products_legacy"]!.status, "confirmed");
  assert.equal(v["suspicion:duplicate_entity:products+products_legacy"]!.measurement.numbers.overlap, 0.875);
  assert.equal(v["suspicion:missing_key:audit_log"]!.status, "confirmed");
  assert.equal(v["suspicion:dead_table:order_totals"]!.status, "confirmed", "an unpopulated materialized view is dead, from the catalog");
  assert.equal(v["suspicion:dead_table:order_totals"]!.measurement.numbers.populated, 0);
  assert.equal(v["suspicion:other:customers"]!.status, "unverifiable", "a claim no measurement exists for is still open");
  assert.equal(verified.fitsInContext, true);

  const noRows = v["relationship:cars.customer_id->customers.id"]!;
  assert.equal(noRows.status, "empty");
  assert.equal(noRows.skipped, "no non-null rows to test");
  assert.deepEqual(noRows.measurement.numbers, {}, "nothing ran, so there are no numbers");
  assert.match(noRows.measurement.query, /^-- from the extract: cars has no rows/);
  assert.equal(v["suspicion:inconsistent_values:cars.make"]!.status, "empty", "an empty column is not proof that its values are consistent");
  assert.ok(
    err.some((l) => l === "empty: 2 claims with nothing to measure (2 no non-null rows to test)"),
    `the summary collapses them into one line: ${JSON.stringify(err.filter((l) => l.startsWith("empty")))}`,
  );

  assert.equal(verified.relations, "9 tables, 1 view, 1 materialized view, 1 partitioned");
  assert.ok(err.some((l) => l === `relations: ${verified.relations} (fits in an agent's context)`), "the summary reads the same count");
  assert.match(model.requests[1]!, /9 tables, 1 view, 1 materialized view, 1 partitioned/, "the writer is handed the count rather than deriving one");

  assert.deepEqual(verified.tables.find((t) => t.name === "orders")!.categorical.status!.slice().sort(), ["Pending", "SHIPPED", "cancelled", "pending", "shipped"]);

  assert.ok(existsSync(join(cwd, "context", "README.md")));
  assert.ok(existsSync(join(cwd, "context", "ENTITIES.md")));
  const tableFile = (name: string) => readFileSync(join(cwd, "context", "tables", `${name}.md`), "utf8");
  assert.match(tableFile("orders"), /\*\*BROKEN\*\* orders\.customer_id -> customers\.id: 88\.0% match \(440 of 500 sampled\), 60 orphans, all above the highest customers\.id \(inferred\)/, "rendered from the measurement, not the model's canned file");
  assert.deepEqual((/- status: (.*)\n/.exec(tableFile("orders"))?.[1] ?? "").split(", ").sort(), ['"Pending"', '"SHIPPED"', '"cancelled"', '"pending"', '"shipped"'], "every value, quoted");
  assert.match(tableFile("customers"), /orders\.customer_id -> customers\.id/, "a table the model wrote no file for has one, with its incoming join");
  assert.match(tableFile("order_totals"), /^# order_totals\n\nmaterialized view, no rows, primary key: none\n/);
  assert.ok(!existsSync(join(cwd, "escape.md")), "paths outside context/ are dropped");

  assert.equal(model.requests.length, 2, "one call per prompt when replies validate");
  for (const request of model.requests) assert.doesNotMatch(request, CANARY, "personal data must never be sent");
  assert.match(model.requests[0]!, /\[hidden\]/);
  assert.match(model.requests[0]!, /SHIPPED/, "categorical values are sent");

  const sent = JSON.parse((JSON.parse(model.requests[0]!) as { messages: { content: string }[] }).messages[0]!.content) as Extract;
  const customers = sent.tables.find((t) => t.name === "customers")!;
  const token = customers.columns.find((c) => c.name === "api_token")!;
  assert.equal(token.distinct, 1, "one value on every row");
  assert.equal(token.visible, false, "a constant secret is low-cardinality but long, so it stays hidden");
  assert.equal(token.values, undefined);
  assert.equal(customers.samples[0]!.api_token, "[hidden]");
  const events = sent.tables.find((t) => t.name === "events")!;
  assert.deepEqual(events.partitions, { count: 2, withLocalForeignKeys: 0 }, "a partitioned table stands for its partitions");
  assert.ok(!sent.tables.some((t) => t.name === "events_2025"), "partitions are not listed as tables");
  const view = sent.tables.find((t) => t.name === "shipped_orders")!;
  assert.equal(view.kind, "view");
  assert.match(view.definition!, /FROM orders/);
  assert.ok(view.rowEstimate > 0, "a view's size comes from its sample");
  const matview = sent.tables.find((t) => t.name === "order_totals")!;
  assert.equal(matview.kind, "materialized view");
  assert.equal(matview.populated, false);
  assert.equal(matview.samples.length, 0, "nothing can be read from it, so nothing is sent");

  // Visibility is one rule for every type: categorical, or a declared key. Nothing else.
  const column = (t: Extract["tables"][number], name: string) => t.columns.find((c) => c.name === name)!;
  const orders = sent.tables.find((t) => t.name === "orders")!;
  assert.equal(column(orders, "id").visible, true, "a primary key column is an identifier by declaration");
  assert.equal(column(orders, "customer_id").visible, false, "high-cardinality integer without a declared key: hidden like text");
  assert.equal(column(orders, "total_cents").visible, false);
  assert.equal(orders.samples[0]!.customer_id, "[hidden]");
  assert.equal(column(orders, "status").visible, true, "few short values: shown");
  const items = sent.tables.find((t) => t.name === "order_items")!;
  assert.equal(column(items, "order_id").visible, true, "a declared foreign key column is shown");
  const created = column(customers, "created_at");
  assert.equal(created.visible, false);
  assert.ok(Array.isArray(created.years) && created.years.length === 2 && created.years[0]! <= created.years[1]!, "a hidden timestamp keeps its year range");
  assert.equal(column(orders, "status").years, undefined, "only hidden date and timestamp columns carry years");

  for (const text of [...out, ...err, readFileSync(join(cwd, "context", "README.md"), "utf8")]) {
    assert.doesNotMatch(text, /dbtruth:dbtruth@/, "the database URL is never printed or written");
  }
  assert.ok(err.some((l) => l.includes("1 broken")), "summary names the broken relationship");
});

test("--no-samples sends statistics only", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const model = fakeModel();
  await run({ url: FIXTURE_URL, samples: false, reveal: [], json: false, flags: {}, cwd, env: {}, out: () => {}, err: () => {} }, { transport: model.transport });
  const first = JSON.parse(model.requests[0]!) as { messages: { content: string }[] };
  const extract = JSON.parse(first.messages[0]!.content) as { tables: { samples: unknown[]; columns: { values?: unknown }[] }[] };
  assert.ok(extract.tables.every((t) => t.samples.length === 0 && t.columns.every((c) => c.values === undefined)));
  assert.doesNotMatch(model.requests[0]!, CANARY);
});

test("--reveal shows exactly one hidden column, and reports an entry that names no column", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const model = fakeModel();
  const err: string[] = [];
  await run({ url: FIXTURE_URL, samples: true, reveal: ["customers.country", "nope.col"], json: false, flags: {}, cwd, env: {}, out: () => {}, err: (l) => err.push(l) }, { transport: model.transport });
  assert.ok(err.some((l) => l.startsWith("--reveal nope.col: no such column")), "a typo is reported");
  assert.ok(!err.some((l) => l.includes("customers.country: no such column")), "a real column is matched even when it is categorical anyway");
  const revealed = fakeModel();
  await run({ url: FIXTURE_URL, samples: true, reveal: ["customers.email"], json: false, flags: {}, cwd, env: {}, out: () => {}, err: () => {} }, { transport: revealed.transport });
  assert.doesNotMatch(model.requests[0]!, CANARY, "revealing a categorical column changes nothing");
  assert.match(revealed.requests[0]!, /@canary-pii\.example/, "revealing email sends email values, and only then");
  const first = JSON.parse(revealed.requests[0]!) as { messages: { content: string }[] };
  const extract = JSON.parse(first.messages[0]!.content) as { tables: { name: string; samples: Record<string, unknown>[] }[] };
  const customers = extract.tables.find((t) => t.name === "customers")!;
  assert.equal(customers.samples[0]!.full_name, "[hidden]");
});

test("a connection failure surfaces as one error that never contains the password", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const model = fakeModel();
  await assert.rejects(
    run({ url: "postgres://nobody:secret-password@localhost:1/none", samples: true, reveal: [], json: false, flags: {}, cwd, env: {}, out: () => {}, err: () => {} }, { transport: model.transport }),
    (e: unknown) => e instanceof Error && /could not connect/.test(e.message) && !e.message.includes("secret-password"),
  );
  assert.equal(model.requests.length, 0, "nothing is sent to the model when the database is unreachable");
});

test("the CLI exits 1 with a clear message when no API key can be resolved, before touching the database", () => {
  // Empty ANTHROPIC_API_KEY makes the SDK fail credential resolution client-side, so this needs no network.
  // The bad database URL proves the order: the API is checked first, so "could not connect" never appears.
  const result = spawnSync(process.execPath, ["--import", TSX, fileURLToPath(CLI), "--url", "postgres://nobody:pw@localhost:1/none"], {
    cwd: mkdtempSync(join(tmpdir(), "dbtruth-it-")),
    encoding: "utf8",
    env: { ...process.env, ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", DATABASE_URL: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no API key found/);
  assert.match(result.stderr, /ANTHROPIC_API_KEY/);
  assert.doesNotMatch(result.stderr, /Could not resolve authentication method/, "the SDK's own sentence, which names ways to sign in dbtruth does not use");
  assert.doesNotMatch(result.stderr, /could not connect/, "the database must not be touched before the API check");
  assert.doesNotMatch(result.stdout, /Sending to/);
});

test("the CLI exits 1 when no URL is configured", () => {
  const result = spawnSync(process.execPath, ["--import", TSX, fileURLToPath(CLI)], {
    cwd: mkdtempSync(join(tmpdir(), "dbtruth-it-")),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no database URL/);
});

/** A temporary repository, by its real path, whose root .env holds the given lines, with an empty packages/api to run from. */
function repository(dotEnv: string): { root: string; api: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-repo-")));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".env"), dotEnv);
  const api = join(root, "packages", "api");
  mkdirSync(api, { recursive: true });
  return { root, api };
}

// A URL nothing listens on: a source that must lose holds it, so a wrong order fails with "could not connect".
const UNREACHABLE = "postgres://nobody:pw@localhost:1/none";

test("from a nested package, the root .env is used and named on stderr before the disclosure line, never its values", async () => {
  const { root, api } = repository(`DATABASE_URL=${FIXTURE_URL}\nANTHROPIC_API_KEY=sk-canary-pii\n`);
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    { samples: true, reveal: [], json: true, flags: {}, cwd: api, env: {}, out: (l) => out.push(l), err: (l) => err.push(l) },
    { transport: fakeModel().transport },
  );
  assert.equal(code, 2, "the fixture's broken join, so the URL came from the root .env");
  assert.equal(err[0], `reading settings from ${join("..", "..", ".env")}`, "relative to the working directory");
  assert.match(err[1]!, /^Sending to /);
  // context/ goes where the command runs, as the README's Monorepos paragraph says, not beside the .env it read.
  assert.ok(existsSync(join(api, "context", "README.md")), "context/ in the package");
  assert.ok(!existsSync(join(root, "context")), "no context/ at the root");
  for (const line of [...out, ...err]) {
    assert.doesNotMatch(line, CANARY);
    assert.ok(!line.includes(FIXTURE_URL), line);
  }
});

test("precedence stays: the environment beats the .env found, and --url beats both; an empty variable still means unset", async () => {
  const { api } = repository(`DATABASE_URL=${UNREACHABLE}\n`);
  const base = { samples: true, reveal: [], json: false, flags: {}, cwd: api, out: () => {}, err: () => {} };
  assert.equal(await run({ ...base, env: { DATABASE_URL: FIXTURE_URL } }, { transport: fakeModel().transport }), 2);
  assert.equal(await run({ ...base, url: FIXTURE_URL, env: { DATABASE_URL: UNREACHABLE } }, { transport: fakeModel().transport }), 2);
  assert.equal(await run({ ...base, env: { DATABASE_URL: "" } }, { transport: fakeModel().transport }), 1, "no database URL: the empty value hides the .env's");
});

test("--dotenv reads that file only, relative to the working directory", async () => {
  const { root, api } = repository(`DATABASE_URL=${UNREACHABLE}\nANTHROPIC_MODEL=root-model\n`);
  mkdirSync(join(root, "settings"));
  writeFileSync(join(root, "settings", "fixture.env"), `DATABASE_URL=${FIXTURE_URL}\n`);
  const err: string[] = [];
  const code = await run(
    { dotenv: "../../settings/fixture.env", samples: true, reveal: [], json: false, flags: {}, cwd: api, env: {}, out: () => {}, err: (l) => err.push(l) },
    { transport: fakeModel().transport },
  );
  assert.equal(code, 2, "the root .env, which is not read, holds a URL nothing listens on");
  assert.equal(err[0], `reading settings from ${join("..", "..", "settings", "fixture.env")}`);
  assert.ok(!err.some((l) => l.includes("root-model")), "nor is any other setting of the root .env");
});

test("no value from a .env reaches stdout or stderr on any path that reads one, the errors included", async () => {
  // canary-pii in the password, the key and a variable dbtruth does not read, and where the connection fails, in the
  // user, the host and the database too: a failed connection is told in dbtruth's words, never the driver's.
  const secrets = "ANTHROPIC_API_KEY=sk-canary-pii\nSESSION_SECRET=canary-pii\n";
  const { root, api } = repository(`DATABASE_URL=${FIXTURE_URL}\n${secrets}`);
  writeUnreadable(join(api, ".env"), secrets);
  writeFileSync(join(root, "no-url.env"), secrets);
  writeFileSync(join(root, "refused.env"), `DATABASE_URL=postgres://canary-pii:canary-pii@localhost:1/canary-pii\n${secrets}`);
  writeFileSync(join(root, "not-found.env"), `DATABASE_URL=postgres://canary-pii:canary-pii@canary-pii.invalid/canary-pii\n${secrets}`);
  // A repository inside this one, with no .env of its own: the walk stops at its root, below the canary .env.
  const lib = join(root, "vendor", "lib");
  mkdirSync(join(lib, ".git"), { recursive: true });

  // Every line a run prints, on stdout or stderr, and the message main() prints when it throws.
  const printed = async (opts: Partial<RunOptions>): Promise<{ code?: number; lines: string[] }> => {
    const lines: string[] = [];
    const sink = (line: string) => lines.push(line);
    try {
      const code = await run({ samples: true, reveal: [], json: true, flags: {}, cwd: api, env: {}, out: sink, err: sink, ...opts }, { transport: fakeModel().transport });
      return { code, lines };
    } catch (e) {
      return { lines: [...lines, String(e)] };
    }
  };
  const runs = {
    fullRun: await printed({}),
    urlHidden: await printed({ env: { DATABASE_URL: "" } }),
    nothingFound: await printed({ cwd: lib }),
    namedWithoutUrl: await printed({ dotenv: "../../no-url.env" }),
    namedMissing: await printed({ dotenv: "nope.env" }),
    namedUnreadable: await printed({ dotenv: "." }),
    refused: await printed({ dotenv: "../../refused.env" }),
    notFound: await printed({ dotenv: "../../not-found.env" }),
  };

  // Each path was taken.
  const dotEnv = join("..", "..", ".env");
  assert.equal(runs.fullRun.code, 2);
  assert.match(runs.fullRun.lines[0]!, /^could not read \.env \((EACCES|EPERM): .+\)$/);
  assert.equal(runs.fullRun.lines[1], `reading settings from ${dotEnv}`);
  assert.ok(runs.fullRun.lines.includes("dbtruth: fixture"), "the database name, printed on purpose");
  assert.equal(runs.urlHidden.code, 1);
  assert.ok(runs.urlHidden.lines.includes(`no database URL: DATABASE_URL is not in the environment or in ${dotEnv}`));
  assert.equal(runs.nothingFound.code, 1);
  assert.equal(runs.nothingFound.lines[0], "no database URL: DATABASE_URL is not in the environment or in a .env");
  assert.equal(runs.namedWithoutUrl.code, 1);
  assert.equal(runs.namedWithoutUrl.lines[0], `reading settings from ${join("..", "..", "no-url.env")}`);
  assert.deepEqual(runs.namedMissing, { code: 1, lines: ["--dotenv nope.env: no such file"] });
  assert.match(runs.namedUnreadable.lines.at(-1)!, /EISDIR/);
  assert.match(runs.refused.lines.at(-1)!, /could not connect to the database: nothing is listening at the host and port in the URL; /);
  assert.match(runs.notFound.lines.at(-1)!, /could not connect to the database: the host in the URL was not found; /);

  for (const [name, { lines }] of Object.entries(runs)) {
    for (const line of lines) assert.doesNotMatch(line, CANARY, `${name} printed a value from a .env`);
  }
});

test("a clean database, offline: declared keys confirmed, nothing broken, fits in context, exit 0", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const out: string[] = [];
  const transport: Transport = async (system, messages) => {
    if (system.includes("writing reference files")) return JSON.stringify({ "context/README.md": "# clean\n", "context/ENTITIES.md": "# entities\n" });
    const extract = JSON.parse(messages[0]!.content as string) as { tables: { name: string; foreignKeys: { column: string; refTable: string; refColumn: string }[] }[] };
    return JSON.stringify({
      entities: [], tables: [], questions: [],
      relationships: extract.tables.flatMap((t) => t.foreignKeys.map((fk) => ({ from: { table: t.name, column: fk.column }, to: { table: fk.refTable, column: fk.refColumn }, basis: "stated", confidence: 1, reason: "declared" }))),
      suspicions: [{ kind: "inconsistent_values", tables: ["posts"], column: "state", detail: "check" }],
    });
  };
  const code = await run({ url: FIXTURE_URL.replace(/\/fixture$/, "/clean"), samples: true, reveal: [], json: true, flags: {}, cwd, env: {}, out: (l) => out.push(l), err: () => {} }, { transport });
  const verified = JSON.parse(out.join("\n")) as Verified;
  const statuses = Object.values(verified.verdicts).map((v) => v.status);
  assert.equal(code, 0);
  assert.equal(verified.tables.length, 10);
  assert.equal(verified.fitsInContext, true);
  assert.equal(statuses.filter((s) => s === "confirmed" ).length, 11, "eleven declared foreign keys, all at 100%");
  assert.ok(!statuses.includes("broken"));
  assert.equal(verified.verdicts["suspicion:inconsistent_values:posts.state"]!.status, "rejected");
});

/** One offline run into a new directory, with the model replying the given claims; what it printed, and where it wrote. */
async function offline(claims: object, opts: Partial<RunOptions> = {}): Promise<{ cwd: string; out: string[]; err: string[]; requests: string[] }> {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-it-"));
  const out: string[] = [];
  const err: string[] = [];
  const model = fakeModel(claims);
  await run({ url: FIXTURE_URL, samples: true, reveal: [], json: false, flags: {}, cwd, env: {}, out: (l) => out.push(l), err: (l) => err.push(l), ...opts }, { transport: model.transport });
  return { cwd, out, err, requests: model.requests };
}

const SNAPSHOT = "context/snapshot.json";

test("every full run writes context/snapshot.json, and it validates", { timeout: 60_000 }, async () => {
  const snapshotOf = async (claims: object, opts: Partial<RunOptions> = {}) => {
    const { cwd, err, requests } = await offline(claims, opts);
    const snapshot = readSnapshot(cwd, SNAPSHOT);
    if (typeof snapshot === "string") assert.fail(snapshot);
    return { snapshot, err, requests };
  };
  const full = await snapshotOf(cannedClaims);
  const { schema, claims, verdicts } = full.snapshot;
  const names = schema.relations.map((r) => r.name);
  assert.equal(names.length, 11);
  assert.ok(!names.includes("events_2025") && !names.includes("events_2026"), "a partition is its parent's");
  assert.deepEqual(Object.keys(verdicts).sort(), [...claims.relationships.map(relationshipId), ...claims.suspicions.map(suspicionId)].sort());
  assert.ok(full.err.includes("files written: 14 under ./context/"), full.err.join("\n"));

  // The server's own number, asked for apart from the run, and the version in package.json.
  const db = await connect(FIXTURE_URL, config);
  try {
    const server = await db.catalog("SELECT current_setting('server_version_num')::int AS num");
    assert.equal(full.snapshot.serverVersionNum, server.ok ? server.rows[0]!.num : server.message);
  } finally {
    await db.close();
  }
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(full.snapshot.toolVersion, version);

  // Without claims, with the budget spent before the first relation, with most relations dropped to fit the model, and
  // as the reader role, which may only SELECT.
  const unclaimed = await snapshotOf({});
  assert.deepEqual(unclaimed.snapshot.claims, { entities: [], tables: [], relationships: [], suspicions: [], questions: [] });
  const skipped = await snapshotOf(cannedClaims, { flags: { budgetSeconds: 0 } });
  assert.ok(skipped.snapshot.schema.relations.every((r) => r.examined === false && r.columns.length > 0), "every relation listed, with its columns, and none examined");
  const fitted = await snapshotOf(cannedClaims, { flags: { modelMaxInputTokens: 500 } });
  const sent = (JSON.parse((JSON.parse(fitted.requests[0]!) as { messages: { content: string }[] }).messages[0]!.content) as Extract).tables.map((t) => t.name);
  assert.ok(sent.length < 11, `${sent.length} relations sent`);
  assert.deepEqual(fitted.snapshot.schema.relations.filter((r) => r.examined === undefined).map((r) => r.name), [...sent].sort(), "those the model was sent, and no others");
  const reader = await snapshotOf(cannedClaims, { url: FIXTURE_URL.replace("dbtruth:dbtruth@", "reader:reader@") });
  assert.deepEqual(reader.err.filter((line) => line.startsWith("WARNING:")), []);

  const listed = (s: typeof schema) => s.relations.map(({ examined: _examined, ...r }) => r);
  for (const other of [unclaimed, skipped, fitted, reader]) {
    assert.equal(other.snapshot.schema.fingerprint, schema.fingerprint);
    assert.deepEqual(listed(other.snapshot.schema), listed(schema));
  }
});

test("two runs whose claims come in different orders write byte-identical snapshots", { timeout: 60_000 }, async () => {
  // More than one of each kind of claim, a relationship and a suspicion given twice in other words, and a dead table
  // dated by its newest timestamp, whose age moves with now().
  const vehicles = (detail: string) => ({ kind: "dead_table", tables: ["vehicles"], detail });
  const claims = {
    ...cannedClaims,
    tables: [...cannedClaims.tables, { name: "customers", purpose: "One row per customer.", grain: "customer", basis: "inferred", confidence: 0.9, notes: [] }],
    relationships: [...cannedClaims.relationships, { ...cannedClaims.relationships[0]!, confidence: 0.9, reason: "orders belong to customers" }],
    suspicions: [...cannedClaims.suspicions, vehicles("replaced cars, and itself replaced?"), vehicles("no new rows lately")],
    questions: [...cannedClaims.questions, "Who still reads products_legacy?"],
  };
  const reversed = Object.fromEntries(Object.entries(claims).map(([key, list]) => [key, [...list].reverse()]));
  const written = async (reply: object) => readFileSync(join((await offline(reply)).cwd, SNAPSHOT));
  const [first, second] = [await written(claims), await written(reversed)];

  assert.equal(second.toString("utf8"), first.toString("utf8"));
  assert.ok(first.equals(second));
  const snapshot = parseSnapshot(first.toString("utf8"), SNAPSHOT);
  if (typeof snapshot === "string") assert.fail(snapshot);
  const age = snapshot.verdicts["suspicion:dead_table:vehicles"]?.measurement.numbers.ageDays;
  assert.ok(Number.isInteger(age), `ageDays ${age}: whole days, so it holds still from one run to the next`);
});

test("the snapshot carries only what Verified carries, and no hidden value, even with --reveal", { timeout: 60_000 }, async () => {
  const { cwd, out, requests } = await offline(cannedClaims, { json: true, reveal: ["customers.email"] });
  const verified = JSON.parse(out.join("\n")) as Verified;
  const text = readFileSync(join(cwd, SNAPSHOT), "utf8");
  // As written, not as parsed, which would drop a key the schema does not know.
  const written = JSON.parse(text) as { claims: Claims; verdicts: Verified["verdicts"]; schema: { relations: object[] } };

  assert.deepEqual(written.verdicts, verified.verdicts);
  const unordered = (c: Claims) => Object.fromEntries(Object.entries(c).map(([key, list]) => [key, new Set<unknown>(list)]));
  assert.deepEqual(unordered(written.claims), unordered(verified.claims));
  assert.deepEqual(Object.keys(written).sort(), ["claims", "database", "measuredWith", "schema", "serverVersionNum", "snapshot", "tool", "toolVersion", "verdicts"]);
  for (const relation of written.schema.relations) {
    assert.deepEqual(Object.keys(relation).filter((key) => !["name", "schema", "kind", "columns", "examined"].includes(key)), [], JSON.stringify(relation));
  }
  assert.match(requests[0]!, CANARY, "the model was shown the revealed column");
  assert.doesNotMatch(text, CANARY);
});

test("the fingerprint changes when a column is added in a copy of fixture_template, and not otherwise", { timeout: 60_000 }, async (t) => {
  const fingerprint = async (url: string) => {
    const db = await connect(url, config);
    try {
      return schemaOf(await readCatalog(db)).fingerprint;
    } finally {
      await db.close();
    }
  };
  const copy = await copyOfFixture(t);
  const original = await fingerprint(copy.url);
  assert.equal(original, await fingerprint(FIXTURE_URL), "a copy has the fixture's schema");

  await copy.sql("INSERT INTO products VALUES (81, 'SKU-00081', 'Product 81', 'tools', 12150)");
  await copy.sql("ANALYZE products");
  assert.equal(await fingerprint(copy.url), original, "new rows and new statistics are not a new schema");
  await copy.sql("ALTER TABLE order_items DROP CONSTRAINT order_items_order_id_fkey");
  await copy.sql("ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id)");
  assert.equal(await fingerprint(copy.url), original, "a key dropped and added again under its name is the same key");
  await copy.sql("ALTER TABLE customers ADD COLUMN nickname text");
  assert.notEqual(await fingerprint(copy.url), original);
});

test("a relation whose name needs quoting is listed as the catalog names it", { timeout: 60_000 }, async (t) => {
  const copy = await copyOfFixture(t);
  await copy.sql('CREATE SCHEMA "odd schema"');
  await copy.sql('CREATE TABLE "odd schema"."Mixed; Case" ("a""b" integer)');
  const { cwd } = await offline(cannedClaims, { url: copy.url });
  const snapshot = readSnapshot(cwd, SNAPSHOT);
  if (typeof snapshot === "string") assert.fail(snapshot);
  assert.deepEqual(snapshot.schema.relations.find((r) => r.schema === "odd schema"), { name: "odd schema.Mixed; Case", schema: "odd schema", kind: "table", columns: [['a"b', "integer"]] });
});

const liveKey = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;

test("live: every seeded problem appears in context/README.md", { skip: !liveKey && "set ANTHROPIC_API_KEY to run the live test" }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-live-"));
  const out: string[] = [];
  const err: string[] = [];
  const started = Date.now();
  const code = await run({ url: FIXTURE_URL, samples: true, reveal: [], json: true, flags: {}, cwd, env: process.env, out: (l) => out.push(l), err: (l) => err.push(l) });
  const seconds = (Date.now() - started) / 1000;
  const readme = readFileSync(join(cwd, "context", "README.md"), "utf8");
  const everything = readme + readFileSync(join(cwd, "context", "ENTITIES.md"), "utf8");
  assert.equal(code, 2);
  assert.match(readme, /customer_id/, "the broken join");
  assert.match(readme, /88/, "with its number");
  assert.match(readme, /\bcars\b/, "the dead table");
  assert.match(readme, /status/, "the inconsistent column");
  assert.match(readme, /audit_log/, "the table with no key");
  assert.match(everything, /products_legacy/, "the duplicate table");
  assert.doesNotMatch(readme, CANARY);
  // The tool controls database time; model latency is the API's. The spec's 60 s target is tracked in NOTES.md.
  const timing = err.find((l) => l.startsWith("database time:")) ?? "";
  const dbSeconds = Number(/database time: ([\d.]+)s/.exec(timing)?.[1]);
  assert.ok(dbSeconds < 5, `database time must stay small: ${timing}`);
  assert.ok(seconds < 180, `run took ${seconds.toFixed(1)}s`);
  console.log(`live fixture run: ${seconds.toFixed(1)}s total; ${timing}`);
});

test("live: a clean database is told it probably does not need this tool", { skip: !liveKey && "set ANTHROPIC_API_KEY to run the live test" }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-live-"));
  const code = await run({ url: FIXTURE_URL.replace(/\/fixture$/, "/clean"), samples: true, reveal: [], json: false, flags: {}, cwd, env: process.env, out: () => {}, err: () => {} });
  const readme = readFileSync(join(cwd, "context", "README.md"), "utf8");
  assert.equal(code, 0);
  assert.match(readme, /You probably don't need this tool/);
});
