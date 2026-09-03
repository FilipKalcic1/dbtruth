import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, readDotEnv, resolveDatabaseUrl } from "../src/safety.js";
import { config } from "../src/config.js";

export const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";

test("the session is proven read-only and only SELECT statements get through", async () => {
  const db = await connect(FIXTURE_URL, config);
  try {
    assert.equal(db.readOnlyProven, true);
    assert.equal(db.database, "fixture");

    const refused = await db.query("INSERT INTO customers (id) VALUES (999999)");
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.reason, "refused");

    const alsoRefused = await db.query("  DELETE FROM customers");
    assert.equal(!alsoRefused.ok && alsoRefused.reason, "refused");

    const ok = await db.query("SELECT count(*) AS n FROM customers");
    assert.equal(ok.ok, true);
    assert.equal(ok.ok && Number(ok.rows[0]?.n), 250);

    // The preflight rolled back: its table must not exist.
    const leftover = await db.query("SELECT to_regclass('dbtruth_preflight_must_fail') AS t");
    assert.equal(leftover.ok && leftover.rows[0]?.t, null);
  } finally {
    await db.close();
  }
});

test("a role without CREATE privilege is still proven read-only, with no warning", async () => {
  // The Postgres 15+ default for non-owners: no CREATE on public, so the write attempt fails with 42501, not 25006.
  const warnings: string[] = [];
  const db = await connect(FIXTURE_URL.replace("dbtruth:dbtruth@", "reader:reader@"), { ...config, warn: (m) => warnings.push(m) });
  try {
    assert.equal(db.readOnlyProven, true, "the server states the transaction is read-only; that is the proof");
    assert.deepEqual(warnings, []);
    const ok = await db.query("SELECT count(*) AS n FROM customers");
    assert.equal(ok.ok && Number(ok.rows[0]?.n), 250);
  } finally {
    await db.close();
  }
});

test("a statement timeout is a skipped measurement, and the connection stays usable", async () => {
  const db = await connect(FIXTURE_URL, { ...config, statementTimeoutSeconds: 0.2 });
  try {
    const slow = await db.query("SELECT pg_sleep(2)");
    assert.equal(slow.ok, false);
    assert.equal(!slow.ok && slow.reason, "timeout");

    const next = await db.query("SELECT 1 AS one");
    assert.equal(next.ok && Number(next.rows[0]?.one), 1);
  } finally {
    await db.close();
  }
});

test("a SQL error is a skipped measurement, not a crash", async () => {
  const db = await connect(FIXTURE_URL, config);
  try {
    const bad = await db.query("SELECT no_such_column FROM customers");
    assert.equal(bad.ok, false);
    assert.equal(!bad.ok && bad.reason, "error");
    assert.equal(!bad.ok && bad.sqlState, "42703", "the SQLSTATE travels with the error so callers can tell a datatype problem from a missing column");
    const next = await db.query("SELECT 1 AS one");
    assert.equal(next.ok, true);
  } finally {
    await db.close();
  }
});

test("an exhausted budget skips instead of querying, but catalog reads still run", async () => {
  const db = await connect(FIXTURE_URL, { ...config, budgetSeconds: 0 });
  try {
    const r = await db.query("SELECT 1");
    assert.equal(!r.ok && r.reason, "budget");
    assert.equal(db.budget().exhausted, true);
    const c = await db.catalog("SELECT count(*) AS n FROM pg_class");
    assert.equal(c.ok, true);
    const refused = await db.catalog("DELETE FROM customers");
    assert.equal(!refused.ok && refused.reason, "refused", "catalog reads are still read-only");
  } finally {
    await db.close();
  }
});

test("a connection failure rejects with a message that does not contain the password", async () => {
  await assert.rejects(
    connect("postgres://nobody:secret-password@localhost:1/none", config),
    (e: unknown) => e instanceof Error && !e.message.includes("secret-password"),
  );
});

test("DATABASE_URL resolves from flag, then env; .env is read as key=value pairs", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "dbtruth-"));
  writeFileSync(join(dir, ".env"), '# comment\nOTHER=1\nexport DATABASE_URL="postgres://from-dotenv"\nANTHROPIC_API_KEY=sk-test\n');

  assert.equal(resolveDatabaseUrl("postgres://flag", { DATABASE_URL: "postgres://env" }), "postgres://flag");
  assert.equal(resolveDatabaseUrl(undefined, { DATABASE_URL: "postgres://env" }), "postgres://env");
  assert.equal(resolveDatabaseUrl(undefined, {}), undefined);
  assert.deepEqual(readDotEnv(dir), { OTHER: "1", DATABASE_URL: "postgres://from-dotenv", ANTHROPIC_API_KEY: "sk-test" });
  assert.deepEqual(readDotEnv(tmpdir()), {});
  assert.equal(resolveDatabaseUrl(undefined, { ...readDotEnv(dir), DATABASE_URL: "" }), undefined, "an empty environment value wins over .env, meaning unset");
});
