import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import pg from "pg";
import { run, runCheck } from "../src/cli.js";
import { config, type Config } from "../src/config.js";
import { readCatalog } from "../src/extract.js";
import { closest, tools, type Join, type Opened, type Reply } from "../src/mcp.js";
import { connect, type Connection, type QueryResult } from "../src/safety.js";
import { CheckReportSchema, relationshipId, type Verdict, type Verified } from "../src/schemas.js";
import { cannedClaims, fakeModel } from "./canned.js";
import { copyOfFixture } from "./copies.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const POLYMORPH_URL = FIXTURE_URL.replace(/\/[^/]+$/, "/polymorph");
const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const { version: VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const CANARY = /canary-pii/i;
// Each test spawns a server or makes a full run, and some wait on a session to go.
const LIMIT = { timeout: 60_000 };

/** The fixture as another user, percent-encoded as a URL must be. */
function fixtureAs(user: string, password: string): string {
  const url = new URL(FIXTURE_URL);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  return url.href;
}

// The canned claims, and a quantity from 1 to 5 that fits every dense key of the fixture (T2.2).
const quantity = { from: { table: "order_items", column: "quantity" }, to: { table: "products", column: "id" }, basis: "inferred", confidence: 0.3, reason: "control: fits any dense key" };
const CLAIMS = { ...cannedClaims, relationships: [...cannedClaims.relationships, quantity] };

type Claimed = { from: { table: string; column: string }; to: { table: string; column: string }; when?: { column: string; equals: string } };

/** A claim as measure_join takes it. */
function asked({ from, to, when }: Claimed): Join {
  return { from_table: from.table, from_column: from.column, to_table: to.table, to_column: to.column, ...(when ? { when_column: when.column, when_equals: when.equals } : {}) };
}

const ORDERS_TO_CUSTOMERS = asked(cannedClaims.relationships[0]!);

/** The text of each block of a reply. */
const texts = (reply: { content: unknown }) => (reply.content as { text: string }[]).map((block) => block.text);

/** An offline full run on url in project, answered by a fake model that records what it is sent: the Verified it printed. */
async function fullRun(url: string, project: string, model = fakeModel(CLAIMS)): Promise<Verified> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run({ url, samples: true, reveal: [], json: true, flags: {}, cwd: project, env: {}, out: (line) => out.push(line), err: (line) => err.push(line) }, { transport: model.transport });
  assert.notEqual(code, 1, err.join("\n"));
  return JSON.parse(out.join("\n")) as Verified;
}

const directory = () => realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-mcp-")));

type Statement = { sql: string; params: unknown[] };

/**
 * The tools over project and a connection to url that the first call needing one opens, as the server holds them. It
 * records each statement run inside the budget and outside it, each budget given, the most statements in flight at
 * once, each connection opened and each warning; failing makes that many statements throw as a lost connection does.
 * Closed when the test ends.
 */
function session(t: TestContext, url: string, project = directory(), cfg: Config = config) {
  const seen = { queries: [] as Statement[], catalog: [] as Statement[], resets: [] as number[], most: 0, warnings: [] as string[], failing: 0 };
  const connections: Connection[] = [];
  let running = 0;
  const counted = async (list: Statement[], sql: string, params: unknown[], statement: () => Promise<QueryResult>) => {
    list.push({ sql, params });
    if (seen.failing > 0) {
      seen.failing -= 1;
      throw new Error("database connection lost: lost on purpose");
    }
    running += 1;
    seen.most = Math.max(seen.most, running);
    try {
      return await statement();
    } finally {
      running -= 1;
    }
  };
  const open = async (): Promise<Opened> => {
    const db = await connect(url, { ...cfg, warn: (message) => seen.warnings.push(message) });
    connections.push(db);
    const recording: Connection = {
      ...db,
      query: (sql, params = []) => counted(seen.queries, sql, params, () => db.query(sql, params)),
      catalog: (sql, params = []) => counted(seen.catalog, sql, params, () => db.catalog(sql, params)),
      resetBudget: (seconds) => {
        seen.resets.push(seconds);
        db.resetBudget(seconds);
      },
    };
    return { db: recording, cfg };
  };
  const handlers = tools(project, open);
  t.after(() => handlers.close());
  return { ...handlers, seen, connections, project };
}

/** A statement on the fixture's server, outside dbtruth, in the database of url: its rows. */
async function admin(sql: string, params: unknown[] = [], url = FIXTURE_URL): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as Record<string, unknown>[];
  } finally {
    await client.end();
  }
}

/** How many sessions dbtruth holds on the database of that name. */
async function sessions(database: string, where = "true"): Promise<number> {
  const rows = await admin(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1 AND application_name = 'dbtruth' AND ${where}`, [database]);
  return Number(rows[0]!.n);
}

/** Resolves once condition holds, checked every 50 ms, and fails once it has not within ms. */
async function until(what: string, ms: number, condition: () => boolean | Promise<boolean>): Promise<void> {
  const started = performance.now();
  while (!(await condition())) {
    assert.ok(performance.now() - started < ms, `${what} within ${ms} ms`);
    await delay(50);
  }
}

/**
 * `dbtruth mcp <args>` started from cwd as a client starts it, over the SDK's own client, with only the variables the
 * SDK passes a server and those env gives: no API key. Its stderr is kept; it is closed when the test ends.
 */
async function started(t: TestContext, args: string[], cwd: string, env: Record<string, string> = {}): Promise<{ client: Client; stderr: () => string }> {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", TSX, CLI, "mcp", ...args], cwd, env, stderr: "pipe" });
  let stderr = "";
  transport.stderr!.on("data", (chunk) => (stderr += chunk));
  const client = new Client({ name: "dbtruth-test", version: "1" });
  await client.connect(transport);
  t.after(() => client.close());
  return { client, stderr: () => stderr };
}

/**
 * `dbtruth mcp <args>` started from cwd with the variables the SDK passes a server, and spoken to line by line without
 * the SDK's client, which passes over a line that is not JSON: every whole line it prints on stdout, and its stderr.
 */
function raw(args: string[], cwd = directory()) {
  const child = spawn(process.execPath, ["--import", TSX, CLI, "mcp", ...args], { cwd, env: getDefaultEnvironment() });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const send = (message: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  // A stray newline makes an empty line, which is not JSON either.
  const lines = () => stdout.split("\n").slice(0, -1);
  const answered = (id: number) => until(`the answer to request ${id}`, 20_000, () => lines().some((line) => (JSON.parse(line) as { id?: number }).id === id));
  // The opening a 2025 client sends; the SDK serves it as it serves the SDK's own client.
  const initialize = async (id = 1) => {
    send({ id, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } } });
    await answered(id);
    send({ method: "notifications/initialized" });
  };
  const call = (id: number, name: string, args: object) => send({ id, method: "tools/call", params: { name, arguments: args } });
  return { child, send, call, initialize, answered, stdout: () => stdout, stderr: () => stderr, lines };
}

test("the server lists exactly the four tools, each taking a closed object, refuses a key it does not take or half a condition, and measures orders.customer_id -> customers.id as broken, 88.0%, 60 orphans", LIMIT, async (t) => {
  const { client } = await started(t, ["--url", FIXTURE_URL], directory());
  assert.deepEqual(client.getServerVersion(), { name: "dbtruth", version: VERSION });
  const listed = (await client.listTools()).tools;
  const shapes = Object.fromEntries(listed.map((tool) => [tool.name, [Object.keys(tool.inputSchema.properties ?? {}), tool.inputSchema.required ?? [], tool.inputSchema.additionalProperties]]));
  assert.deepEqual(
    shapes,
    {
      context: [["table"], [], false],
      describe_table: [["table"], ["table"], false],
      measure_join: [["from_table", "from_column", "to_table", "to_column", "when_column", "when_equals"], ["from_table", "from_column", "to_table", "to_column"], false],
      check: [[], [], false],
    },
    "per tool, the keys it takes, those it requires, and false for any other key",
  );
  for (const tool of listed) assert.ok((tool.description ?? "").length > 0, `${tool.name} tells an agent when to use it`);

  // A misspelt condition is refused, never dropped: dropped, it would measure the whole join.
  const refused = async (args: object) => {
    const reply = await client.callTool({ name: "measure_join", arguments: { ...ORDERS_TO_CUSTOMERS, ...args } });
    assert.equal(reply.isError, true, JSON.stringify(args));
    return texts(reply);
  };
  assert.deepEqual(await refused({ when: { column: "status", equals: "shipped" } }), ['Input validation error: Invalid arguments for tool measure_join: Unrecognized key: "when"']);
  assert.deepEqual(await refused({ when_column: "status" }), ["Input validation error: Invalid arguments for tool measure_join: when_column and when_equals go together: give both, or neither"]);
  assert.deepEqual(await refused({ when_equals: "shipped" }), ["Input validation error: Invalid arguments for tool measure_join: when_column and when_equals go together: give both, or neither"]);

  const reply = await client.callTool({ name: "measure_join", arguments: ORDERS_TO_CUSTOMERS });
  assert.equal(reply.isError, undefined, texts(reply).join("\n"));
  const [line, json] = texts(reply);
  assert.equal(line, "**BROKEN** orders.customer_id -> customers.id: 88.0% match (440 of 500 sampled), 60 orphans, all above the highest customers.id (inferred). An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.");
  const measured = JSON.parse(json!) as Verdict & { claim: string };
  assert.equal(measured.claim, "relationship:orders.customer_id->customers.id");
  assert.equal(measured.status, "broken");
  assert.deepEqual([measured.measurement.numbers.hit, measured.measurement.numbers.orphans, measured.measurement.numbers.orphansAbove], [0.88, 60, 60]);
  assert.match(measured.measurement.query, /^SELECT count\(f\."customer_id"\) AS total, /, "the query to rerun it");
});

test("measure_join gives each join the verdict, query and numbers a full run gives it, and the line of its table's file", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  const verified = await fullRun(FIXTURE_URL, tool.project);
  for (const r of verified.claims.relationships) {
    const id = relationshipId(r);
    const began = performance.now();
    const reply = await tool.measureJoin(asked(r));
    const ms = performance.now() - began;
    assert.ok(ms < 5_000, `${id} took ${Math.round(ms)} ms`);
    const [line, json] = texts(reply);
    assert.deepEqual(JSON.parse(json!), { claim: id, ...verified.verdicts[id] }, id);
    // A rejected join has no line in a table's file, which leaves it out.
    if (verified.verdicts[id]!.status === "rejected") continue;
    const file = readFileSync(join(tool.project, "context", "tables", `${r.from.table}.md`), "utf8").split("\n");
    assert.ok(file.includes(`- ${line}`), `${id}: "${line}" is not a line of ${r.from.table}.md`);
  }
  const weak = JSON.parse(texts(await tool.measureJoin(asked(quantity)))[1]!) as Verdict;
  assert.deepEqual([weak.status, weak.measurement.numbers.alsoFits], ["confirmed", 5], "weighed against the other dense keys as a full run weighs it");
  assert.equal(tool.connections.length, 1, "one connection for every call");
});

test("measure_join measures one branch of a polymorphic reference on its own rows", LIMIT, async (t) => {
  const tool = session(t, POLYMORPH_URL);
  const photo = { from_table: "comments", from_column: "commentable_id", to_table: "photos", to_column: "id", when_column: "commentable_type", when_equals: "photo" };
  const [line, json] = texts(await tool.measureJoin(photo));
  assert.equal(line, "**BROKEN** comments.commentable_id -> photos.id when commentable_type = 'photo': 66.7% match (120 of 180 sampled), 60 orphans, all above the highest photos.id (inferred). An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.");
  const { status, measurement } = JSON.parse(json!) as Verdict;
  assert.equal(status, "broken");
  assert.deepEqual([measurement.numbers.hits, measurement.numbers.total, measurement.numbers.orphans, measurement.numbers.orphansAbove], [120, 180, 60, 60]);
});

test("a when value holding SQL is only ever $1: the branch is empty and the table keeps its rows", LIMIT, async (t) => {
  const tool = session(t, POLYMORPH_URL);
  const value = "x'; DROP TABLE posts; --";
  const reply = await tool.measureJoin({ from_table: "comments", from_column: "commentable_id", to_table: "posts", to_column: "id", when_column: "commentable_type", when_equals: value });
  const { status, measurement } = JSON.parse(texts(reply)[1]!) as Verdict;
  assert.equal(status, "empty");
  assert.ok(measurement.query.endsWith("\n-- $1 = 'x''; DROP TABLE posts; --'"), "the note gives the value, so a person can rerun the query");
  assert.ok(tool.seen.queries.some((s) => s.params.includes(value)), "bound");
  for (const s of [...tool.seen.queries, ...tool.seen.catalog]) assert.ok(!s.sql.includes("DROP"), s.sql);
  assert.equal(Number((await admin("SELECT count(*) AS n FROM posts", [], POLYMORPH_URL))[0]!.n), 100);
});

test("a condition on a hidden column is not measured, whatever value is guessed", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  // One address that exists, one that does not: a count under each would say which.
  const guesses = ["person1@canary-pii.example", "nobody@canary-pii.example"];
  const replies: string[][] = [];
  for (const equals of guesses) {
    const reply = await tool.measureJoin({ from_table: "customers", from_column: "id", to_table: "orders", to_column: "customer_id", when_column: "email", when_equals: equals });
    const verdict = JSON.parse(texts(reply)[1]!) as Verdict;
    assert.deepEqual([verdict.status, verdict.skipped, verdict.measurement.numbers], ["unverifiable", "customers.email is not categorical, so no condition on it is measured", {}], equals);
    replies.push(texts(reply).map((text) => text.replaceAll(equals, "<guess>")));
  }
  assert.deepEqual(replies[0], replies[1], "both guesses get the same answer");
  for (const s of tool.seen.queries) assert.ok(!guesses.some((guess) => s.params.includes(guess)), s.sql);
});

test("an unknown table or column, or a name with quotes and semicolons, is refused with the closest names, and no statement is built from it", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  const refusal = async (reply: Promise<Reply>) => {
    const answer = await reply;
    assert.equal(answer.isError, true, texts(answer).join("\n"));
    return texts(answer)[0]!;
  };
  const joining = (change: Partial<Join>) => tool.measureJoin({ ...ORDERS_TO_CUSTOMERS, ...change });
  assert.equal(await refusal(joining({ from_table: "ordrs" })), "unknown table ordrs; the closest: orders");
  assert.equal(await refusal(joining({ from_column: "customer" })), "unknown column orders.customer; the closest: orders.customer_id");
  assert.equal(await refusal(joining({ when_column: "stat", when_equals: "shipped" })), "unknown column orders.stat; the closest: orders.status");
  assert.equal(await refusal(joining({ to_table: "costumers" })), "unknown table costumers; the closest: customers");
  assert.equal(await refusal(joining({ to_column: "ids" })), "unknown column customers.ids; the closest: customers.id");
  assert.equal(await refusal(tool.describeTable({ table: "vehicle" })), "unknown table vehicle; the closest: vehicles");

  const hostile = 'customers"; DROP TABLE customers; --';
  for (const field of ["from_table", "from_column", "to_table", "to_column", "when_column"] as const) {
    const text = await refusal(joining({ [field]: hostile, ...(field === "when_column" ? { when_equals: "shipped" } : {}) }));
    assert.match(text, /^unknown (table |column [a-z]+\.)customers"; DROP TABLE customers; --; the closest: /, field);
  }
  assert.match(await refusal(tool.describeTable({ table: hostile })), /^unknown table customers"; DROP TABLE customers; --; the closest: /);

  assert.deepEqual(tool.seen.queries, [], "no statement inside the budget");
  // Outside it, only the three statements that read the catalog, none holding or binding the name.
  const db = await connect(FIXTURE_URL, config);
  const reads = new Set<string>();
  try {
    await readCatalog({ ...db, catalog: (sql, params) => (reads.add(sql), db.catalog(sql, params)) });
  } finally {
    await db.close();
  }
  assert.deepEqual(new Set(tool.seen.catalog.map((s) => s.sql)), reads);
  for (const s of tool.seen.catalog) assert.ok(!JSON.stringify(s.params).includes("DROP"), JSON.stringify(s.params));
  assert.equal(tool.connections.length, 1, "a refusal keeps the connection");
});

test("describe_table gives a full run's key, size and allowed values, and no other column's values", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  const verified = await fullRun(FIXTURE_URL, tool.project);
  const facts = verified.tables.find((f) => f.name === "customers")!;
  const described = JSON.parse(texts(await tool.describeTable({ table: "customers" }))[0]!) as Record<string, unknown> & { columns: Record<string, unknown>[] };
  assert.deepEqual([described.name, described.kind, described.rowEstimate, described.estimateSource, described.primaryKey], ["customers", "table", facts.rowEstimate, facts.estimateSource, facts.primaryKey]);
  const values = Object.fromEntries(described.columns.filter((c) => c.values !== undefined).map((c) => [c.name, c.values]));
  assert.deepEqual(values, facts.categorical, "values only for the columns a full run lists them for");
  for (const key of Object.keys(described)) assert.ok(["name", "kind", "populated", "partitions", "rowEstimate", "estimateSource", "primaryKey", "foreignKeys", "unmeasured", "columns"].includes(key), `${key}: not a field describe_table answers with`);
  for (const c of described.columns) for (const key of Object.keys(c)) assert.ok(["name", "type", "nullable", "nullRate", "distinct", "values"].includes(key), `${String(c.name)}.${key}: not a field describe_table answers with`);
  const email = described.columns.find((c) => c.name === "email")!;
  assert.deepEqual([email.type, email.distinct, email.values], ["text", 250, undefined], "counted, and hidden");
  // No sample row is shown, so none is read.
  for (const s of tool.seen.queries) assert.doesNotMatch(s.sql, new RegExp(`LIMIT ${config.sampleRowsShown}\\)`), s.sql);
});

test("describe_table says why a relation it could not read has no statistics", LIMIT, async (t) => {
  const unread = (text: string) => {
    const described = JSON.parse(text) as { unmeasured?: string; columns: Record<string, unknown>[] };
    for (const c of described.columns) assert.deepEqual([c.nullRate, c.distinct], [undefined, undefined], String(c.name));
    return described.unmeasured;
  };
  const owner = session(t, FIXTURE_URL);
  assert.equal(unread(texts(await owner.describeTable({ table: "order_totals" }))[0]!), "a materialized view that has never been refreshed cannot be read");
  // test/fixtures/roles.sql: partial may read customers and orders only.
  const partial = session(t, fixtureAs("partial", "canary-pii :/?#[]@%&=+'"));
  assert.equal(unread(texts(await partial.describeTable({ table: "vehicles" }))[0]!), "permission denied for table vehicles");
  const readable = JSON.parse(texts(await partial.describeTable({ table: "orders" }))[0]!) as { unmeasured?: string; columns: { nullRate?: number }[] };
  assert.deepEqual([readable.unmeasured, readable.columns[0]!.nullRate], [undefined, 0], "measured, where the role may read");
});

test("context returns the files the last run wrote, says where to run dbtruth before there are any, and reads nothing outside context/", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  const file = (...path: string[]) => join(tool.project, "context", ...path);
  const refusal = async (table?: string) => {
    const reply = await tool.context(table === undefined ? {} : { table });
    assert.equal(reply.isError, true, texts(reply).join("\n"));
    return texts(reply)[0]!;
  };
  assert.equal(await refusal(), `no ${file("README.md")}: run npx dbtruth first`);
  assert.equal(await refusal("orders"), `no ${file("tables", "orders.md")}: run npx dbtruth first`);

  await fullRun(FIXTURE_URL, tool.project);
  assert.deepEqual(texts(await tool.context({})), [readFileSync(file("README.md"), "utf8")]);
  assert.deepEqual(texts(await tool.context({ table: "orders" })), [readFileSync(file("tables", "orders.md"), "utf8")]);
  assert.equal(await refusal("Orders"), "unknown table Orders; the closest: orders", "by the name as listed, even where case is ignored");
  assert.equal(await refusal("costumers"), "unknown table costumers; the closest: customers");
  writeFileSync(join(tool.project, "secret.md"), "canary-pii");
  for (const escape of ["../../secret", "..\\..\\secret", "../secret.md"]) assert.doesNotMatch(await refusal(escape), CANARY, escape);

  // A directory, and a link, where a table's file would be: neither is read.
  const elsewhere = directory();
  writeFileSync(join(elsewhere, "secret.md"), "canary-pii");
  rmSync(file("tables", "orders.md"));
  mkdirSync(file("tables", "orders.md"));
  // A junction needs no administrator rights on Windows, where it cannot be read as a file; elsewhere it is a symlink.
  rmSync(file("tables", "customers.md"));
  symlinkSync(join(elsewhere, "secret.md"), file("tables", "customers.md"), "junction");
  assert.equal(await refusal("orders"), `${file("tables", "orders.md")} is not a file`);
  assert.equal(await refusal("customers"), `${file("tables", "customers.md")} is not a file`);
  assert.equal(tool.connections.length, 0, "context never connects");
});

test("check through the server reports as the check command does, and without a snapshot says so before connecting", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  assert.deepEqual(texts(await tool.check()), [`no ${join(tool.project, "context", "snapshot.json")}: run npx dbtruth first`]);
  assert.equal(tool.connections.length, 0);

  await fullRun(FIXTURE_URL, tool.project);
  const reply = await tool.check();
  assert.equal(reply.isError, undefined, texts(reply).join("\n"));
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCheck({ url: FIXTURE_URL, snapshot: "context/snapshot.json", failOn: "regression", json: true, flags: {}, cwd: tool.project, env: {}, out: (line) => out.push(line), err: (line) => err.push(line) });
  assert.equal(code, 0, err.join("\n"));
  const [lines, json] = texts(reply);
  assert.equal(lines, err.join("\n"));
  assert.equal(lines, "check fixture: 13 unchanged");
  const report = JSON.parse(json!) as unknown;
  assert.deepEqual(report, JSON.parse(out.join("\n")));
  assert.deepEqual(CheckReportSchema.parse(report), report, "the report T3.3 describes");
});

test("no answer of any tool holds a hidden value", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  const verified = await fullRun(FIXTURE_URL, tool.project);
  const answers: Reply[] = [await tool.context({}), await tool.check()];
  for (const name of readdirSync(join(tool.project, "context", "tables"))) answers.push(await tool.context({ table: name.replace(/\.md$/, "") }));
  for (const r of verified.claims.relationships) answers.push(await tool.measureJoin(asked(r)));
  answers.push(await tool.measureJoin({ from_table: "customers", from_column: "email", to_table: "customers", to_column: "full_name" }));
  for (const url of [FIXTURE_URL, POLYMORPH_URL]) {
    const each = session(t, url);
    const db = await connect(url, config);
    try {
      for (const relation of await readCatalog(db)) answers.push(await each.describeTable({ table: relation.name }));
    } finally {
      await db.close();
    }
  }
  assert.ok(answers.length > 30, `${answers.length} answers`);
  for (const answer of answers) {
    assert.equal(answer.isError, undefined, texts(answer).join("\n"));
    for (const text of texts(answer)) assert.doesNotMatch(text, CANARY);
  }
});

test("a value the server quotes in an error reaches no answer, no file and no prompt", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  // A view whose phone no row can be cast to, so that each statement over it fails on the first address it meets, in
  // words that quote that address.
  await copy.sql("CREATE VIEW phones AS SELECT id, email::bigint AS phone FROM customers");
  const claim = { from: { table: "phones", column: "phone" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.5, reason: "a phone number per customer" };
  const model = fakeModel({ ...CLAIMS, relationships: [...CLAIMS.relationships, claim] });
  const tool = session(t, copy.url);
  const unread = "a value could not be read (SQLSTATE 22P02)";
  // Closed in the test, not after it: the copy cannot be dropped while a session is open on it.
  try {
    const verified = await fullRun(copy.url, tool.project, model);
    const described = await tool.describeTable({ table: "phones" });
    assert.equal((JSON.parse(texts(described)[0]!) as { unmeasured?: string }).unmeasured, unread);
    const measured = await tool.measureJoin(asked(claim));
    assert.equal((JSON.parse(texts(measured)[1]!) as Verdict).skipped, unread);
    const said = [described, measured, await tool.context({ table: "phones" }), await tool.check()].flatMap(texts);
    const written = [readFileSync(join(tool.project, "context", "snapshot.json"), "utf8"), JSON.stringify(verified)];
    for (const text of [...said, ...written, ...model.requests]) assert.doesNotMatch(text, CANARY);
  } finally {
    await tool.close();
  }
});

test("no tool reaches the Anthropic API or needs a key", LIMIT, async (t) => {
  const project = directory();
  await fullRun(FIXTURE_URL, project);
  // Where the API would be, a server that records every request made to it.
  const requests: string[] = [];
  const api = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(500).end();
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => api.close());
  const keyed = { ANTHROPIC_API_KEY: "sk-ant-dummy", ANTHROPIC_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` };
  for (const env of [keyed, {}]) {
    const { client } = await started(t, ["--url", FIXTURE_URL], project, env);
    const calls: [string, Record<string, unknown>][] = [["context", { table: "orders" }], ["describe_table", { table: "customers" }], ["measure_join", ORDERS_TO_CUSTOMERS], ["check", {}]];
    for (const [name, args] of calls) {
      const reply = await client.callTool({ name, arguments: args });
      assert.equal(reply.isError, undefined, `${name}: ${texts(reply).join("\n")}`);
    }
    await client.close();
  }
  assert.deepEqual(requests, []);
});

test("stdout carries JSON-RPC and nothing else, and when stdin ends the server exits 0 and leaves no session", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  // A project below its repository's root, so that the server logs each way it can: the lines saying where to set the
  // URL, the .env then read from the root, and the SDK's word on a message that is JSON but not JSON-RPC.
  const root = directory();
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "app"));
  const server = raw([], join(root, "app"));
  // Ended in the test, not after it: the copy cannot be dropped while the server holds a session on it.
  try {
    await server.initialize();
    server.call(2, "describe_table", { table: "orders" });
    await server.answered(2);
    writeFileSync(join(root, ".env"), `DATABASE_URL=${copy.url}\n`);
    server.send({ id: 3, method: "tools/list" });
    server.call(4, "describe_table", { table: "orders" });
    server.call(5, "describe_table", { table: "nope" });
    server.call(6, "measure_join", { from_table: "orders" });
    server.send({ method: 7 });
    for (const id of [3, 4, 5, 6]) await server.answered(id);
    assert.equal(await sessions(copy.name), 1, "describe_table opened the connection");
    const began = performance.now();
    // Once its stdout and stderr are closed too, so that both are whole.
    const closed = once(server.child, "close") as Promise<[number | null]>;
    server.child.stdin.end();
    const [code] = await closed;
    assert.equal(code, 0);
    assert.ok(performance.now() - began < 5_000, "and promptly");
    assert.ok(server.stdout().endsWith("\n"));
    for (const line of server.lines()) assert.equal((JSON.parse(line) as { jsonrpc: string }).jsonrpc, "2.0", line);
    assert.equal(server.lines().length, 6, "one answer per request, and nothing else");
    const logged = server.stderr().split("\n");
    for (const start of ["no database URL: ", `reading settings from ${join("..", ".env")}`, "mcp: "]) assert.ok(logged.some((line) => line.startsWith(start)), `"${start}" on stderr:\n${server.stderr()}`);
    await until("the session gone", 5_000, async () => (await sessions(copy.name)) === 0);
  } finally {
    server.child.kill();
  }
});

test("a client that probes with server/discover, then opens with initialize, is served on", LIMIT, async () => {
  const server = raw([]);
  try {
    // A 2026 client's probe. The SDK answers it from a server instance of its own, which it closes when a 2025 opening
    // follows, and serves the client from another.
    const envelope = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };
    server.send({ id: 1, method: "server/discover", params: { _meta: envelope } });
    await server.answered(1);
    await server.initialize(2);
    server.send({ id: 3, method: "tools/list" });
    await server.answered(3);
    assert.equal(server.child.exitCode, null, "still serving");
  } finally {
    server.child.kill();
  }
});

test("calls made at once run one at a time on one connection, each with a budget of its own, and answer as they would alone", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL, directory(), { ...config, mcpCallBudgetSeconds: 7 });
  const calls = [() => tool.describeTable({ table: "vehicles" }), () => tool.measureJoin(ORDERS_TO_CUSTOMERS), () => tool.measureJoin(asked(quantity))];
  const together = await Promise.all(calls.map((call) => call()));
  assert.equal(tool.seen.most, 1, "never two statements at once");
  assert.deepEqual(tool.seen.resets, [7, 7, 7], "mcpCallBudgetSeconds for each call");
  const alone: Reply[] = [];
  for (const call of calls) alone.push(await call());
  assert.deepEqual(together, alone);
  assert.equal(tool.connections.length, 1);
});

test("a call that fails on its connection closes it, and the next call connects again", LIMIT, async (t) => {
  const tool = session(t, FIXTURE_URL);
  tool.seen.failing = 1;
  const failed = await tool.measureJoin(ORDERS_TO_CUSTOMERS);
  assert.deepEqual([failed.isError, texts(failed)], [true, ["database connection lost: lost on purpose"]]);
  const again = JSON.parse(texts(await tool.measureJoin(ORDERS_TO_CUSTOMERS))[1]!) as Verdict;
  assert.equal(again.measurement.numbers.hit, 0.88);
  assert.equal(tool.connections.length, 2);
  await assert.rejects(tool.connections[0]!.query("SELECT 1"), /Client was closed/, "the first connection is closed");
});

test("a connection the server closes while idle is replaced before the next call", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const tool = session(t, copy.url);
  // Closed in the test, not after it: the copy cannot be dropped while a session is open on it.
  try {
    assert.equal(texts(await tool.describeTable({ table: "cars" })).length, 1);
    await admin("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND application_name = 'dbtruth'", [copy.name]);
    await until("the loss seen", 5_000, () => tool.connections[0]!.lost() !== undefined);
    const reply = await tool.measureJoin(ORDERS_TO_CUSTOMERS);
    assert.equal(reply.isError, undefined, texts(reply).join("\n"));
    assert.equal(tool.connections.length, 2);
  } finally {
    await tool.close();
  }
});

test("before .env has a URL, and while the database cannot be reached, each call says why, the server answers on, and the next call reads the settings again", LIMIT, async (t) => {
  const repo = directory();
  mkdirSync(join(repo, ".git"));
  const { client, stderr } = await started(t, [], repo);
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = await client.callTool({ name, arguments: args });
    return [reply.isError, texts(reply).join("\n")];
  };
  assert.deepEqual(await call("measure_join", ORDERS_TO_CUSTOMERS), [
    true,
    [
      "no database URL: DATABASE_URL is not in the environment or in a .env",
      `  searched ${repo}`,
      "set it to postgres://user:password@host:5432/dbname in one of these ways:",
      "  in a .env in one of those directories",
      "  in the environment",
      "  with --url",
      "  in a file elsewhere, read with --dotenv <path>",
    ].join("\n"),
  ]);
  writeFileSync(join(repo, ".env"), "DATABASE_URL=postgres://canary-pii:canary-pii@127.0.0.1:1/canary-pii\n");
  const unreachable = [true, "could not connect to the database: nothing is listening at the host and port in the URL; check them, and that the server is running"];
  assert.deepEqual(await call("describe_table", { table: "orders" }), unreachable);
  assert.deepEqual(await call("check", {}), [true, `no ${join(repo, "context", "snapshot.json")}: run npx dbtruth first`]);
  assert.deepEqual(await call("measure_join", ORDERS_TO_CUSTOMERS), unreachable);
  assert.deepEqual((await call("context", {}))[0], true, "context still answers, from disk");
  assert.equal((await client.listTools()).tools.length, 4, "still serving");
  writeFileSync(join(repo, ".env"), `DATABASE_URL=${FIXTURE_URL}\n`);
  const [isError, text] = await call("measure_join", ORDERS_TO_CUSTOMERS);
  assert.equal(isError, undefined, String(text));
  assert.match(String(text), /^\*\*BROKEN\*\* orders\.customer_id -> customers\.id: 88\.0% match/);
  assert.doesNotMatch(stderr(), CANARY);
});

test("a schema changed during a session is seen by the next call", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  const tool = session(t, copy.url);
  const columns = async (table: string) => (JSON.parse(texts(await tool.describeTable({ table }))[0]!) as { columns: { name: string }[] }).columns.map((c) => c.name);
  // Closed in the test, not after it: the copy cannot be dropped while a session is open on it.
  try {
    assert.deepEqual(await columns("cars"), ["id", "vin", "make", "model", "model_year", "customer_id", "registered_at"]);
    await copy.sql("CREATE TABLE added (id integer PRIMARY KEY, label text)");
    await copy.sql("ALTER TABLE orders ADD COLUMN note text");
    await copy.sql("DROP TABLE cars");
    assert.deepEqual(await columns("added"), ["id", "label"]);
    assert.equal((await columns("orders")).at(-1), "note");
    const gone = await tool.measureJoin(asked(cannedClaims.relationships[3]!));
    assert.equal(gone.isError, true);
    assert.match(texts(gone)[0]!, /^unknown table cars; the closest: /);
    assert.equal(tool.connections.length, 1);
  } finally {
    await tool.close();
  }
});

/** A connection that answers every catalog read with no rows, but for what overrides says. */
function fakeConnection(overrides: Partial<Connection>): Connection {
  return {
    database: "x",
    readOnlyProven: true,
    query: async () => ({ ok: true, rows: [] }),
    catalog: async () => ({ ok: true, rows: [] }),
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
    resetBudget: () => {},
    lost: () => undefined,
    ...overrides,
  };
}

test("close waits for a call still opening its connection, and that call closes the connection it opened", async () => {
  // A connection that opens slowly and counts how often it is closed.
  let closed = 0;
  const db = fakeConnection({ close: async () => void closed++ });
  const handlers = tools(directory(), () => delay(100).then((): Opened => ({ db, cfg: config })));
  // Shut down while the call waits for its connection, as a client that closes stdin mid-call does.
  const call = handlers.describeTable({ table: "orders" });
  await handlers.close();
  assert.equal(closed, 1, "the connection the call opened was closed before close returned, not left to keep the process alive");
  assert.deepEqual(texts(await call), ["the server is closing"], "the call ran nothing on the connection it opened");
});

test("close ends the connection a call is waiting on, and the call fails at once instead of holding close", { timeout: 5_000 }, async () => {
  // A catalog read that waits, as one behind a lock does, until its connection is closed, then fails as pg fails it.
  let read!: () => void;
  let end!: () => void;
  const reading = new Promise<void>((resolve) => (read = resolve));
  const ended = new Promise<void>((resolve) => (end = resolve));
  const db = fakeConnection({
    catalog: async () => {
      read();
      await ended;
      throw new Error("Connection terminated");
    },
    close: async () => end(),
  });
  const handlers = tools(directory(), async (): Promise<Opened> => ({ db, cfg: config }));
  const call = handlers.describeTable({ table: "orders" });
  await reading;
  await handlers.close();
  assert.deepEqual(texts(await call), ["Connection terminated"]);
});

test("SIGTERM during a call ends the server and leaves no session behind", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  // A lock that holds the call inside its first statement on orders.
  const locker = new pg.Client({ connectionString: copy.url });
  await locker.connect();
  const server = raw(["--url", copy.url]);
  try {
    await locker.query("BEGIN");
    await locker.query("LOCK TABLE orders IN ACCESS EXCLUSIVE MODE");
    await server.initialize();
    server.call(2, "describe_table", { table: "orders" });
    await until("the call waiting on the lock", 20_000, async () => (await sessions(copy.name, "wait_event_type = 'Lock'")) === 1);
    const began = performance.now();
    const exited = once(server.child, "exit") as Promise<[number | null]>;
    server.child.kill("SIGTERM");
    const [code] = await exited;
    assert.ok(performance.now() - began < 5_000, "ended promptly");
    // Windows has no SIGTERM: the process is terminated, with no handler run.
    if (process.platform !== "win32") assert.equal(code, 0);
    await locker.query("ROLLBACK");
  } finally {
    server.child.kill();
    await locker.end();
  }
  await until("the session gone", 5_000, async () => (await sessions(copy.name)) === 0);
});

test("the project is --project, else CLAUDE_PROJECT_DIR, else the working directory, and a --project that does not exist stops the server with exit 1", LIMIT, async (t) => {
  const [flag, variable, cwd] = [directory(), directory(), directory()];
  const readme = async (args: string[], env: Record<string, string>) => {
    const { client } = await started(t, args, cwd, env);
    const reply = texts(await client.callTool({ name: "context", arguments: {} }))[0];
    await client.close();
    return reply;
  };
  const missing = (project: string) => `no ${join(project, "context", "README.md")}: run npx dbtruth first`;
  assert.equal(await readme(["--project", flag], { CLAUDE_PROJECT_DIR: variable }), missing(flag));
  assert.equal(await readme([], { CLAUDE_PROJECT_DIR: variable }), missing(variable));
  assert.equal(await readme([], {}), missing(cwd));

  const stopped = spawnSync(process.execPath, ["--import", TSX, CLI, "mcp", "--project", "nope"], { cwd, encoding: "utf8", timeout: 20_000 });
  assert.deepEqual([stopped.status, stopped.stdout, stopped.stderr], [1, "", "--project nope: no such directory\n"]);
});

test("the reader role serves every tool without a warning", LIMIT, async (t) => {
  const reader = fixtureAs("reader", "reader");
  const tool = session(t, reader);
  await fullRun(reader, tool.project);
  for (const reply of [await tool.context({}), await tool.describeTable({ table: "customers" }), await tool.measureJoin(ORDERS_TO_CUSTOMERS), await tool.check()]) {
    assert.equal(reply.isError, undefined, texts(reply).join("\n"));
  }
  assert.deepEqual(tool.seen.warnings, []);
});

test("closest names are those the fewest edits away, ignoring case, every tie included", () => {
  assert.deepEqual(closest("ordrs", ["customers", "orders", "order_items"]), ["orders"]);
  assert.deepEqual(closest("ORDERS", ["orders", "Orders"]), ["orders", "Orders"], "case aside, both are the name itself");
  assert.deepEqual(closest("cat", ["car", "bat", "cats", "dog"]), ["car", "bat", "cats"], "one edit each, in the order given");
  assert.deepEqual(closest("x", []), []);
});
