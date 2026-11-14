// A real PgBouncer in transaction mode in front of the fixture: what the audit after 0.4.2 measured. Each test starts
// pgbouncer itself on a free port. Without the binary the tests skip, except under CI, which installs it.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { connect as tcpConnect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { connect } from "../src/safety.js";
import { config } from "../src/config.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const TIMEOUT_SECONDS = 7;
const STARTUP_MS = 10_000;

/** Whether the test can run: pgbouncer is installed. Under CI a missing pgbouncer fails, so the tests never skip there. */
function pgbouncerFor(t: TestContext): boolean {
  if (spawnSync("pgbouncer", ["--version"]).status === 0) return true;
  if (process.env.CI) assert.fail("pgbouncer is not installed: CI installs it so that these tests run");
  t.skip("pgbouncer is not installed");
  return false;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/** Starts pgbouncer in transaction mode with poolSize server connections to the fixture, and returns its URL. */
async function pooler(t: TestContext, poolSize: number): Promise<string> {
  const target = new URL(FIXTURE_URL);
  const user = decodeURIComponent(target.username);
  const database = target.pathname.slice(1);
  const dir = mkdtempSync(join(tmpdir(), "dbtruth-pooler-"));
  // Readable by the unprivileged user pgbouncer switches to when started as root.
  chmodSync(dir, 0o755);
  const port = await freePort();
  writeFileSync(join(dir, "users.txt"), `"${user}" ""\n`, { mode: 0o644 });
  const server = `host=${target.hostname} port=${target.port || "5432"} dbname=${database} user=${user} password=${decodeURIComponent(target.password)}`;
  const ini = [
    "[databases]",
    `${database} = ${server} pool_size=${poolSize}`,
    "[pgbouncer]",
    "listen_addr = 127.0.0.1",
    `listen_port = ${port}`,
    "unix_socket_dir =",
    "auth_type = trust",
    `auth_file = ${join(dir, "users.txt")}`,
    "pool_mode = transaction",
    "max_client_conn = 20",
    "ignore_startup_parameters = extra_float_digits,options",
  ];
  writeFileSync(join(dir, "pgbouncer.ini"), ini.join("\n") + "\n", { mode: 0o644 });
  // PgBouncer refuses to run as root; -u has it drop to an unprivileged user.
  const args = process.getuid?.() === 0 ? ["-u", "nobody", join(dir, "pgbouncer.ini")] : [join(dir, "pgbouncer.ini")];
  const child = spawn("pgbouncer", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  t.after(() => {
    child.kill();
  });
  const deadline = Date.now() + STARTUP_MS;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`pgbouncer exited with ${child.exitCode}: ${stderr}`);
    const listening = await new Promise<boolean>((resolve) => {
      const socket = tcpConnect(port, "127.0.0.1");
      socket.once("connect", () => (socket.destroy(), resolve(true)));
      socket.once("error", () => resolve(false));
    });
    if (listening) break;
    if (Date.now() > deadline) throw new Error(`pgbouncer did not listen on ${port} within ${STARTUP_MS} ms: ${stderr}`);
    await sleep(100);
  }
  const url = new URL(FIXTURE_URL);
  url.hostname = "127.0.0.1";
  url.port = String(port);
  return url.toString();
}

async function show(url: string, settings: string[]): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const values: string[] = [];
    for (const setting of settings) values.push(String((await client.query(`SHOW ${setting}`)).rows[0]?.[setting]));
    return values;
  } finally {
    await client.end();
  }
}

test("through PgBouncer in transaction mode, a client after dbtruth finds the server connection's own defaults", async (t) => {
  if (!pgbouncerFor(t)) return;
  const settings = ["default_transaction_read_only", "statement_timeout"];
  const defaults = await show(FIXTURE_URL, settings);
  const url = await pooler(t, 1);

  const db = await connect(url, { ...config, statementTimeoutSeconds: TIMEOUT_SECONDS });
  assert.equal(db.readOnlyProven, true);
  const ran = await db.query("SELECT count(*) AS n FROM customers");
  assert.equal(ran.ok, true);
  // A failed statement aborts its transaction: left open, it would stay on the server connection for the next client.
  const failed = await db.query("SELECT no_such_column FROM customers");
  assert.equal(failed.ok, false);
  await db.close();

  // One server connection: the application gets the one dbtruth used. The audit's application then failed with 25006.
  assert.deepEqual(await show(url, settings), defaults, "dbtruth's settings must not stay on the server connection for the next client");
});

test("through PgBouncer in transaction mode, dbtruth's statements run read-only with its timeout on whichever server connection they get", async (t) => {
  if (!pgbouncerFor(t)) return;
  const url = await pooler(t, 2);
  const db = await connect(url, { ...config, statementTimeoutSeconds: TIMEOUT_SECONDS });
  const app = new pg.Client({ connectionString: url });
  await app.connect();
  try {
    // The application holds the server connection dbtruth set up on, so dbtruth's next statement gets the other one.
    await app.query("BEGIN");
    const appPid = Number((await app.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
    const r = await db.query(
      "SELECT current_setting('transaction_read_only') AS read_only, current_setting('statement_timeout') AS timeout, pg_backend_pid() AS pid",
    );
    assert.equal(r.ok, true);
    const row = r.ok ? r.rows[0] : undefined;
    assert.notEqual(Number(row?.pid), appPid, "the scenario: dbtruth's statement ran on a server connection of its own");
    assert.equal(row?.read_only, "on", "read-only on a server connection dbtruth never set up");
    assert.equal(row?.timeout, `${TIMEOUT_SECONDS}s`, "with the configured timeout there too");
  } finally {
    await app.query("ROLLBACK");
    await app.end();
    await db.close();
  }
});
