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
function fakeDb(...replies: QueryResult[]): Db & { queries: string[]; params: unknown[][] } {
  const queries: string[] = [];
  const params: unknown[][] = [];
  return {
    database: "fixture",
    readOnlyProven: true,
    queries,
    params,
    async query(sql, values = []) {
      queries.push(sql);
      params.push(values);
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

const column = (name: string, type: string, distinct: number, visible: boolean) => ({ name, type, nullable: false, nullRate: 0, distinct, maxLength: 5, visible });

/**
 * comments, whose commentable_id points at photos where commentable_type is photo, as 480 sampled rows show it: a key,
 * which is visible, a categorical type, and an id and a note whose values are hidden.
 */
const comments = (rowEstimate: number) =>
  table("comments", rowEstimate, {
    columns: [column("id", "integer", 480, true), column("commentable_type", "text", 2, true), column("commentable_id", "integer", 100, false), column("note", "text", 480, false)],
  });
const photoBranch = (on = "commentable_type"): Claims => claims({ relationships: [{ ...relationship("comments", "photos", "commentable_id"), when: { column: on, equals: "photo" } }] });

test("a condition filters the sampled rows by a bound value, shown only in a note after the statement", async () => {
  const db = fakeDb(answer({ total: "180", nulls: "0", hits: "120" }));
  const [m] = await verify(db, config, extractOf(comments(480), table("photos", 40)), photoBranch());
  assert.equal(db.queries.length, 1);
  assert.ok(db.queries[0]!.includes(`FROM (SELECT * FROM (SELECT * FROM "public"."comments" LIMIT 50000) w WHERE w."commentable_type"::text = $1) f`), db.queries[0]!);
  assert.deepEqual(db.params[0], ["photo"], "the value travels as a parameter");
  assert.doesNotMatch(db.queries[0]!, /photo'/, "and never as text in the statement");
  assert.equal(m?.query, db.queries[0] + "\n-- $1 = 'photo'", "the query kept is the one run, before a note that gives $1");
  assert.deepEqual(m?.numbers, { total: 180, hits: 120, orphans: 60, hit: 120 / 180, nulls: 0 });
});

test("the plain-form retry and the text fallback send the condition's value too", async () => {
  const refused: QueryResult = { ok: false, reason: "error", message: "TABLESAMPLE is not supported here", sqlState: "0A000" };
  const db = fakeDb(refused, mismatch, refused, answer({ total: "18000", nulls: "0", hits: "12000" }));
  const [m] = await verify(db, config, extractOf(comments(500_000), table("photos", 40)), photoBranch());
  assert.equal(db.queries.length, 4, "sampled, plain, then both again as text");
  assert.match(db.queries[0]!, /TABLESAMPLE SYSTEM/);
  assert.match(db.queries[3]!, /LEFT JOIN .* ON t\.v = f\."commentable_id"::text/);
  assert.deepEqual(db.params, [["photo"], ["photo"], ["photo"], ["photo"]]);
  assert.equal(m?.query, db.queries[3] + "\n-- $1 = 'photo'");
});

test("a condition on a column the table lacks, or on one that is not categorical, is unverifiable and nothing runs", async () => {
  const db = fakeDb();
  const tables = extractOf(comments(480), table("photos", 40));
  const [unknown] = await verify(db, config, tables, photoBranch("kind"));
  const [hidden] = await verify(db, config, tables, photoBranch("note"));
  const [key] = await verify(db, config, tables, photoBranch("id"));
  assert.deepEqual([unknown?.skipped, unknown?.empty], ["unknown column comments.kind", undefined]);
  assert.deepEqual([hidden?.skipped, hidden?.empty], ["comments.note is not categorical, so no condition on it is measured", undefined]);
  assert.deepEqual([key?.skipped, key?.empty], ["comments.id is not categorical, so no condition on it is measured", undefined], "a key is visible, and has a value per row");
  // An empty table shows no column's values, so it is empty before its condition is judged.
  const [empty] = await verify(db, config, extractOf(comments(0), table("photos", 40)), photoBranch("note"));
  assert.deepEqual([empty?.skipped, empty?.empty], ["no non-null rows to test", true]);
  assert.deepEqual(db.queries, []);
});

test("against an integer key it leads, the join also counts the orphans past either end of it", async () => {
  const db = fakeDb(answer({ total: "500", nulls: "0", hits: "440", orphans_above: "60", orphans_below: "0" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }));
  const ends =
    ', count(*) FILTER (WHERE f."customer_id" > (SELECT max(t."id") FROM "public"."customers" t)) AS orphans_above' +
    ', count(*) FILTER (WHERE f."customer_id" < (SELECT min(t."id") FROM "public"."customers" t)) AS orphans_below';
  assert.ok(db.queries[0]!.includes(`AS hits${ends}\n`), db.queries[0]!);
  assert.deepEqual(m?.numbers, { total: 500, hits: 440, orphans: 60, hit: 0.88, nulls: 0, orphansAbove: 60, orphansBelow: 0 });
});

test("no orphan ends where a column is not an integer or the column does not lead the key", async () => {
  const counted = { total: "400", nulls: "0", hits: "352" };
  const numbers = { total: 400, hits: 352, orphans: 48, hit: 0.88, nulls: 0 };
  const join = claims({ relationships: [relationship("orders", "customers")] });
  const cases: [string, Extract][] = [
    ["a numeric from-column", extractOf(table("orders", 500, { columns: [column("customer_id", "numeric", 250, false)] }), table("customers", 250))],
    ["a numeric key", extractOf(table("orders", 500), table("customers", 250, { columns: [column("id", "numeric", 250, true)] }))],
    ["a column second in the key", extractOf(table("orders", 500), table("customers", 250, { primaryKey: ["tenant_id", "id"] }))],
  ];
  for (const [label, extract] of cases) {
    const db = fakeDb(answer(counted));
    const [m] = await verify(db, config, extract, join);
    assert.doesNotMatch(db.queries[0]!, /orphans_/, label);
    assert.deepEqual(m?.numbers, numbers, label);
  }
});

/** vehicles, dated by one timestamp column, and the suspicion that it is dead. */
const vehicles = table("vehicles", 120, {
  columns: [{ name: "registered_at", type: "timestamp with time zone", nullable: false, nullRate: 0, distinct: 0, maxLength: 0, visible: false }],
});
const deadVehicles = claims({ suspicions: [{ kind: "dead_table", tables: ["vehicles"], detail: "replaced by a newer table" }] });

test("the dead-table age is counted in whole days by the statement, so the number kept is the number it reruns to", async () => {
  const db = fakeDb(answer({ count: 120, age_days: "3" }));
  const [m] = await verify(db, config, extractOf(vehicles), deadVehicles);
  // Rounded up: a whole number over staleAfterDays exactly when the age is, so a table 90 days and an hour old is dead at 90.
  assert.equal(m?.query, 'SELECT count(*)::float8 AS count, ceil(EXTRACT(EPOCH FROM (now() - greatest(max("registered_at")))) / 86400) AS age_days FROM "public"."vehicles"');
  assert.deepEqual(m?.numbers, { exact: 1, count: 120, ageDays: 3 });
});

test("a dead-table age that is not a finite number is left out", async () => {
  // On Postgres 17 and later, now() less an infinite timestamp is an infinite interval, and its age -Infinity, which
  // JSON writes as null.
  const [m] = await verify(fakeDb(answer({ count: 120, age_days: "-Infinity" })), config, extractOf(vehicles), deadVehicles);
  assert.deepEqual(m?.numbers, { exact: 1, count: 120 });
});
