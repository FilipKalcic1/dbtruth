import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { verify } from "../src/verify.js";
import type { Db } from "../src/safety.js";
import type { Claims, Extract, Table } from "../src/schemas.js";

const table = (name: string, rowEstimate: number): Table => ({
  name,
  schema: "public",
  kind: "table",
  rowEstimate,
  primaryKey: ["id"],
  foreignKeys: [],
  columns: [
    { name: "customer_id", type: "integer", nullable: false, nullRate: 0, distinct: 0, maxLength: 0, visible: true },
    { name: "id", type: "integer", nullable: false, nullRate: 0, distinct: 0, maxLength: 0, visible: true },
  ],
  samples: [],
});

const extract: Extract = {
  database: "fixture",
  tables: [table("orders", 0), table("customers", 10)],
  skipped: [],
  schemaTokens: 0,
  unmatchedReveal: [],
};

const claims: Claims = {
  entities: [],
  tables: [],
  relationships: [{
    from: { table: "orders", column: "customer_id" },
    to: { table: "customers", column: "id" },
    basis: "inferred",
    confidence: 1,
    reason: "name",
  }],
  suspicions: [],
  questions: [],
};

test("verify skips empty source tables without querying the database", async () => {
  let queryCount = 0;
  const db = {
    database: "fixture",
    readOnlyProven: true,
    query: async () => {
      queryCount += 1;
      throw new Error("empty source should not be queried");
    },
    catalog: async () => ({ ok: true as const, rows: [] }),
    budget: () => ({ budgetMs: 1000, spentMs: 0, remainingMs: 1000, exhausted: false }),
    close: async () => {},
  } satisfies Db;

  const [measurement] = await verify(db, config, extract, claims);
  assert.equal(queryCount, 0);
  assert.equal(measurement?.empty, true);
  assert.equal(measurement?.skipped, "no non-null rows to test");
  assert.deepEqual(measurement?.numbers, { total: 0 });
  assert.match(measurement?.query ?? "", /orders has no rows/);
});