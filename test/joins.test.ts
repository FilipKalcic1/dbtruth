import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remeasure } from "../src/check.js";
import { run, runCheck } from "../src/cli.js";
import { config } from "../src/config.js";
import { connect, type Db, type Row } from "../src/safety.js";
import { relationshipId, type CheckReport, type Relationship, type Snapshot, type Verified } from "../src/schemas.js";
import { readSnapshot } from "../src/snapshot.js";
import { fakeModel } from "./canned.js";

const FIXTURE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";
const POLYMORPH_URL = FIXTURE_URL.replace(/\/[^/]+$/, "/polymorph");
const SNAPSHOT = "context/snapshot.json";
const CANARY = /canary-pii/i;
const LIMIT = { timeout: 60_000 };

/** An inferred relationship from table.column to the id of another table, on the rows the condition selects when there is one. */
function claim(table: string, column: string, to: string, when?: Relationship["when"]): Relationship {
  return { from: { table, column }, to: { table: to, column: "id" }, ...(when ? { when } : {}), basis: "inferred", confidence: 0.8, reason: "named like it" };
}
const type = (equals: string) => ({ column: "commentable_type", equals });

// What a model would claim of test/fixtures/polymorph.sql, whose header gives the numbers, and the conditions it must not measure.
const whole = claim("comments", "commentable_id", "posts");
const posts = claim("comments", "commentable_id", "posts", type("post"));
const photos = claim("comments", "commentable_id", "photos", type("photo"));
const videos = claim("comments", "commentable_id", "photos", type("video"));
const dropping = claim("comments", "commentable_id", "posts", type("x'; DROP TABLE posts; --"));
const unknown = claim("comments", "commentable_id", "posts", { column: "nope", equals: "post" });
const hidden = claim("comments", "commentable_id", "posts", { column: "body", equals: "x" });
const keyed = claim("comments", "commentable_id", "posts", { column: "id", equals: "42" });
const five = claim("invoices", "account_id", "accounts", { column: "account_id", equals: "5" });
const zeroFive = claim("invoices", "account_id", "accounts", { column: "account_id", equals: "05" });
const CLAIMS = { relationships: [whole, posts, photos, videos, dropping, unknown, hidden, keyed, five, zeroFive] };

/** An offline full run on polymorph, the model replying CLAIMS: what it printed and sent, and what it wrote. */
async function offline() {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-joins-"));
  const out: string[] = [];
  const err: string[] = [];
  const { transport, requests } = fakeModel(CLAIMS);
  const code = await run({ url: POLYMORPH_URL, samples: true, reveal: [], json: true, flags: {}, cwd, env: {}, out: (line) => out.push(line), err: (line) => err.push(line) }, { transport });
  assert.notEqual(code, 1, err.join("\n"));
  const snapshot = readSnapshot(cwd, SNAPSHOT);
  if (typeof snapshot === "string") assert.fail(snapshot);
  const file = (name: string) => readFileSync(join(cwd, "context", name), "utf8");
  return { verified: JSON.parse(out.join("\n")) as Verified, err, requests, cwd, file, snapshot };
}

type Statement = { sql: string; params: unknown[]; rows: Row[] };

/** remeasure of snapshot on url, over a connection that records each statement inside the budget: its text, its parameters and the rows it returned. */
async function recorded(url: string, snapshot: Snapshot): Promise<{ report: CheckReport; statements: Statement[] }> {
  const db = await connect(url, config);
  const statements: Statement[] = [];
  const recording: Db = {
    ...db,
    async query(sql, params = []) {
      const result = await db.query(sql, params);
      statements.push({ sql, params, rows: result.ok ? result.rows : [] });
      return result;
    },
  };
  try {
    return { report: await remeasure(recording, config, snapshot), statements };
  } finally {
    await db.close();
  }
}

/** The snapshot with its statuses alone, so the database is the only place remeasure can take numbers and queries from. */
const blank = (s: Snapshot): Snapshot => ({ ...s, verdicts: Object.fromEntries(Object.entries(s.verdicts).map(([id, v]) => [id, { ...v, measurement: { query: "", numbers: {} } }])) });

/** The numbers named, and no others: a test holds only the numbers its task adds. */
const pick = (numbers: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((key) => [key, numbers[key]]));

test("each branch of a polymorphic reference gets its own verdict with its own numbers", LIMIT, async () => {
  const { verified } = await offline();
  const measured = (r: Relationship) => {
    const { status, measurement } = verified.verdicts[relationshipId(r)]!;
    return [status, pick(measurement.numbers, ["total", "hits", "orphans", "hit", "nulls"])];
  };
  assert.deepEqual(measured(posts), ["confirmed", { total: 300, hits: 300, orphans: 0, hit: 1, nulls: 0 }]);
  assert.deepEqual(measured(photos), ["broken", { total: 180, hits: 120, orphans: 60, hit: 120 / 180, nulls: 0 }]);
  assert.deepEqual(measured(whole), ["confirmed", { total: 480, hits: 480, orphans: 0, hit: 1, nulls: 0 }], "without its condition, every photo id is also a post id");
  const video = verified.verdicts[relationshipId(videos)]!;
  assert.deepEqual([video.status, video.skipped, video.measurement.numbers], ["empty", "no non-null rows to test", { total: 0, nulls: 0 }], "no row holds the value");
});

test("a discriminator value is always a bind parameter, and SQL in it matches nothing", LIMIT, async () => {
  const { snapshot } = await offline();
  // Edited as a pull request could edit it: a condition whose column is SQL, said to be confirmed, and one whose value
  // is a NUL, which no Postgres text holds.
  const injected = { ...posts, when: { column: `commentable_type" = 'x' OR true; --`, equals: "post" } };
  const nul = { ...posts, when: type("\u0000") };
  const hostile: Snapshot = {
    ...snapshot,
    claims: { ...snapshot.claims, relationships: [...snapshot.claims.relationships, injected, nul] },
    verdicts: { ...snapshot.verdicts, [relationshipId(injected)]: { status: "confirmed", measurement: { query: "SELECT 1", numbers: { hit: 1 } } } },
  };
  const { report, statements } = await recorded(POLYMORPH_URL, hostile);
  for (const { sql } of statements) {
    for (const text of ["DROP", injected.when.column, "\u0000"]) assert.ok(!sql.includes(text), `${JSON.stringify(text)} in ${sql}`);
  }
  // Branches of one join run one statement, and only the value sent beside it tells them apart.
  const target = (sql: string) => /EXISTS \(SELECT 1 FROM "public"\."(\w+)"/.exec(sql)?.[1];
  const bound = statements.filter((s) => s.sql.includes("::text = $1")).map((s) => [target(s.sql), ...s.params]);
  const values = [["accounts", "05"], ["accounts", "5"], ["photos", "photo"], ["photos", "video"], ["posts", "\u0000"], ["posts", "post"], ["posts", "x'; DROP TABLE posts; --"]];
  assert.deepEqual(bound.sort(), values.sort());
  assert.ok(statements.every((s) => s.sql.includes("$1") || s.params.length === 0), "and no other statement has a parameter");

  const now = (r: Relationship) => report.claims.find((c) => c.id === relationshipId(r))!;
  assert.equal(now(dropping).after.status, "empty", "the value was compared with, never run");
  for (const query of [snapshot.verdicts[relationshipId(dropping)]!.measurement.query, now(dropping).after.measurement.query]) {
    const lines = query.split("\n");
    assert.equal(lines.pop(), "-- $1 = 'x''; DROP TABLE posts; --'");
    assert.doesNotMatch(lines.join("\n"), /DROP/);
  }
  assert.deepEqual([now(injected).class, now(injected).missing, now(injected).after.measurement.query], ["stale", `comments.${injected.when.column}`, ""], "a column is only looked up");
  assert.equal(now(nul).after.status, "unverifiable");
  assert.match(now(nul).after.skipped ?? "", /0x00/, "the server refused the value");

  const db = await connect(POLYMORPH_URL, config);
  try {
    const counted = await db.query("SELECT count(*)::int AS n FROM posts");
    assert.deepEqual(counted.ok && counted.rows, [{ n: 100 }]);
    // The query kept reruns by hand as it is, with the value its closing note gives bound as $1.
    const kept = snapshot.verdicts[relationshipId(photos)]!.measurement.query;
    const again = await db.query(kept, ["photo"]);
    const [row] = again.ok ? again.rows : [];
    assert.deepEqual([row?.total, row?.hits], ["180", "120"]);
  } finally {
    await db.close();
  }
});

test("the per-table files show each branch with its condition", LIMIT, async () => {
  const { file } = await offline();
  const has = (table: string, line: string, prefix = false) => {
    const lines = file(`tables/${table}.md`).split("\n");
    assert.ok(lines.some((l) => (prefix ? l.startsWith(line) : l === line)), `no line in ${table}.md ${prefix ? "starts" : "is"} ${line}`);
  };
  for (const table of ["comments", "posts"]) has(table, "- comments.commentable_id -> posts.id when commentable_type = 'post': confirmed, 100.0% of 300 sampled rows match (inferred", true);
  for (const table of ["comments", "photos"]) has(table, "- **BROKEN** comments.commentable_id -> photos.id when commentable_type = 'photo': 66.7% match (120 of 180 sampled), 60 orphans (inferred).", true);
  has("comments", "- comments.commentable_id -> photos.id when commentable_type = 'video' (inferred, not measured: no non-null rows to test)");
  has("comments", "- comments.commentable_id -> posts.id when commentable_type = 'x''; DROP TABLE posts; --' (inferred, not measured: no non-null rows to test)");
});

test("a condition on a column the table lacks or that is not categorical is unverifiable, and one on a column that is not text compares its text form", LIMIT, async () => {
  const { verified } = await offline();
  const verdict = (r: Relationship) => verified.verdicts[relationshipId(r)]!;
  assert.deepEqual([verdict(unknown).status, verdict(unknown).skipped, verdict(unknown).measurement.query], ["unverifiable", "unknown column comments.nope", ""]);
  assert.deepEqual(
    [verdict(hidden).status, verdict(hidden).skipped, verdict(hidden).measurement.query],
    ["unverifiable", "comments.body is not categorical, so no condition on it is measured", ""],
    "a count under a guessed value would tell whether a hidden value exists",
  );
  assert.deepEqual(
    [verdict(keyed).status, verdict(keyed).skipped, verdict(keyed).measurement.query],
    ["unverifiable", "comments.id is not categorical, so no condition on it is measured", ""],
    "a key is shown to the model, but a condition on it would narrow the join to a row",
  );
  assert.deepEqual([verdict(five).status, pick(verdict(five).measurement.numbers, ["total", "hits"])], ["confirmed", { total: 4, hits: 4 }], "a condition on the join's own column is simply measured");
  assert.deepEqual([verdict(zeroFive).status, verdict(zeroFive).skipped], ["empty", "no non-null rows to test"], "05 is 5 as an integer, and not as text");
});

test("check measures every branch again, with the numbers of the full run", LIMIT, async () => {
  const { cwd, snapshot } = await offline();
  const err: string[] = [];
  const code = await runCheck({ url: POLYMORPH_URL, snapshot: SNAPSHOT, failOn: "regression", flags: {}, cwd, env: {}, err: (line) => err.push(line) });
  assert.equal(code, 0);
  assert.deepEqual(err, ["check polymorph: 10 unchanged"]);
  const { report } = await recorded(POLYMORPH_URL, blank(snapshot));
  assert.deepEqual(Object.fromEntries(report.claims.map((c) => [c.id, c.after])), snapshot.verdicts);
});

test("check measures no condition when the snapshot's settings would show more values than this run's", LIMIT, async () => {
  const { snapshot } = await offline();
  // Edited as a pull request could edit it: a guess at a hidden value, under settings on which its column looks categorical.
  const guess = claim("comments", "commentable_id", "posts", { column: "commentable_id", equals: "57" });
  for (const edit of [{ categoricalMaxDistinct: 1_000_000 }, { categoricalMaxValueLength: 1_000_000 }, { sampleRows: 60 }]) {
    const wider: Snapshot = { ...snapshot, measuredWith: { ...snapshot.measuredWith, ...edit }, claims: { ...snapshot.claims, relationships: [...snapshot.claims.relationships, guess] } };
    const { report, statements } = await recorded(POLYMORPH_URL, wider);
    const after = (r: Relationship) => report.claims.find((c) => c.id === relationshipId(r))!.after;
    const edited = JSON.stringify(edit);
    assert.deepEqual([after(guess).status, after(guess).skipped], ["unverifiable", "comments.commentable_id is not categorical, so no condition on it is measured"], edited);
    assert.deepEqual([after(posts).status, after(posts).skipped], ["unverifiable", "comments.commentable_type is not categorical, so no condition on it is measured"], `${edited}: nor a branch the full run measured`);
    assert.deepEqual(statements.filter((s) => s.params.length > 0), [], `${edited}: no statement carries a value`);
  }
});

test("no hidden value of polymorph reaches the model, the files, the snapshot or stdout", LIMIT, async () => {
  const { verified, err, requests, cwd } = await offline();
  for (const request of requests) assert.doesNotMatch(request, CANARY);
  assert.doesNotMatch(JSON.stringify(verified), CANARY, "stdout, which is the JSON");
  for (const line of err) assert.doesNotMatch(line, CANARY);
  assert.doesNotMatch(readFileSync(join(cwd, SNAPSHOT), "utf8"), CANARY);
  const tables = join(cwd, "context", "tables");
  for (const name of readdirSync(tables)) assert.doesNotMatch(readFileSync(join(tables, name), "utf8"), CANARY, name);
});
