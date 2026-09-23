import { test } from "node:test";
import assert from "node:assert/strict";
import { claimsSchema, findTable } from "../src/schemas.js";

const tables = [
  { name: "orders", schema: "public" },
  { name: "Orders", schema: "public" },
  { name: "app.events", schema: "app" },
];

test("a claim's table name is matched exactly first, then regardless of case, by display or qualified name", () => {
  assert.equal(findTable(tables, "Orders")?.name, "Orders", "an exact match wins over a case-insensitive one");
  assert.equal(findTable(tables, "ORDERS")?.name, "orders", "the first case-insensitive match otherwise");
  assert.equal(findTable(tables, "public.orders")?.name, "orders", "the qualified spelling of a public table");
  assert.equal(findTable(tables, " app.events ")?.name, "app.events");
  assert.equal(findTable(tables, "APP.EVENTS")?.name, "app.events");
  assert.equal(findTable(tables, "events"), undefined, "a bare name outside public is not guessed");
  assert.equal(findTable(tables, undefined), undefined);
});

test("validated claims spell every table as the extract does, and are deduplicated after that", () => {
  const relationship = (from: string, basis: "stated" | "inferred") => ({ from: { table: from, column: "customer_id" }, to: { table: "public.orders", column: "id" }, basis, confidence: 0.5, reason: "x" });
  const claims = claimsSchema(tables).parse({
    entities: [{ name: "order", primaryTable: "ORDERS", referencedIn: ["App.Events", "nowhere"], basis: "inferred", confidence: 1, reason: "x" }],
    tables: [{ name: "public.orders", purpose: "p", grain: "g", basis: "inferred", confidence: 1 }],
    relationships: [relationship("app.events", "inferred"), relationship("APP.EVENTS", "stated"), relationship("Orders", "inferred")],
    suspicions: [
      { kind: "dead_table", tables: ["Public.Orders"], detail: "a" },
      { kind: "dead_table", tables: ["orders"], detail: "b" },
    ],
  });
  assert.deepEqual(claims.entities[0], { name: "order", primaryTable: "orders", referencedIn: ["app.events", "nowhere"], basis: "inferred", confidence: 1, reason: "x" }, "an unknown name is kept as spelled");
  assert.equal(claims.tables[0]!.name, "orders");
  assert.deepEqual(
    claims.relationships.map((r) => [r.from.table, r.basis]),
    [["app.events", "stated"], ["Orders", "inferred"]],
    "two spellings of one relationship are one claim, and the stated copy wins; a table that differs only by case is another table",
  );
  assert.deepEqual(claims.suspicions, [{ kind: "dead_table", tables: ["orders"], detail: "a; b" }], "suspicions on one table merge their details");
});
