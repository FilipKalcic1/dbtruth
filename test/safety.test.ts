import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { connect, findDotEnv, isIntegerType, readDotEnv, resolveDatabaseUrl, sampleSource } from "../src/safety.js";
import { config } from "../src/config.js";
import { writeUnreadable } from "./unreadable.js";

export const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";

/** A temporary directory, by its real path, holding the given files; a null content makes a directory. */
function tree(entries: Record<string, string | null>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-env-")));
  for (const [path, content] of Object.entries(entries)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    if (content === null) mkdirSync(join(root, path));
    else writeFileSync(join(root, path), content);
  }
  return root;
}

test("a large table is sampled at the share of pages that holds the sample size, and the LIMIT only caps a stale estimate", () => {
  const big = { schema: "public", name: "big", rowEstimate: 1_000_000 };
  const sampled = sampleSource(big, config);
  const percent = (config.sampleRows / big.rowEstimate) * 100;
  assert.match(sampled, new RegExp(`TABLESAMPLE SYSTEM \\(${percent}\\) REPEATABLE \\(${config.sampleSeed}\\)`), "the share of pages that holds about sampleRows rows");
  assert.match(sampled, new RegExp(`LIMIT ${config.sampleRows * config.sampleOversample}\\)$`), "pages come in file order, so a LIMIT at the sample size would keep only the oldest");
  assert.match(sampleSource({ ...big, rowEstimate: 1e12 }, config), /SYSTEM \(0\.000005\)/, "a tiny share is not rounded away to nothing");
  assert.match(sampleSource({ ...big, rowEstimate: 3_000_000 }, config), /SYSTEM \(1\.667\)/, "four significant digits, no floating-point noise in a query a human reruns");
  assert.equal(sampleSource({ ...big, rowEstimate: config.sampleRows }, config), `(SELECT * FROM "public"."big" LIMIT ${config.sampleRows})`, "a table no larger than the sample is read whole");
  assert.equal(sampleSource(big, config, false), `(SELECT * FROM "public"."big" LIMIT ${config.sampleRows})`, "the plain form on request");
});

test("isIntegerType is smallint, integer and bigint, by declared type", () => {
  for (const type of ["smallint", "integer", "bigint", " Integer "]) assert.equal(isIntegerType(type), true, type);
  for (const type of ["numeric", "integer[]", "real", "text", "oid"]) assert.equal(isIntegerType(type), false, type);
});

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

test("from a nested package, the .env at the repository root is found", () => {
  const root = tree({ ".git": null, ".env": "DATABASE_URL=postgres://root\n", "packages/api": null });
  const api = join(root, "packages", "api");
  assert.deepEqual(findDotEnv(api), {
    path: join(root, ".env"),
    values: { DATABASE_URL: "postgres://root" },
    searched: [{ dir: api }, { dir: join(root, "packages") }, { dir: root }],
  });
});

test("the nearest .env wins over one further up, and the two are never merged", () => {
  const root = tree({
    ".git": null,
    ".env": "DATABASE_URL=postgres://root\nANTHROPIC_MODEL=from-root\n",
    "packages/api/.env": "DATABASE_URL=postgres://api\n",
    "packages/api/src": null,
  });
  const api = join(root, "packages", "api");
  // From below the package, so the file that wins is one the walk reaches, not one in the start directory.
  const src = join(api, "src");
  assert.deepEqual(findDotEnv(src), { path: join(api, ".env"), values: { DATABASE_URL: "postgres://api" }, searched: [{ dir: src }, { dir: api }] });
});

test("outside a repository only the start directory is searched, and a .env above it is ignored", () => {
  // The temporary directory is in no repository, so the walk reaches the filesystem root ("/", or the drive root on
  // Windows) to learn so, and ends there.
  const parent = tree({ ".env": "DATABASE_URL=postgres://parent\n", child: null });
  const child = join(parent, "child");
  assert.deepEqual(findDotEnv(child), { values: {}, searched: [{ dir: child }] });
});

test("a .git file, as in a worktree or a submodule, marks the repository root", () => {
  const outer = tree({ ".git": null, ".env": "DATABASE_URL=postgres://outer\n", "sub/.git": "gitdir: ../.git/modules/sub\n", "sub/packages/api": null });
  const sub = join(outer, "sub");
  const api = join(sub, "packages", "api");
  assert.deepEqual(findDotEnv(api), { values: {}, searched: [{ dir: api }, { dir: join(sub, "packages") }, { dir: sub }] }, "the outer repository's .env is not read");
});

test("a .env that exists but cannot be read is listed with its error, and the search goes on", () => {
  const root = tree({ ".git": null, ".env": "DATABASE_URL=postgres://root\n", "packages/api": null });
  const api = join(root, "packages", "api");
  writeUnreadable(join(api, ".env"), "DATABASE_URL=postgres://api\n");
  const found = findDotEnv(api);
  assert.equal(found.path, join(root, ".env"));
  assert.deepEqual(found.values, { DATABASE_URL: "postgres://root" });
  assert.deepEqual(found.searched.map((s) => s.dir), [api, join(root, "packages"), root]);
  assert.match(found.searched[0]!.error ?? "", /^(EACCES|EPERM): /, "the reason, as the system gives it");
  assert.deepEqual(found.searched.slice(1).map((s) => s.error), [undefined, undefined]);
});

test("a directory named .env, such as a Python virtualenv, is passed over without a word", () => {
  const root = tree({ ".git": null, ".env": "DATABASE_URL=postgres://root\n", "packages/api/.env/bin": null });
  const api = join(root, "packages", "api");
  assert.deepEqual(findDotEnv(api), { path: join(root, ".env"), values: { DATABASE_URL: "postgres://root" }, searched: [{ dir: api }, { dir: join(root, "packages") }, { dir: root }] });
});

test("a symlinked working directory is walked from its real path", () => {
  const root = tree({ ".git": null, ".env": "DATABASE_URL=postgres://root\n", "packages/api": null });
  const link = join(tree({}), "api");
  // A junction needs no administrator rights on Windows; other systems ignore the type and make a symlink.
  symlinkSync(join(root, "packages", "api"), link, "junction");
  assert.equal(findDotEnv(link).path, join(root, ".env"), "walked from the link itself, the search would stop at the link");
});

test("a .env with CRLF line endings, export prefixes and quotes is read, and an empty DATABASE_URL= means unset", () => {
  const root = tree({ ".git": null, ".env": "# settings\r\nexport DATABASE_URL=\"postgres://root\"\r\nANTHROPIC_MODEL='claude-x'\r\n" });
  assert.deepEqual(findDotEnv(root).values, { DATABASE_URL: "postgres://root", ANTHROPIC_MODEL: "claude-x" });
  writeFileSync(join(root, ".env"), "DATABASE_URL=\r\n");
  assert.equal(resolveDatabaseUrl(undefined, findDotEnv(root).values), undefined);
});
