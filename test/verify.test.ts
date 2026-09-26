import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { decide } from "../src/verdict.js";
import { verify } from "../src/verify.js";
import type { Db, QueryResult, Row } from "../src/safety.js";
import type { Claims, Extract, IntegerKey, Table } from "../src/schemas.js";

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
/** No integer key to weigh a join against, for the tests of what comes before the weighing. */
const noKeys = async (): Promise<IntegerKey[]> => [];

/** A database that answers statements from a script, one each, inside the budget or outside it, and refuses any statement beyond it. */
function fakeDb(...replies: QueryResult[]): Db & { queries: string[]; params: unknown[][] } {
  const queries: string[] = [];
  const params: unknown[][] = [];
  async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
    queries.push(sql);
    params.push(values);
    const reply = replies.shift();
    if (!reply) throw new Error("nothing here should be queried");
    return reply;
  }
  return {
    database: "fixture",
    readOnlyProven: true,
    queries,
    params,
    query,
    catalog: query,
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
  };
}

test("a relationship from an empty table is empty without a query, with the evidence", async () => {
  const db = fakeDb();
  const [m] = await verify(db, config, extractOf(table("orders", 0), table("customers", 10)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
  assert.deepEqual(db.queries, []);
  assert.equal(m?.empty, true);
  assert.equal(m?.skipped, "no non-null rows to test");
  assert.deepEqual(m?.numbers, {}, "nothing was measured");
  assert.match(m?.query ?? "", /orders has no rows/);
});

test("a relationship into an empty table is empty too, not rejected: an empty target disproves nothing", async () => {
  const db = fakeDb();
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 0)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
  assert.deepEqual(db.queries, []);
  assert.equal(m?.empty, true);
  assert.equal(m?.skipped, "no rows to match against", "a reason that is true of the target, not one about the source's nulls");
  assert.match(m?.query ?? "", /customers has no rows/);
});

test("a materialized view that was never refreshed cannot be read from either side", async () => {
  const db = fakeDb();
  const never = table("order_totals", 0, { kind: "materialized view", populated: false });
  const relationships = [relationship("orders", "order_totals"), relationship("order_totals", "orders")];
  const measurements = await verify(db, config, extractOf(table("orders", 500), never), claims({ relationships }), noKeys);
  assert.deepEqual(db.queries, []);
  for (const m of measurements) {
    assert.equal(m.empty, true);
    assert.match(m.skipped ?? "", /never been refreshed/);
    assert.match(m.query, /relispopulated is false for order_totals/);
  }
});

test("a dead materialized view that was never refreshed is not counted: its numbers are what the schema says", async () => {
  const db = fakeDb();
  const never = table("order_totals", 0, { kind: "materialized view", populated: false });
  const dead = claims({ suspicions: [{ kind: "dead_table", tables: ["order_totals"], detail: "never refreshed" }] });
  const [m] = await verify(db, config, extractOf(never), dead, noKeys);
  assert.deepEqual(db.queries, [], "reading it raises an error, so nothing runs");
  assert.deepEqual(m?.numbers, { populated: 0 }, "no count of 0 and no exact: no row was counted");
  assert.match(m?.query ?? "", /relispopulated is false for order_totals/);
  assert.equal(decide(m!, config).status, "confirmed");
});

test("inconsistent_values and duplicate_entity over an empty relation never query", async () => {
  const db = fakeDb();
  const suspicions: Claims["suspicions"] = [
    { kind: "inconsistent_values", tables: ["cars"], column: "make", detail: "check" },
    { kind: "duplicate_entity", tables: ["vehicles", "cars"], detail: "same columns" },
  ];
  const measurements = await verify(db, config, extractOf(table("vehicles", 120), table("cars", 0)), claims({ suspicions }), noKeys);
  assert.deepEqual(db.queries, []);
  assert.deepEqual(measurements.map((m) => [m.empty, m.skipped]), [[true, "no non-null rows to test"], [true, "no rows to match against"]]);
});

test("a claim that names a column the table does not have is wrong whatever the row count", async () => {
  const [m] = await verify(fakeDb(), config, extractOf(table("orders", 0), table("customers", 10)), claims({ relationships: [relationship("orders", "customers", "nope")] }), noKeys);
  assert.equal(m?.empty, undefined);
  assert.match(m?.skipped ?? "", /unknown column orders\.nope/);
});

test("one statement measures the hit rate over non-null references and counts the null ones", async () => {
  const db = fakeDb(answer({ total: "400", nulls: "100", hits: "352" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
  assert.equal(db.queries.length, 1);
  assert.deepEqual(m?.numbers, { total: 400, hits: 352, orphans: 48, hit: 0.88, nulls: 100 });
  assert.match(m?.query ?? "", /count\(\*\) - count\(f\."customer_id"\) AS nulls/);
  assert.match(m?.query ?? "", /EXISTS \(SELECT 1 FROM "public"\."customers" t WHERE t\."id" = f\."customer_id"\)/, "the target column is its key, so each row probes the index");
});

test("a target column that does not lead the primary key is read once, deduplicated and joined", async () => {
  const db = fakeDb(answer({ total: "400", nulls: "100", hits: "352" }));
  const composite = table("customers", 250, { primaryKey: ["tenant_id", "id"] });
  const [m] = await verify(db, config, extractOf(table("orders", 500), composite), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
  assert.deepEqual(m?.numbers, { total: 400, hits: 352, orphans: 48, hit: 0.88, nulls: 100 });
  assert.match(m?.query ?? "", /LEFT JOIN \(SELECT DISTINCT "id" AS v FROM "public"\."customers"\) t ON t\.v = f\."customer_id"/);
  assert.doesNotMatch(m?.query ?? "", /EXISTS/, "an index on (tenant_id, id) cannot be probed by id alone");
});

test("a datatype mismatch is compared as text once, and text has no index, so even a key is then read once", async () => {
  const db = fakeDb(mismatch, answer({ total: "400", nulls: "0", hits: "400" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
  assert.equal(db.queries.length, 2);
  assert.match(db.queries[0]!, /EXISTS \(SELECT 1 FROM "public"\."customers" t WHERE t\."id" = f\."customer_id"\)/, "the key is probed natively first");
  assert.match(m?.query ?? "", /LEFT JOIN \(SELECT DISTINCT "id"::text AS v FROM "public"\."customers"\) t ON t\.v = f\."customer_id"::text/);
  assert.equal(m?.numbers.hit, 1);
});

test("duplicate rows are counted as distinct tuples on the shared columns, intersected with the other table", async () => {
  const suspicion: Claims["suspicions"][number] = { kind: "duplicate_entity", tables: ["products", "products_legacy"], detail: "same rows" };
  const pair = extractOf(table("products", 80), table("products_legacy", 70));
  const [m] = await verify(fakeDb(answer({ total: "80", matched: "70" })), config, pair, claims({ suspicions: [suspicion] }), noKeys);
  assert.deepEqual(m?.numbers, { total: 80, matched: 70, sharedColumns: 3, overlap: 0.875 });
  assert.match(m?.query ?? "", /SELECT DISTINCT a\."id", a\."customer_id", a\."make" FROM/);
  assert.match(m?.query ?? "", /INTERSECT SELECT b\."id", b\."customer_id", b\."make" FROM "public"\."products_legacy" b/);

  const [asText] = await verify(fakeDb(mismatch, answer({ total: "80", matched: "70" })), config, pair, claims({ suspicions: [suspicion] }), noKeys);
  assert.match(asText?.query ?? "", /SELECT DISTINCT a\."id"::text, a\."customer_id"::text, a\."make"::text FROM/, "a datatype mismatch casts every shared column, on both sides");
  assert.match(asText?.query ?? "", /INTERSECT SELECT b\."id"::text, b\."customer_id"::text, b\."make"::text FROM/);
});

test("a duplicate between two views is measured by comparing their definitions in the catalog, a materialized view never refreshed among them, with the names bound", async () => {
  const never = table("rental_by_category", 0, { kind: "materialized view", populated: false });
  const views = extractOf(never, table("sales_by_film_category", -1, { kind: "view" }), table("sales_by_store", -1, { kind: "view" }));
  const suspicions: Claims["suspicions"] = [
    { kind: "duplicate_entity", tables: ["rental_by_category", "sales_by_film_category"], detail: "identical SQL" },
    { kind: "duplicate_entity", tables: ["rental_by_category", "sales_by_store"], detail: "identical SQL" },
  ];
  const db = fakeDb(answer({ same_definition: 1 }), answer({ same_definition: 0 }));
  const [same, other] = await verify(db, config, views, claims({ suspicions }), noKeys);
  assert.deepEqual([same?.numbers, other?.numbers], [{ sameDefinition: 1 }, { sameDefinition: 0 }], "the definitions, which the catalog holds even for a materialized view no one can read, and no rows");
  assert.deepEqual([decide(same!, config).status, decide(other!, config).status], ["confirmed", "rejected"], "the same definition confirms the pair, and a different one rejects it, so a wrong pair never appears");
  assert.equal(same?.over, "rental_by_category", "the numbers name the first table, as those of every suspicion over two tables do");
  const statement = "SELECT (pg_get_viewdef($1::regclass, true) = pg_get_viewdef($2::regclass, true))::int AS same_definition";
  assert.deepEqual(db.queries, [statement, statement], "the statement run holds no name");
  assert.deepEqual(db.params, [['"public"."rental_by_category"', '"public"."sales_by_film_category"'], ['"public"."rental_by_category"', '"public"."sales_by_store"']], "each name is bound, quoted as an identifier");
  assert.equal(same?.query, `${statement}\n-- $1 = '"public"."rental_by_category"', $2 = '"public"."sales_by_film_category"'`, "the query kept ends with the note that gives $1 and $2, so that a person can rerun it");
});

test("two views are compared by their definitions whatever would stop a comparison of rows: no column name in common, or a budget the joins spent", async () => {
  const staff = table("staff_list", -1, { kind: "view", columns: [{ name: "staff", type: "text", nullable: true, nullRate: 0, distinct: 0, maxLength: 0, visible: true }] });
  const views = extractOf(table("sales_by_store", -1, { kind: "view" }), staff);
  const suspicions: Claims["suspicions"] = [{ kind: "duplicate_entity", tables: ["sales_by_store", "staff_list"], detail: "same rows" }];

  const [apart] = await verify(fakeDb(answer({ same_definition: 0 })), config, views, claims({ suspicions }), noKeys);
  assert.deepEqual(apart?.numbers, { sameDefinition: 0 }, "asked before the shared columns, so a wrong pair is rejected, not left unverifiable for want of one");

  const spent: QueryResult = { ok: false, reason: "budget", message: "time budget exhausted" };
  const [late] = await verify({ ...fakeDb(answer({ same_definition: 0 })), query: async () => spent }, config, views, claims({ suspicions }), noKeys);
  assert.deepEqual(late?.numbers, { sameDefinition: 0 }, "read from the catalog outside the budget, as the extract is, since it reads no rows");
});

test("a duplicate between a table and a view is still measured by its rows, and one beside a materialized view never refreshed is still empty", async () => {
  const suspicions: Claims["suspicions"] = [
    { kind: "duplicate_entity", tables: ["orders", "shipped_orders"], detail: "same rows" },
    { kind: "duplicate_entity", tables: ["orders", "order_totals"], detail: "same rows" },
  ];
  const tables = extractOf(table("orders", 500), table("shipped_orders", -1, { kind: "view" }), table("order_totals", 0, { kind: "materialized view", populated: false }));
  const db = fakeDb(answer({ total: "500", matched: "200" }));
  const [view, never] = await verify(db, config, tables, claims({ suspicions }), noKeys);
  assert.deepEqual(view?.numbers, { total: 500, matched: 200, sharedColumns: 3, overlap: 0.4 }, "the table's sampled rows, intersected with the view's");
  assert.match(db.queries[0] ?? "", /INTERSECT SELECT b\."id", b\."customer_id", b\."make" FROM "public"\."shipped_orders" b/);
  assert.deepEqual([never?.empty, never?.skipped], [true, "a materialized view that has never been refreshed cannot be read"], "no rows can be read on one side, and a table has no definition to compare");
});

test("a suspicion that names more than one table says which one its numbers are over, even from a sample that held no rows, and one over its only table, or with no numbers, names none", async () => {
  const suspicions: Claims["suspicions"] = [
    { kind: "duplicate_entity", tables: ["products", "products_legacy"], detail: "same rows" },
    { kind: "missing_key", tables: ["products", "products_legacy"], detail: "no keys" },
    { kind: "missing_key", tables: ["products"], detail: "no key" },
    { kind: "other", tables: ["products", "products_legacy"], detail: "cannot be measured" },
    { kind: "duplicate_entity", tables: ["drafts", "products"], detail: "same rows" },
  ];
  // drafts has no row estimate, so it is sampled, and the sample holds no rows.
  const tables = extractOf(table("products", 80), table("products_legacy", 70), table("drafts", -1));
  const db = fakeDb(answer({ total: "80", matched: "70" }), answer({ total: "0", matched: "0" }));
  const [duplicate, keys, key, other, drafts] = await verify(db, config, tables, claims({ suspicions }), noKeys);
  assert.equal(duplicate?.over, "products", "the overlap is a share of products' rows, and the measurement says so by name");
  assert.equal(keys?.over, "products", "the key is looked up on the first table alone");
  assert.equal(key?.over, undefined, "a suspicion that names one table needs no name beside its numbers");
  assert.equal(other?.over, undefined, "nothing was measured, so over no table");
  assert.deepEqual([drafts?.skipped, drafts?.over], ["no non-null rows to test", "drafts"], "an empty sample still has numbers, total 0 of drafts' rows, and they say whose");
});

test("a reference that is null on every sampled row is empty, and says how many rows it looked at", async () => {
  const db = fakeDb(answer({ total: "0", nulls: "50", hits: "0" }));
  const [m] = await verify(db, config, extractOf(table("orders", 50), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
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
  const [m] = await verify(db, config, extractOf(comments(480), table("photos", 40)), photoBranch(), noKeys);
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
  const [m] = await verify(db, config, extractOf(comments(500_000), table("photos", 40)), photoBranch(), noKeys);
  assert.equal(db.queries.length, 4, "sampled, plain, then both again as text");
  assert.match(db.queries[0]!, /TABLESAMPLE SYSTEM/);
  assert.match(db.queries[3]!, /LEFT JOIN .* ON t\.v = f\."commentable_id"::text/);
  assert.deepEqual(db.params, [["photo"], ["photo"], ["photo"], ["photo"]]);
  assert.equal(m?.query, db.queries[3] + "\n-- $1 = 'photo'");
});

test("a condition on a column the table lacks, or on one that is not categorical, is unverifiable and nothing runs", async () => {
  const db = fakeDb();
  const tables = extractOf(comments(480), table("photos", 40));
  const [unknown] = await verify(db, config, tables, photoBranch("kind"), noKeys);
  const [hidden] = await verify(db, config, tables, photoBranch("note"), noKeys);
  const [key] = await verify(db, config, tables, photoBranch("id"), noKeys);
  assert.deepEqual([unknown?.skipped, unknown?.empty], ["unknown column comments.kind", undefined]);
  assert.deepEqual([hidden?.skipped, hidden?.empty], ["comments.note is not categorical, so no condition on it is measured", undefined]);
  assert.deepEqual([key?.skipped, key?.empty], ["comments.id is not categorical, so no condition on it is measured", undefined], "a key is visible, and has a value per row");
  // An empty table shows no column's values, so it is empty before its condition is judged.
  const [empty] = await verify(db, config, extractOf(comments(0), table("photos", 40)), photoBranch("note"), noKeys);
  assert.deepEqual([empty?.skipped, empty?.empty], ["no non-null rows to test", true]);
  assert.deepEqual(db.queries, []);
});

test("against an integer key it leads, the join also counts the orphans past either end of it", async () => {
  const db = fakeDb(answer({ total: "500", nulls: "0", hits: "440", orphans_above: "60", orphans_below: "0" }));
  const [m] = await verify(db, config, extractOf(table("orders", 500), table("customers", 250)), claims({ relationships: [relationship("orders", "customers")] }), noKeys);
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
    const [m] = await verify(db, config, extract, join, noKeys);
    assert.doesNotMatch(db.queries[0]!, /orphans_/, label);
    assert.deepEqual(m?.numbers, numbers, label);
  }
});

const key = (name: string, rowEstimate: number): IntegerKey => ({ schema: "public", name, column: "id", rowEstimate });
/** A probe's answer: how many values a key spans, as node-postgres returns a numeric, or none for an empty key. */
const span = (n: number | null) => answer({ span: n === null ? null : String(n) });
const weighed = (candidates: number, alsoFits: number) => answer({ candidates: String(candidates), also_fits: String(alsoFits) });
const allMatch = (n: number) => answer({ total: String(n), nulls: "0", hits: String(n) });
/** The relations a weighing compared a join with, in the order its statement names them. */
const arms = (sql: string) => [...sql.matchAll(/max\("id"\) AS hi FROM "public"\."(\w+)"/g)].map((m) => m[1]);

test("a join confirmed on inference from an integer column is weighed last, against the other dense keys, in one statement over its own sampled rows that returns two counts", async () => {
  const keys = async () => [key("customers", 250), key("orders", 500), key("products", 80)];
  const suspicion: Claims["suspicions"][number] = { kind: "inconsistent_values", tables: ["orders"], column: "make", detail: "Ford / ford" };
  const run = async (orders: number) => {
    const db = fakeDb(allMatch(500), answer({ distinct_values: "3", canonical_forms: "3" }), span(250), span(500), span(80), weighed(2, 2));
    const tables = extractOf(table("orders", orders), table("customers", 250), table("products", 80));
    const measurements = await verify(db, config, tables, claims({ relationships: [relationship("orders", "customers")], suspicions: [suspicion] }), keys);
    return { db, measurements };
  };
  const { db, measurements } = await run(500);
  const [m, s] = measurements;
  assert.equal(s?.claimId, "suspicion:inconsistent_values:orders.make", "the measurements keep the order of the claims");
  assert.match(db.queries[1]!, /distinct_values/, "every claim is measured before a join is weighed");
  assert.equal(db.queries[2], 'SELECT max("id")::numeric - min("id") + 1 AS span FROM "public"."customers"', "a probe returns how many values the key spans, never an end of it");
  assert.equal(
    db.queries[5],
    `SELECT count(*) AS candidates, count(*) FILTER (WHERE k.lo <= v.lo AND k.hi >= v.hi) AS also_fits
  FROM (SELECT min(f."customer_id") AS lo, max(f."customer_id") AS hi FROM (SELECT * FROM "public"."orders" LIMIT 50000) f) v,
       (SELECT min("id") AS lo, max("id") AS hi FROM "public"."orders"
        UNION ALL SELECT min("id") AS lo, max("id") AS hi FROM "public"."products") k`,
    "over the rows the join was measured on, against every dense key but the target",
  );
  assert.equal(m?.query, `${db.queries[0]};\n${db.queries[5]}`, "the query kept is the join's statement, then this one");
  assert.deepEqual(m?.numbers, { total: 500, hits: 500, orphans: 0, hit: 1, nulls: 0, candidates: 2, alsoFits: 2 });

  const sampled = await run(500_000);
  const source = "(SELECT * FROM \"public\".\"orders\" TABLESAMPLE SYSTEM (10) REPEATABLE (1) LIMIT 150000) f";
  assert.ok(sampled.db.queries[0]!.includes(source) && sampled.db.queries[5]!.includes(source), "both statements read the same pages");
});

test("a branch is weighed on its own rows with its value bound, and its query ends with the one note that gives $1 for both statements", async () => {
  const branch = claims({ relationships: [{ ...relationship("comments", "posts", "commentable_id"), when: { column: "commentable_type", equals: "post" } }] });
  const db = fakeDb(allMatch(300), span(480), span(40), span(100), weighed(2, 1));
  const tables = extractOf(comments(480), table("photos", 40), table("posts", 100));
  const [m] = await verify(db, config, tables, branch, async () => [key("comments", 480), key("photos", 40), key("posts", 100)]);
  const rows = '(SELECT * FROM (SELECT * FROM "public"."comments" LIMIT 50000) w WHERE w."commentable_type"::text = $1) f';
  assert.ok(db.queries[4]!.includes(`FROM (SELECT min(f."commentable_id") AS lo, max(f."commentable_id") AS hi FROM ${rows}) v`), db.queries[4]!);
  assert.deepEqual(arms(db.queries[4]!), ["comments", "photos"]);
  assert.deepEqual(db.params, [["post"], [], [], [], ["post"]], "the value is bound to both statements, and to no probe");
  assert.equal(m?.query, `${db.queries[0]};\n${db.queries[4]}\n-- $1 = 'post'`);
  assert.deepEqual([m?.numbers.candidates, m?.numbers.alsoFits], [2, 1]);
});

test("a join stated, declared, broken, empty or unmeasured, or from a column that is not an integer, is not weighed", async () => {
  const keys = async () => [key("customers", 250), key("orders", 500), key("products", 80)];
  const join = claims({ relationships: [relationship("orders", "customers")] });
  const tables = extractOf(table("orders", 500), table("customers", 250));
  const declared = table("orders", 500, { foreignKeys: [{ column: "customer_id", refTable: "customers", refColumn: "id" }] });
  const numeric = table("orders", 500, { columns: [column("customer_id", "numeric", 250, false)] });
  const cases: [string, Claims, Extract, QueryResult][] = [
    ["stated", claims({ relationships: [{ ...relationship("orders", "customers"), basis: "stated" }] }), tables, allMatch(500)],
    ["declared, though the claim says inferred", join, extractOf(declared, table("customers", 250)), allMatch(500)],
    ["broken", join, tables, answer({ total: "500", nulls: "0", hits: "440" })],
    ["empty", join, tables, answer({ total: "0", nulls: "500", hits: "0" })],
    ["unmeasured", join, tables, { ok: false, reason: "timeout", message: "canceling statement due to statement timeout" }],
    ["from a numeric column", join, extractOf(numeric, table("customers", 250)), allMatch(500)],
  ];
  for (const [label, c, extract, reply] of cases) {
    // Answers for the probes and the weighing too, so that a join weighed by mistake is counted, not refused.
    const db = fakeDb(reply, span(250), span(500), span(80), weighed(2, 2));
    const [m] = await verify(db, config, extract, c, keys);
    assert.equal(db.queries.length, 1, label);
    assert.equal(m?.numbers.alsoFits, undefined, label);
  }
  // With the same answers, the join inferred from an integer column and confirmed is weighed.
  const db = fakeDb(allMatch(500), span(250), span(500), span(80), weighed(2, 2));
  const [m] = await verify(db, config, tables, join, keys);
  assert.deepEqual([db.queries.length, m?.numbers.candidates, m?.numbers.alsoFits], [5, 2, 2]);
});

test("the weighing leaves out the target, the from-column's own key, and a key that is empty, sparse or unreadable, and probes the keys once for every join", async () => {
  const keys = [key("customers", 250), key("vehicles", 120), key("audit", 300), key("cars", 10), key("sparse", 100), key("products", 80)];
  // vehicles.id is vehicles' own key, so the key that holds exactly its values is no evidence against it.
  const joins = claims({ relationships: [relationship("orders", "customers"), relationship("vehicles", "customers", "id")] });
  const tables = extractOf(table("orders", 500), table("vehicles", 120), table("customers", 250));
  const unreadable: QueryResult = { ok: false, reason: "error", message: "permission denied for table audit", sqlState: "42501" };

  const db = fakeDb(allMatch(500), allMatch(120), span(250), span(120), unreadable, span(null), span(991), span(80), weighed(2, 2), weighed(1, 1));
  const [orders, vehicles] = await verify(db, config, tables, joins, async () => keys);
  const probed = db.queries.slice(2, 8).map((sql) => /FROM "public"\."(\w+)"$/.exec(sql)?.[1]);
  assert.deepEqual(probed, ["customers", "vehicles", "audit", "cars", "sparse", "products"], "in the order given, once for both joins");
  assert.deepEqual(arms(db.queries[8]!), ["vehicles", "products"], "orders: not its target customers, nor audit, cars or sparse");
  assert.deepEqual(arms(db.queries[9]!), ["products"], "vehicles.id: not vehicles' own key either");
  assert.deepEqual([orders?.numbers.candidates, orders?.numbers.alsoFits, vehicles?.numbers.candidates, vehicles?.numbers.alsoFits], [2, 2, 1, 1]);

  const two = fakeDb(allMatch(500), allMatch(120), span(250), span(120), weighed(1, 1));
  const [twoOrders, twoVehicles] = await verify(two, config, tables, joins, async () => keys.slice(0, 2));
  assert.equal(two.queries.length, 5, "two probes, and one weighing: vehicles has no key left to be weighed against");
  assert.deepEqual(arms(two.queries[4]!), ["vehicles"]);
  assert.deepEqual([twoOrders?.numbers.alsoFits, twoVehicles?.numbers.alsoFits], [1, undefined]);
});

test("out of budget, the weighing claims nothing either way", async () => {
  const spent: QueryResult = { ok: false, reason: "budget", message: "time budget exhausted" };
  const keys = async () => [key("customers", 250), key("orders", 500)];
  const join = claims({ relationships: [relationship("orders", "customers")] });
  const tables = extractOf(table("orders", 500), table("customers", 250));

  const db = fakeDb(allMatch(500), span(250), span(500), spent);
  const [m] = await verify(db, config, tables, join, keys);
  assert.equal(db.queries.length, 4, "the weighing was tried");
  assert.deepEqual(m?.numbers, { total: 500, hits: 500, orphans: 0, hit: 1, nulls: 0 }, "the join's own numbers: an alsoFits of 0 would say that no other key holds its values");
  assert.equal(m?.query, db.queries[0]);
  assert.equal(m?.skipped, undefined, "the join itself was measured");
  assert.equal(decide(m!, config).status, "confirmed");

  const probes = fakeDb(allMatch(500), spent, spent);
  const [n] = await verify(probes, config, tables, join, keys);
  assert.equal(probes.queries.length, 3, "no key was found dense, so there is nothing to weigh against");
  assert.equal(n?.numbers.alsoFits, undefined);
});

/** vehicles, dated by one timestamp column, and the suspicion that it is dead. */
const vehicles = table("vehicles", 120, {
  columns: [{ name: "registered_at", type: "timestamp with time zone", nullable: false, nullRate: 0, distinct: 0, maxLength: 0, visible: false }],
});
const deadVehicles = claims({ suspicions: [{ kind: "dead_table", tables: ["vehicles"], detail: "replaced by a newer table" }] });

test("the dead-table age is counted in whole days by the statement, so the number kept is the number it reruns to", async () => {
  const db = fakeDb(answer({ count: 120, age_days: "3" }));
  const [m] = await verify(db, config, extractOf(vehicles), deadVehicles, noKeys);
  // Rounded up: a whole number over staleAfterDays exactly when the age is, so a table 90 days and an hour old is dead at 90.
  assert.equal(m?.query, 'SELECT count(*)::float8 AS count, ceil(EXTRACT(EPOCH FROM (now() - greatest(max("registered_at")))) / 86400) AS age_days FROM "public"."vehicles"');
  assert.deepEqual(m?.numbers, { exact: 1, count: 120, ageDays: 3 });
});

test("a dead-table age that is not a finite number is left out", async () => {
  // On Postgres 17 and later, now() less an infinite timestamp is an infinite interval, and its age -Infinity, which
  // JSON writes as null.
  const [m] = await verify(fakeDb(answer({ count: 120, age_days: "-Infinity" })), config, extractOf(vehicles), deadVehicles, noKeys);
  assert.deepEqual(m?.numbers, { exact: 1, count: 120 });
});
