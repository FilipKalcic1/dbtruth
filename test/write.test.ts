import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModel } from "../src/model.js";
import type { TableFacts, Verdict, Verified } from "../src/schemas.js";
import { confine, persist, tableFile, write } from "../src/write.js";

const facts = (name: string, extra: Partial<TableFacts> = {}): TableFacts => ({ name, kind: "table", rowEstimate: 500, primaryKey: ["id"], categorical: {}, ...extra });
const verdict = (status: Verdict["status"], numbers: Record<string, number> = {}, skipped?: string): Verdict => ({ status, measurement: { query: "SELECT 1", numbers }, ...(skipped ? { skipped } : {}) });
const nothing: Verified = { version: 1, database: "x", relations: "1 table", claims: { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, verdicts: {}, fitsInContext: true, tables: [] };

/** The fixture's shop as the writer sees it: a broken join, a confirmed one with nulls, a rejected one, an empty one, and three suspicions. */
const shop: Verified = {
  ...nothing,
  tables: [facts("orders", { categorical: { status: ["pending", "SHIPPED", "shipped"] } }), facts("customers", { rowEstimate: 250 }), facts("cars", { rowEstimate: 0 })],
  claims: {
    ...nothing.claims,
    tables: [{ name: "orders", purpose: "One row per customer order.", grain: "order", basis: "inferred", confidence: 0.9, notes: ["status is free text"] }],
    relationships: [
      { from: { table: "orders", column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.8, reason: "name" },
      { from: { table: "order_items", column: "order_id" }, to: { table: "orders", column: "id" }, basis: "stated", confidence: 1, reason: "fk" },
      { from: { table: "vehicles", column: "model_year" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.2, reason: "guess" },
      { from: { table: "cars", column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.5, reason: "name" },
    ],
    suspicions: [
      { kind: "inconsistent_values", tables: ["orders"], column: "status", detail: "shipped / SHIPPED" },
      { kind: "other", tables: ["customers"], detail: "api_token is constant" },
      { kind: "dead_table", tables: ["cars"], detail: "empty beside vehicles" },
    ],
  },
  verdicts: {
    "relationship:orders.customer_id->customers.id": verdict("broken", { total: 500, hits: 440, orphans: 60, hit: 0.88, nulls: 0 }),
    "relationship:order_items.order_id->orders.id": verdict("confirmed", { total: 1080, hits: 1080, orphans: 0, hit: 1, nulls: 120 }),
    "relationship:vehicles.model_year->customers.id": verdict("rejected", { total: 120, hits: 0, orphans: 120, hit: 0, nulls: 0 }),
    "relationship:cars.customer_id->customers.id": verdict("empty", {}, "no non-null rows to test"),
    "suspicion:inconsistent_values:orders.status": verdict("confirmed", { distinctValues: 5, canonicalForms: 3, collisions: 2 }),
    "suspicion:other:customers": verdict("unverifiable", {}, "no measurement exists for this kind of suspicion"),
    "suspicion:dead_table:cars": verdict("confirmed", { count: 0, exact: 1 }),
  },
};

test("a table file carries the measured numbers, both directions of a join, and no rejected claim", () => {
  const orders = tableFile(shop, shop.tables[0]!);
  assert.match(orders, /^# orders\n\nOne row per customer order\. \(inferred\)\nGrain: order\n- status is free text\n\ntable, ~500 rows, primary key: id\n/, "the model's meaning, then the facts");
  assert.match(orders, /\n- \*\*BROKEN\*\* orders\.customer_id -> customers\.id: 88\.0% match \(440 of 500 sampled\), 60 orphans \(inferred\)\. An inner join drops the orphans: use LEFT JOIN, or filter them on purpose\.\n/);
  assert.match(orders, /\n- order_items\.order_id -> orders\.id: confirmed, 100\.0% of 1080 sampled rows match\. 120 sampled rows \(10\.0%\) have no order_id; an inner join drops them too\.\n/, "an incoming join, declared, with its null share");
  assert.match(orders, /\n- \*\*inconsistent_values status\*\*: shipped \/ SHIPPED \(distinctValues 5, canonicalForms 3, collisions 2\)\. Compare with lower\(btrim\(status\)\)\.\n/);
  assert.match(orders, /\n## Values\n\n- status: "pending", "SHIPPED", "shipped"\n$/, "values are quoted so case and spacing show");

  const customers = tableFile(shop, shop.tables[1]!);
  assert.match(customers, /\*\*BROKEN\*\* orders\.customer_id -> customers\.id/, "the target's file shows the broken join too");
  assert.doesNotMatch(customers, /model_year/, "a rejected claim does not appear");
  assert.match(customers, /\n- other \(inferred, not measured: no measurement exists for this kind of suspicion\): api_token is constant\n/);
  assert.doesNotMatch(customers, /## Values/, "no section for nothing");

  const cars = tableFile(shop, shop.tables[2]!);
  assert.match(cars, /\ntable, no rows, primary key: id\n/);
  assert.match(cars, /\n- cars\.customer_id -> customers\.id \(inferred, not measured: no non-null rows to test\)\n/);
  assert.match(cars, /\n- \*\*dead_table\*\*: empty beside vehicles \(count 0, exact 1\)\.\n/);
});

test("a view, a partitioned table and a table without a key say so", () => {
  assert.equal(tableFile(nothing, facts("shipped_orders", { kind: "view", rowEstimate: -1, primaryKey: null })), "# shipped_orders\n\nview, size unknown, primary key: none\n");
  assert.match(tableFile(nothing, facts("events", { partitions: { count: 55, withLocalForeignKeys: 3 }, primaryKey: ["id", "happened_on"] })), /\ntable, 55 partitions, ~500 rows, primary key: id, happened_on\n$/);
});

test("the model writes README and ENTITIES; every table file is rendered and wins over anything else the model sent", async () => {
  const model = createModel({
    rawDir: mkdtempSync(join(tmpdir(), "dbtruth-")),
    maxOutputTokens: 1,
    transport: async () => JSON.stringify({ "context/README.md": "r", "context/ENTITIES.md": "e", "context/tables/Users.md": "model prose", "../escape.md": "no" }),
  });
  const meaning = { name: "users", purpose: "Rows of users.", grain: "row", basis: "stated" as const, confidence: 1, notes: [] };
  const files = await write(model, { ...nothing, claims: { ...nothing.claims, tables: [meaning] }, tables: [facts("Users"), facts("users"), facts("USERS"), facts("a/b")] });
  assert.deepEqual(
    Object.keys(files),
    ["context/README.md", "context/ENTITIES.md", "context/tables/Users.md", "context/tables/users~2.md", "context/tables/USERS~3.md", "context/tables/a_b.md"],
    "names that differ only by case get distinct files, and a separator in a name stays flat under tables/",
  );
  assert.match(files["context/tables/Users.md"]!, /^# Users\n\ntable, /, "not the model's prose, and not the meaning of the table spelled users");
  assert.match(files["context/tables/users~2.md"]!, /^# users\n\nRows of users\./, "a claim belongs to the table it spells exactly");
});

test("a reply without both files is sent back with what was missing", async () => {
  const replies = [JSON.stringify({ "context/README.md": "r" }), JSON.stringify({ "context/README.md": "r", "context/ENTITIES.md": "e" })];
  const conversations: unknown[][] = [];
  const transport = async (_system: string, messages: unknown[]) => {
    conversations.push(structuredClone(messages));
    return replies.shift()!;
  };
  const model = createModel({ rawDir: mkdtempSync(join(tmpdir(), "dbtruth-")), maxOutputTokens: 1, transport });
  const files = await write(model, nothing);
  assert.deepEqual(files, { "context/README.md": "r", "context/ENTITIES.md": "e" });
  assert.equal(conversations.length, 2);
  assert.match(JSON.stringify(conversations[1]!.at(-1)), /ENTITIES\.md/, "the retry names the missing file");
});

test("confine keeps every path inside context/ and makes it safe on every filesystem", () => {
  assert.equal(confine("context/tables/orders.md"), "context/tables/orders.md");
  assert.equal(confine("tables/orders.md"), "context/tables/orders.md", "a missing prefix is added");
  assert.equal(confine("./context/README.md"), "context/README.md");
  assert.equal(confine("../escape.md"), undefined, "nothing escapes");
  assert.equal(confine("context"), undefined, "the directory itself is not a file");
  assert.equal(confine("context/tables/what?.md"), "context/tables/what_.md", "Windows-invalid characters become underscores");
  assert.equal(confine("context/tables/app:orders.md"), "context/tables/app_orders.md", "a colon would name an NTFS stream");
  assert.equal(confine("C:/evil/x.md"), "context/C_/evil/x.md", "a drive letter is just a directory name inside context/");
  assert.equal(confine("context/tables/con.md"), "context/tables/_con.md", "reserved device names get a prefix");
  assert.equal(confine("context/tables/my-table. "), "context/tables/my-table", "trailing dots and spaces go, hyphens stay");
});

test("persist clears a previous run's files, leaves other files alone, and writes the new set", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-"));
  mkdirSync(join(cwd, "context", "tables"), { recursive: true });
  writeFileSync(join(cwd, "context", "tables", "dropped_table.md"), "stale");
  writeFileSync(join(cwd, "context", ".raw-write.json"), "{}");
  writeFileSync(join(cwd, "context", "keep.txt"), "not ours");

  const r = persist(cwd, { "context/README.md": "# a", "context/tables/orders.md": "# o" });

  assert.deepEqual(r.written, ["context/README.md", "context/tables/orders.md"]);
  assert.deepEqual(r.failed, []);
  assert.ok(!existsSync(join(cwd, "context", "tables", "dropped_table.md")), "a table that no longer exists leaves no stale file");
  assert.ok(!existsSync(join(cwd, "context", ".raw-write.json")), "a failed run's raw dump does not survive a successful one");
  assert.ok(existsSync(join(cwd, "context", "keep.txt")), "files the tool did not write are not touched");
  assert.equal(readFileSync(join(cwd, "context", "README.md"), "utf8"), "# a");
});

test("a file that cannot be written is reported, and the others are still written", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-"));
  mkdirSync(join(cwd, "context"), { recursive: true });
  writeFileSync(join(cwd, "context", "tables"), "a file where a directory is needed");

  const r = persist(cwd, { "context/README.md": "# a", "context/tables/orders.md": "# o" });

  assert.deepEqual(r.written, ["context/README.md"]);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0]!.path, "context/tables/orders.md");
});
