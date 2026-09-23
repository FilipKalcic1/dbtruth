import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { verify } from "../src/verify.js";
import type { Db, QueryResult, Row } from "../src/safety.js";
import type { Claims, Extract, Table } from "../src/schemas.js";

const table = (name: string, rowEstimate: number, extra: Partial<Table> = {}): Table => ({
  name,
  schema: "public",
  kind: "table",
  rowEstimate,
  primaryKey: ["id"],
  foreignKeys: [],
  columns: ["id", "customer_id", "make"].map((c) => ({ name: c, type: c === "make" ? "text" : "integer", nullable: c !== "id", nullRate: 0, distinct: 0, maxLength: 0, visible: true })),
  samples: [],
  ...extra,
});

const extractOf = (...tables: Table[]): Extract => ({ database: "fixture", tables, skipped: [], schemaTokens: 0, unmatchedReveal: [] });

const relationship = (from: string, to: string, column = "customer_id"): Claims["relationships"][number] => ({
  from: { table: from, column },
  to: { table: to, column: "id" },
  basis: "inferred",
  confidence: 1,
  reason: "name",
});

const claims = (c: Partial<Claims>): Claims => ({ entities: [], tables: [], relationships: [], suspicions: [], questions: [], ...c });

const answer = (row: Row): QueryResult => ({ ok: true, rows: [row] });
const mismatch: QueryResult = { ok: false, reason: "error", message: "operator does not exist: integer = text", sqlState: "42883" };

/** A database that answers statements from a script, one each, and refuses any statement beyond it. */
function fakeDb(...replies: QueryResult[]): Db & { queries: string[] } {
  const queries: string[] = [];
  return {
    database: "fixture",
    readOnlyProven: true,
    queries,
    async query(sql) {
      queries.push(sql);
      const reply = replies.shift();
      if (!reply) throw new Error("nothing here should be queried");
      return reply;
    },
    catalog: async () => ({ ok: true, rows: [] }),
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
  };
}

test("a relationship from an empty table is empty without a query, with the evidence", async () => {
  const db = fakeDb();
  const [m] = await verify(db, config, extractOf(table("orders", 0), table("customers", 10)), claims({ relationships: [relationship("orders", "customers")] }));
  assert.deepEqual(db.queries, []);
  assert.equal(m?.empty, true);
  assert.equal(m?.skipped, "no non-null rows to test");
  assert.deepEqual(m?.numbers, {}, "nothing was measured");
  assert.match(m?.query ?? "", /orders has no rows/);
});

test("a relationship into an empty table is empty too, not rejected: an empty target disproves nothing", async () => {
  const db = fakeDb();
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 0)), claims({ relationships: [relationship("orders", "customers")] }));
  assert.deepEqual(db.queries, []);
  assert.equal(m?.empty, true);
  assert.equal(m?.skipped, "no rows to match against", "a reason that is true of the target, not one about the source's nulls");
  assert.match(m?.query ?? "", /customers has no rows/);
});

test("a materialized view that was never refreshed cannot be read from either side", async () => {
  const db = fakeDb();
  const never = table("order_totals", 0, { kind: "materialized view", populated: false });
  const relationships = [relationship("orders", "order_totals"), relationship("order_totals", "orders")];
  const measurements = await verify(db, config, extractOf(table("orders", 500), never), claims({ relationships }));
  assert.deepEqual(db.queries, []);
  for (const m of measurements) {
    assert.equal(m.empty, true);
    assert.match(m.skipped ?? "", /never been refreshed/);
    assert.match(m.query, /relispopulated is false for order_totals/);
  }
});

test("inconsistent_values and duplicate_entity over an empty relation never query", async () => {
  const db = fakeDb();
  const suspicions: Claims["suspicions"] = [
    { kind: "inconsistent_values", tables: ["cars"], column: "make", detail: "check" },
    { kind: "duplicate_entity", tables: ["vehicles", "cars"], detail: "same columns" },
  ];
  const measurements = await verify(db, config, extractOf(table("vehicles", 120), table("cars", 0)), claims({ suspicions }));
  assert.deepEqual(db.queries, []);
  assert.deepEqual(measurements.map((m) => [m.empty, m.skipped]), [[true, "no non-null rows to test"], [true, "no rows to match against"]]);
});

test("a claim that names a column the table does not have is wrong whatever the row count", async () => {
  const [m] = await verify(fakeDb(), config, extractOf(table("orders", 0), table("customers", 10)), claims({ relationships: [relationship("orders", "customers", "nope")] }));
  assert.equal(m?.empty, undefined);
  assert.match(m?.skipped ?? "", /unknown column orders\.nope/);
});

test("one statement measures the hit rate over non-null references and counts the null ones", async () => {
  const db = fakeDb(answer({ total: "400", nulls: "100", hits: "352" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }));
  assert.equal(db.queries.length, 1);
  assert.deepEqual(m?.numbers, { total: 400, hits: 352, orphans: 48, hit: 0.88, nulls: 100 });
  assert.match(m?.query ?? "", /count\(\*\) - count\(f\."customer_id"\) AS nulls/);
  assert.match(m?.query ?? "", /EXISTS \(SELECT 1 FROM "public"\."customers" t WHERE t\."id" = f\."customer_id"\)/, "the target column is its key, so each row probes the index");
});

test("a target column that does not lead the primary key is read once, deduplicated and joined", async () => {
  const db = fakeDb(answer({ total: "400", nulls: "100", hits: "352" }));
  const composite = table("customers", 250, { primaryKey: ["tenant_id", "id"] });
  const [m] = await verify(db, config, extractOf(table("orders", 500), composite), claims({ relationships: [relationship("orders", "customers")] }));
  assert.deepEqual(m?.numbers, { total: 400, hits: 352, orphans: 48, hit: 0.88, nulls: 100 });
  assert.match(m?.query ?? "", /LEFT JOIN \(SELECT DISTINCT "id" AS v FROM "public"\."customers"\) t ON t\.v = f\."customer_id"/);
  assert.doesNotMatch(m?.query ?? "", /EXISTS/, "an index on (tenant_id, id) cannot be probed by id alone");
});

test("a datatype mismatch is compared as text once, and text has no index, so even a key is then read once", async () => {
  const db = fakeDb(mismatch, answer({ total: "400", nulls: "0", hits: "400" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }));
  assert.equal(db.queries.length, 2);
  assert.match(db.queries[0]!, /EXISTS \(SELECT 1 FROM "public"\."customers" t WHERE t\."id" = f\."customer_id"\)/, "the key is probed natively first");
  assert.match(m?.query ?? "", /LEFT JOIN \(SELECT DISTINCT "id"::text AS v FROM "public"\."customers"\) t ON t\.v = f\."customer_id"::text/);
  assert.equal(m?.numbers.hit, 1);
});

test("duplicate rows are counted as distinct tuples on the shared columns, intersected with the other table", async () => {
  const suspicion: Claims["suspicions"][number] = { kind: "duplicate_entity", tables: ["products", "products_legacy"], detail: "same rows" };
  const pair = extractOf(table("products", 80), table("products_legacy", 70));
  const [m] = await verify(fakeDb(answer({ total: "80", matched: "70" })), config, pair, claims({ suspicions: [suspicion] }));
  assert.deepEqual(m?.numbers, { total: 80, matched: 70, sharedColumns: 3, overlap: 0.875 });
  assert.match(m?.query ?? "", /SELECT DISTINCT a\."id", a\."customer_id", a\."make" FROM/);
  assert.match(m?.query ?? "", /INTERSECT SELECT b\."id", b\."customer_id", b\."make" FROM "public"\."products_legacy" b/);

  const [asText] = await verify(fakeDb(mismatch, answer({ total: "80", matched: "70" })), config, pair, claims({ suspicions: [suspicion] }));
  assert.match(asText?.query ?? "", /SELECT DISTINCT a\."id"::text, a\."customer_id"::text, a\."make"::text FROM/, "a datatype mismatch casts every shared column, on both sides");
  assert.match(asText?.query ?? "", /INTERSECT SELECT b\."id"::text, b\."customer_id"::text, b\."make"::text FROM/);
});

test("a reference that is null on every sampled row is empty, and says how many rows it looked at", async () => {
  const db = fakeDb(answer({ total: "0", nulls: "50", hits: "0" }));
  const [m] = await verify(db, config, extractOf(table("orders", 50), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }));
  assert.equal(m?.empty, true);
  assert.equal(m?.skipped, "no non-null rows to test");
  assert.deepEqual(m?.numbers, { total: 0, nulls: 50 });
});
