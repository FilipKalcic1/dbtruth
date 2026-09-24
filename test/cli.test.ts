import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { doctor } from "../src/doctor.js";
import { writeUnreadable } from "./unreadable.js";

const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/**
 * Runs the CLI from cwd with no DATABASE_URL and no API key in the environment, so the settings files decide, and a run
 * that gets past its settings without a key stops at the API check before any network. One that hangs fails at 20 s.
 */
function cli(args: string[], cwd: string) {
  const env = { ...process.env, DATABASE_URL: undefined, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: "" };
  const result = spawnSync(process.execPath, ["--import", TSX, CLI, ...args], { cwd, env, encoding: "utf8", timeout: 20_000 });
  assert.ifError(result.error);
  return result;
}

/** A temporary repository, by its real path, with an empty packages/api to run from. */
function repository(): { root: string; api: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-repo-")));
  mkdirSync(join(root, ".git"));
  const api = join(root, "packages", "api");
  mkdirSync(api, { recursive: true });
  return { root, api };
}

test("--version prints the version in package.json and nothing else, and exits 0", () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  // Run from a directory with no package.json, so the version has to come from next to the code, and with
  // no database URL, so a flag that fell through to a full run would stop there, before any network.
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-cli-"));
  const env = { ...process.env, DATABASE_URL: "" };
  for (const flag of ["--version", "-v"]) {
    // Each run takes about a second; one that hangs is killed at 20 s and fails with ETIMEDOUT.
    const result = spawnSync(process.execPath, ["--import", TSX, CLI, flag], { cwd, env, encoding: "utf8", timeout: 20_000 });
    assert.equal(result.error, undefined, `${flag}: ${result.error?.message}`);
    assert.equal(result.stdout, `${version}\n`, `${flag}: ${result.stderr}`);
    assert.equal(result.status, 0, flag);
  }
});

test("with no database URL anywhere, the error lists the directories searched and one fix per line, and exits 1", () => {
  const { root, api } = repository();
  const result = cli([], api);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(result.stderr.split("\n"), [
    "no database URL: DATABASE_URL is not in the environment or in a .env",
    `  searched ${api}`,
    `  searched ${join(root, "packages")}`,
    `  searched ${root}`,
    "set it to postgres://user:password@host:5432/dbname in one of these ways:",
    "  in a .env in one of those directories",
    "  in the environment",
    "  with --url",
    "  in a file elsewhere, read with --dotenv <path>",
    "",
  ]);

  // A .env found without the URL is named, and so is a nearer one that could not be read, which is why the file
  // further up was used.
  writeUnreadable(join(api, ".env"), "DATABASE_URL=postgres://nearer\n");
  writeFileSync(join(root, ".env"), "ANTHROPIC_MODEL=from-root\n");
  const file = join("..", "..", ".env");
  const [unreadable, ...lines] = cli([], api).stderr.split("\n");
  assert.match(unreadable!, /^could not read \.env \((EACCES|EPERM): .+\)$/);
  assert.deepEqual(lines, [
    `reading settings from ${file}`,
    `no database URL: DATABASE_URL is not in the environment or in ${file}`,
    `  searched ${api}`,
    `  searched ${join(root, "packages")}`,
    `  searched ${root}`,
    "set it to postgres://user:password@host:5432/dbname in one of these ways:",
    `  in ${file}`,
    "  in the environment",
    "  with --url",
    "  in a file elsewhere, read with --dotenv <path>",
    "",
  ]);
});

test("from a symlinked directory, the settings file is named by a path that opens it from there, and not at all when it is in that directory", async () => {
  const { root, api } = repository();
  writeFileSync(join(root, ".env"), "ANTHROPIC_MODEL=from-root\n");
  const link = join(realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-link-"))), "api");
  // A junction needs no administrator rights on Windows; other systems ignore the type and make a symlink.
  symlinkSync(api, link, "junction");
  const shown = cli([], link).stderr.split("\n")[0]!.replace(/^reading settings from /, "");
  // Windows resolves ".." in the path as written, Linux from the real directory; the path has to work for both.
  const read = spawnSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))", shown], { cwd: link, encoding: "utf8" });
  assert.equal(read.stdout, "ANTHROPIC_MODEL=from-root\n", `${shown}: ${read.stderr}`);

  // run() is given the link itself, as process.cwd() gives it on Windows, so every system checks that the file is
  // placed by its real directory, not by the path it is named with.
  writeFileSync(join(api, ".env"), "ANTHROPIC_MODEL=from-api\n");
  const err: string[] = [];
  await run({ samples: true, reveal: [], json: false, flags: {}, cwd: link, env: {}, out: () => {}, err: (l) => err.push(l) });
  assert.match(err[0]!, /^no database URL: /);
});

test("--dotenv reads the file it names, and a missing one exits 1 with one line that says so", () => {
  const { root, api } = repository();
  mkdirSync(join(root, "settings"));
  writeFileSync(join(root, "settings", "db.env"), "DATABASE_URL=postgres://nobody:pw@localhost:1/none\n");
  // The URL is only in the named file, so the run gets past it and stops for want of a key, before any network.
  const file = join("..", "..", "settings", "db.env");
  const named = cli(["--dotenv", file], api);
  assert.equal(named.status, 1);
  assert.equal(named.stderr.split("\n")[0], `reading settings from ${file}`);
  assert.match(named.stderr, /^dbtruth: no API key found\. /m);

  const missing = cli(["--dotenv", "nope.env"], api);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.equal(missing.stderr, "--dotenv nope.env: no such file\n");
});

test("a key that is set but cannot be sent, such as one with a curly quote pasted into it, is named with the reason", () => {
  // Node refuses the header before a request is made, so this needs no network, and the database is never reached.
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-cli-"));
  writeFileSync(join(cwd, ".env"), "DATABASE_URL=postgres://nobody:pw@localhost:1/none\nANTHROPIC_API_KEY=sk-ant-\u2019canary-pii\n");
  const result = cli([], cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^dbtruth: could not send a request to the Anthropic API: Cannot convert argument to a ByteString\b.*\. Check the key in ANTHROPIC_API_KEY\.$/m);
  assert.doesNotMatch(result.stderr, /no API key found/, "a key was found; it could not be sent");
  assert.doesNotMatch(result.stderr, /canary-pii/);
});

test("doctor's Node check reads the version it is given: below 20 fails, 20 and later pass", async () => {
  // No URL and no key, so nothing after the settings check reaches a database or the network.
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-doctor-"));
  for (const [node, line] of [
    ["v18.19.0", "FAIL Node v18.19.0: dbtruth needs Node 20 or newer"],
    ["v19.9.0", "FAIL Node v19.9.0: dbtruth needs Node 20 or newer"],
    ["v20.0.0", "ok Node v20.0.0"],
    ["v24.4.1", "ok Node v24.4.1"],
  ] as const) {
    const lines: string[] = [];
    await doctor({ flags: {}, cwd, env: {}, node, err: (l) => lines.push(l) });
    assert.equal(lines[0], line);
  }
});
