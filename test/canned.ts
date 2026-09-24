// What an offline run is told by the model: the claims a competent contextualize pass proposes for the fixture, the
// files the writer replies with, and a transport that answers each prompt with one of them and records the request.

import type { Transport } from "../src/model.js";

// What a competent contextualize pass proposes for the fixture. The data decides.
export const cannedClaims = {
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

export const cannedFiles = {
  "context/README.md": "# fixture\n\nBroken: orders.customer_id -> customers.id (88%).\n",
  "context/ENTITIES.md": "# Entities\n",
  "context/tables/orders.md": "# orders\n",
  "../escape.md": "must not be written",
};

export function fakeModel(claims: object = cannedClaims): { transport: Transport; requests: string[] } {
  const requests: string[] = [];
  const transport: Transport = async (system, messages) => {
    requests.push(JSON.stringify({ system, messages }));
    return system.includes("writing reference files") ? JSON.stringify(cannedFiles) : JSON.stringify(claims);
  };
  return { transport, requests };
}
