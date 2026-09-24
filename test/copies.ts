// Throwaway copies of fixture_template for the tests that change data. The template is made last at init time and
// takes no connections, so a copy can be made while other test files hold sessions on fixture, and no test ever
// connects to it. Nothing here keeps a session open between statements.

import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import pg from "pg";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const INVALID_CATALOG_NAME = "3D000";

/** A new copy of fixture_template under a name of its own, dropped when the test ends, and a way to run one statement in it. */
export async function copyOfFixture(t: TestContext): Promise<{ url: string; sql: (statement: string) => Promise<void> }> {
  const name = `dbtruth_copy_${randomUUID().replace(/-/g, "")}`;
  try {
    await once(urlOf("postgres"), `CREATE DATABASE ${name} TEMPLATE fixture_template`);
  } catch (e) {
    if ((e as { code?: string }).code !== INVALID_CATALOG_NAME) throw e;
    throw new Error("fixture_template does not exist: recreate the fixture databases with docker compose down -v && docker compose up -d --wait");
  }
  // Without FORCE, which Postgres 12 lacks: a session the test left open makes the drop, and so the test, fail.
  t.after(() => once(urlOf("postgres"), `DROP DATABASE ${name}`));
  const url = urlOf(name);
  return { url, sql: (statement) => once(url, statement) };
}

/** The fixture's URL, for another database on the same server. */
function urlOf(database: string): string {
  return FIXTURE_URL.replace(/\/[^/]+$/, `/${database}`);
}

async function once(url: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}
