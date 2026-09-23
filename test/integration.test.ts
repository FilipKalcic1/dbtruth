import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import type { Transport } from "../src/model.js";
import type { Extract, Verified } from "../src/schemas.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const TSX = import.meta.resolve("tsx");
const CLI = new URL("../src/cli.ts", import.meta.url);
const CANARY = /canary-pii/i;

// What a competent contextualize pass proposes for the fixture. The data decides.
const cannedClaims = {
  entities: [
    { name: "customer", primaryTable: "customers", referencedIn: ["orders", "vehicles"], basis: "inferred", confidence: 0.9, reason: "names" },
    { name: "product", primaryTable: "products", referencedIn: ["order_items", "products_legacy"], basis: "inferred", confidence: 0.8, reason: "names" },
  ],
  tables: [{ name: "orders", purpose: "One row per customer order.", grain: "order", basis: "inferred", confidence: 0.9, notes: [] }],
  relationships: [
    { from: { table: "orders", column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.8, reason: "name" },
    { from: { table: "order_items", column: "order_id" }, to: { table: "orders", column: "id" }, basis: "stated", confidence: 1, reason: "fk" },
    { from: { table: "vehicles", column: "model_year" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.2, reason: "control: a guess the data rejects" },
    { from: { table: "cars", column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.5, reason: "control: an empty table has nothing to test" },
    { from: { table: "customers", column: "address" }, to: { table: "customers", column: "full_name" }, basis: "inferred", confidence: 0.1, reason: "control: a column with nulls, pointing nowhere" },
  ],
  suspicions: [
    { kind: "dead_table", tables: ["cars"], detail: "empty beside vehicles" },
    { kind: "inconsistent_values", tables: ["orders"], column: "status", detail: "shipped / SHIPPED" },
    { kind: "inconsistent_values", tables: ["cars"], column: "make", detail: "control: an empty column has nothing to measure" },
    { kind: "duplicate_entity", tables: ["products", "products_legacy"], detail: "same columns and values" },
    { kind: "missing_key", tables: ["audit_log"], detail: "no primary key" },
    { kind: "dead_table", tables: ["order_totals"], detail: "materialized view never refreshed" },
    { kind: "other", tables: ["customers"], detail: "cannot be measured" },
  ],
  questions: ["Is cars still used by anything?"],
};

const cannedFiles = {
  "context/README.md": "# fixture\n\nBroken: orders.customer_id -> customers.id (88%).\n",
  "context/ENTITIES.md": "# Entities\n",
  "context/tables/orders.md": "# orders\n",
  "../escape.md": "must not be written",
};

function fakeModel(): { transport: Transport; requests: string[] } {
  const requests: string[] = [];
  const transport: Transport = async (system, messages) => {
    requests.push(JSON.stringify({ system, messages }));
    return system.includes("writing reference files") ? JSON.stringify(cannedFiles) : JSON.stringify(cannedClaims);
  };
  return { transport, requests };
}

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
  assert.match(tableFile("orders"), /\*\*BROKEN\*\* orders\.customer_id -> customers\.id: 88\.0% match \(440 of 500 sampled\), 60 orphans \(inferred\)/, "rendered from the measurement, not the model's canned file");
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
