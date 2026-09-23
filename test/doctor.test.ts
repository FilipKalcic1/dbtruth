import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { doctor, type DoctorDeps, type DoctorOptions } from "../src/doctor.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const CANARY = /canary-pii/;
const NO_KEY = "ok no API key: a full run needs ANTHROPIC_API_KEY; check and mcp do not";

/** The fixture URL as another user, percent-encoded as a URL must be. */
function fixtureAs(user: string, password: string): string {
  const url = new URL(FIXTURE_URL);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  return url.href;
}

/** A URL to a local port, with canary-pii everywhere the path to that port allows. */
const local = (port: number) => `postgres://canary-pii:canary-pii-pass@127.0.0.1:${port}/canary-pii`;

/** Runs doctor from an empty directory outside any repository: every line it prints, and whether the setup is ready. */
async function diagnose(opts: Partial<DoctorOptions>, deps: DoctorDeps = {}): Promise<{ ready: boolean; lines: string[] }> {
  const lines: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-doctor-"));
  const ready = await doctor({ flags: {}, cwd, env: {}, node: process.version, err: (line) => lines.push(line), ...opts }, deps);
  return { ready, lines };
}

/**
 * Runs `dbtruth <args>` as a user would, from an empty directory, without blocking, so a fake server in this process
 * can answer it. The environment holds no API key unless env gives one; a run that hangs is killed at 20 s.
 */
async function command(args: string[], env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-doctor-"));
  const base = { ...process.env, DATABASE_URL: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_MODEL: "" };
  const child = spawn(process.execPath, ["--import", TSX, CLI, ...args], { cwd, env: { ...base, ...env }, timeout: 20_000 });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const [status] = (await once(child, "close")) as [number | null];
  return { status, stdout, stderr };
}

/** Listens on a free local port and returns it. Connections still open are destroyed by `stop`. */
async function listen(server: Server): Promise<{ port: number; stop: () => void }> {
  const sockets: Socket[] = [];
  server.on("connection", (socket: Socket) => sockets.push(socket));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const stop = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  return { port: (server.address() as AddressInfo).port, stop };
}

/** One message of the Postgres protocol from a server: its type, its length, its body. */
function message(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.write(type);
  head.writeInt32BE(4 + body.length, 1);
  return Buffer.concat([head, body]);
}

const text = (...values: string[]) => Buffer.from(values.map((v) => `${v}\0`).join(""));
const errorResponse = (fields: Record<string, string>) => message("E", Buffer.concat([text(...Object.entries(fields).map(([k, v]) => k + v)), Buffer.from([0])]));
const AUTHENTICATION_OK = message("R", Buffer.alloc(4));
const READY = message("Z", Buffer.from("I"));

/** One row of text columns, as a server answers a simple query that returns it. */
function row(values: Record<string, string>): Buffer {
  const count = Buffer.alloc(2);
  count.writeInt16BE(Object.keys(values).length);
  const columns = Object.keys(values).map((name) => {
    // Table and column number 0, type text (25), variable length, no modifier, text format.
    const field = Buffer.alloc(18);
    field.writeInt32BE(25, 6);
    field.writeInt16BE(-1, 10);
    field.writeInt32BE(-1, 12);
    return Buffer.concat([text(name), field]);
  });
  const cells = Object.values(values).map((value) => {
    const length = Buffer.alloc(4);
    length.writeInt32BE(Buffer.byteLength(value));
    return Buffer.concat([length, Buffer.from(value)]);
  });
  return Buffer.concat([message("T", Buffer.concat([count, ...columns])), message("D", Buffer.concat([count, ...cells])), message("C", text("SELECT 1")), READY]);
}

/**
 * A fake Postgres for what a real one cannot be made to do: it accepts any startup and answers each simple query with
 * what `answer` gives for its text. Anything else a client sends, such as its goodbye, gets no answer.
 */
function fakePostgres(answer: (query: string) => Buffer): Server {
  return createServer((socket) => {
    let started = false;
    socket.on("data", (chunk) => {
      if (!started) socket.write(Buffer.concat([AUTHENTICATION_OK, READY]));
      else if (chunk.toString("latin1", 0, 1) === "Q") socket.write(answer(chunk.toString("utf8", 5)));
      started = true;
    });
  });
}

test("on the fixture every check is ok, as the owner and as a role that may only SELECT", { timeout: 20_000 }, async () => {
  for (const url of [FIXTURE_URL, fixtureAs("reader", "reader")]) {
    const { ready, lines } = await diagnose({ url, env: { ANTHROPIC_API_KEY: "sk-test" } }, { preflight: async () => {} });
    assert.equal(ready, true, lines.join("\n"));
    assert.match(lines[4]!, /^ok Postgres \d+$/);
    assert.deepEqual([...lines.slice(0, 4), ...lines.slice(5)], [
      `ok Node ${process.version}`,
      "ok settings from the environment",
      "ok database URL set",
      "ok connected to fixture",
      // For reader, whose CREATE TABLE is refused for want of privilege, the proof passes all the same.
      "ok read-only session proven",
      "ok 11 relations readable, 0 not",
      "ok ANTHROPIC_API_KEY works with claude-sonnet-5",
    ]);
  }
});

test("a role that can read some relations is told how many it cannot, and its password, which a URL must escape, is never printed", { timeout: 20_000 }, async () => {
  // test/fixtures/roles.sql
  const { ready, lines } = await diagnose({ url: fixtureAs("partial", "canary-pii :/?#[]@%&=+'") });
  assert.equal(ready, true, lines.join("\n"));
  assert.equal(lines[3], "ok connected to fixture");
  assert.equal(lines[6], "ok 2 relations readable, 9 not: measurements on those will be skipped", "the relations and how many of them");
  assert.equal(lines[7], NO_KEY, "a missing key is not a failure");
  for (const line of lines) assert.doesNotMatch(line, CANARY);
});

test("each connection failure has its own sentence and leaves the setup not ready, and nothing from the URL is printed", { timeout: 30_000 }, async () => {
  // What Postgres 16 and 18 answer an unencrypted startup when pg_hba.conf admits encrypted connections only.
  const sslOnly = await listen(
    createServer((socket) =>
      socket.once("data", () =>
        socket.end(errorResponse({ S: "FATAL", V: "FATAL", C: "28000", M: 'no pg_hba.conf entry for host "127.0.0.1", user "canary-pii", database "canary-pii", no encryption', F: "auth.c", L: "543", R: "ClientAuthentication" })),
      ),
    ),
  );
  // Accepts the connection and never answers, like a host behind a firewall that drops packets.
  const silent = await listen(createServer(() => {}));
  try {
    const failures: [string, Partial<DoctorOptions>, string][] = [
      ["connection refused", { url: "postgres://canary-pii:canary-pii-pass@localhost:1/canary-pii" }, "nothing is listening at the host and port in the URL; check them, and that the server is running"],
      ["host not found", { url: "postgres://canary-pii:canary-pii-pass@canary-pii.invalid/canary-pii" }, "the host in the URL was not found; check its spelling"],
      ["authentication failed", { url: fixtureAs("canary-pii", "canary-pii-pass") }, "authentication failed; check the user and password in the URL"],
      ["database does not exist", { url: FIXTURE_URL.replace(/\/fixture$/, "/canary-pii") }, "the database named in the URL does not exist on that server"],
      ["SSL required", { url: local(sslOnly.port) }, "the server's access rules refused this connection; if the server requires SSL, add sslmode=verify-full to the URL"],
      ["timeout", { url: local(silent.port), env: { DBTRUTH_STATEMENT_TIMEOUT_SECONDS: "0.5" } }, "the server did not answer within 0.5s; check the host and port in the URL, and any firewall on the way"],
    ];
    for (const [cause, opts, sentence] of failures) {
      const { ready, lines } = await diagnose(opts);
      assert.equal(ready, false, cause);
      assert.deepEqual(lines, [`ok Node ${process.version}`, "ok settings from the environment", "ok database URL set", `FAIL could not connect to the database: ${sentence}`, NO_KEY], cause);
      for (const line of lines) assert.doesNotMatch(line, CANARY, cause);
    }
  } finally {
    sslOnly.stop();
    silent.stop();
  }
});

test("a server that accepts the connection but refuses SET gets one sentence, and dbtruth closes the connection", { timeout: 20_000 }, async () => {
  let closed: Promise<unknown> = new Promise(() => {});
  const refusal = Buffer.concat([errorResponse({ S: "ERROR", V: "ERROR", C: "42704", M: 'unrecognized configuration parameter "canary-pii"' }), READY]);
  const server = fakePostgres(() => refusal);
  server.on("connection", (socket: Socket) => (closed = once(socket, "close")));
  const refusing = await listen(server);
  try {
    const { ready, lines } = await diagnose({ url: local(refusing.port) });
    assert.equal(ready, false);
    assert.equal(lines[3], "FAIL the server accepted the connection but refused to set up a read-only session (42704)");
    for (const line of lines) assert.doesNotMatch(line, CANARY);
    assert.equal(await Promise.race([closed.then(() => "closed"), delay(2_000, "left open")]), "closed");
  } finally {
    refusing.stop();
  }
});

test("a server that accepts a write in a read-only session fails the proof in the words of the full run, and one older than 12 fails too", { timeout: 20_000 }, async () => {
  // Every statement succeeds with one row: the database's name, the transaction mode, the major version and the
  // relation counts. The old server refuses the one that reads pg_class.relispartition, a column Postgres 9 does not have.
  const unproven = "FAIL the session asked for read-only mode but could not prove it: the server accepted a CREATE TABLE inside what should be a read-only transaction. dbtruth still issues only SELECT statements.";
  const noSuchColumn = Buffer.concat([errorResponse({ S: "ERROR", V: "ERROR", C: "42703", M: "column c.relispartition does not exist" }), READY]);
  const accepting = await listen(fakePostgres(() => row({ db: "fake", mode: "off", major: "16", readable: "0", unreadable: "0" })));
  const old = await listen(fakePostgres((query) => (query.includes("relispartition") ? noSuchColumn : row({ db: "fake", mode: "off", major: "9" }))));
  try {
    // On a server dbtruth supports the proof alone decides.
    const alone = await diagnose({ url: local(accepting.port) });
    assert.equal(alone.ready, false, "an accepted write leaves the setup not ready even when every other check passes");
    assert.deepEqual(alone.lines.slice(3), ["ok connected to fake", "ok Postgres 16", unproven, "ok 0 relations readable, 0 not", NO_KEY]);

    const { ready, lines } = await diagnose({ url: local(old.port) });
    assert.equal(ready, false);
    assert.deepEqual(lines.slice(3), ["ok connected to fake", "FAIL Postgres 9: dbtruth needs Postgres 12 or newer", unproven, NO_KEY]);
  } finally {
    accepting.stop();
    old.stop();
  }
});

test("with no database URL doctor says where to set it, runs no database check, and still checks the key", { timeout: 20_000 }, async () => {
  assert.deepEqual((await diagnose({})).lines, [
    `ok Node ${process.version}`,
    "ok settings from the environment",
    "FAIL no database URL: set DATABASE_URL in a .env, in the environment, pass --url, or read a file elsewhere with --dotenv <path>",
    NO_KEY,
  ]);

  // The settings are named as a full run names them: the .env found, relative to the working directory.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-repo-")));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "packages", "api"), { recursive: true });
  writeFileSync(join(root, ".env"), "ANTHROPIC_MODEL=from-root\n");
  const env = join("..", "..", ".env");
  const { ready, lines } = await diagnose({ cwd: join(root, "packages", "api") });
  assert.equal(ready, false);
  assert.deepEqual(lines, [
    `ok Node ${process.version}`,
    `ok settings from ${env}`,
    `FAIL no database URL: set DATABASE_URL in ${env}, in the environment, pass --url, or read a file elsewhere with --dotenv <path>`,
    NO_KEY,
  ]);
});

test("settings a full run could not use fail the settings check: a --dotenv that cannot be read, a tunable that is not a number", { timeout: 20_000 }, async () => {
  // "." names the working directory, which exists but cannot be read as a file.
  const unreadable = await diagnose({ dotenv: "." });
  assert.equal(unreadable.ready, false);
  assert.equal(unreadable.lines.length, 2, unreadable.lines.join("\n"));
  assert.match(unreadable.lines[1]!, /^FAIL --dotenv \.: could not read it \(EISDIR: .+\)$/);

  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-doctor-"));
  writeFileSync(join(cwd, ".env"), "DBTRUTH_STATEMENT_TIMEOUT_SECONDS=abc\n");
  const invalid = await diagnose({ cwd });
  assert.equal(invalid.ready, false);
  assert.deepEqual(invalid.lines.slice(1), ['FAIL DBTRUTH_STATEMENT_TIMEOUT_SECONDS / --statement-timeout-seconds: "abc" is not a number']);
});

test("an old Node alone leaves the setup not ready, every other check passing on the fixture", { timeout: 20_000 }, async () => {
  const old = await diagnose({ node: "v18.19.0", url: FIXTURE_URL });
  assert.equal(old.ready, false);
  assert.deepEqual(old.lines.filter((line) => line.startsWith("FAIL")), ["FAIL Node v18.19.0: dbtruth needs Node 20 or newer"], "the only check that fails");
});

test("as a command, doctor exits 1 when a check from 1 to 6 fails, takes --url and --dotenv on either side of its name, and prints nothing on stdout", { timeout: 60_000 }, async () => {
  // --url wins over DATABASE_URL, which holds the fixture, after the name as before it: were the option dropped, or
  // taken for the full run's, doctor would pass.
  const refusedUrl = "postgres://canary-pii:canary-pii-pass@localhost:1/canary-pii";
  for (const args of [["doctor", "--url", refusedUrl], ["--url", refusedUrl, "doctor"]]) {
    const refused = await command(args, { DATABASE_URL: FIXTURE_URL });
    assert.equal(refused.status, 1, args.join(" "));
    assert.equal(refused.stdout, "");
    assert.match(refused.stderr, /^FAIL could not connect to the database: nothing is listening at the host and port in the URL; /m);
    assert.doesNotMatch(refused.stderr, CANARY);
  }

  // A server that refuses the password: whatever the driver or Node might write to the streams, the password is not there.
  const wrong = await command(["doctor", "--url", fixtureAs("canary-pii", "canary-pii-pass")], {});
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stdout, "");
  assert.match(wrong.stderr, /^FAIL could not connect to the database: authentication failed; /m);
  assert.doesNotMatch(wrong.stderr, CANARY);

  const missing = await command(["doctor", "--dotenv", "nope.env"], { DATABASE_URL: FIXTURE_URL });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.deepEqual(missing.stderr.split("\n").slice(1), ["FAIL --dotenv nope.env: no such file", ""]);

  // A tunable before the name is the full run's flag, and reaches doctor's settings check.
  const tunable = await command(["--statement-timeout-seconds", "abc", "doctor"], { DATABASE_URL: FIXTURE_URL });
  assert.equal(tunable.status, 1);
  assert.deepEqual(tunable.stderr.split("\n").slice(1), ['FAIL DBTRUTH_STATEMENT_TIMEOUT_SECONDS / --statement-timeout-seconds: "abc" is not a number', ""]);
});

test("as a command, the key check asks the API for the model and nothing else, and each API error it explains has its sentence", { timeout: 60_000 }, async () => {
  const requests: string[] = [];
  let status = 200;
  const api = createHttpServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(status, { "content-type": "application/json" });
    // A 400 and a 500 are told with the API's own words, which are these.
    const error = { type: "error", error: { type: "error", message: "refused by the test" } };
    response.end(JSON.stringify(status === 200 ? { type: "model", id: "claude-sonnet-5", display_name: "Claude Sonnet 5", created_at: "2026-01-01T00:00:00Z" } : error));
  });
  const { port, stop } = await listen(api);
  const withKey = { DATABASE_URL: FIXTURE_URL, ANTHROPIC_API_KEY: "sk-canary-pii", ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` };
  try {
    for (const [code, line] of [
      [200, "ok ANTHROPIC_API_KEY works with claude-sonnet-5"],
      [401, "FAIL the Anthropic API rejected the key. Set ANTHROPIC_API_KEY in the environment or in a .env file in this directory or its parents up to the repository root; keys are created at console.anthropic.com."],
      [403, 'FAIL this key is not allowed to use model "claude-sonnet-5". Check ANTHROPIC_MODEL or the key\'s permissions.'],
      [404, 'FAIL model "claude-sonnet-5" does not exist for this key. Check ANTHROPIC_MODEL.'],
      [429, "FAIL the Anthropic API is rate-limiting this key (429). Wait a minute and run again."],
      [400, 'FAIL the Anthropic API rejected the request (400): 400 {"type":"error","error":{"type":"error","message":"refused by the test"}}'],
      [500, 'FAIL the Anthropic API returned 500: 500 {"type":"error","error":{"type":"error","message":"refused by the test"}}'],
    ] as const) {
      status = code;
      requests.length = 0;
      const r = await command(["doctor"], withKey);
      const lines = r.stderr.split("\n");
      assert.equal(r.status, 0, `${code}: the key check informs, the database checks decide\n${r.stderr}`);
      assert.equal(r.stdout, "");
      assert.equal(lines.length, 9, r.stderr);
      assert.ok(lines.slice(0, 7).every((l) => l.startsWith("ok ")), r.stderr);
      assert.equal(lines[7], line);
      assert.doesNotMatch(r.stderr, CANARY);
      // No messages call, so no tokens: every request, retries included, is the model's own page.
      assert.ok(requests.length > 0 && requests.every((request) => request === "GET /v1/models/claude-sonnet-5"), `${code}: ${requests.join(", ")}`);
    }

    // Nothing listening where the API should be, as behind a proxy or firewall that refuses the connection.
    const unreachable = await command(["doctor"], { ...withKey, ANTHROPIC_BASE_URL: "http://127.0.0.1:1" });
    assert.equal(unreachable.status, 0, unreachable.stderr);
    assert.equal(unreachable.stdout, "");
    assert.equal(unreachable.stderr.split("\n")[7], "FAIL could not reach the Anthropic API: Connection error.");
    assert.doesNotMatch(unreachable.stderr, CANARY);

    requests.length = 0;
    const noKey = await command(["doctor"], { ...withKey, ANTHROPIC_API_KEY: "" });
    assert.equal(noKey.status, 0);
    assert.equal(noKey.stderr.split("\n")[7], NO_KEY);
    assert.deepEqual(requests, [], "without a key the API is not called at all");
  } finally {
    stop();
  }
});
