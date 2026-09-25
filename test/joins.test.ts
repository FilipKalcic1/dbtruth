import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remeasure } from "../src/check.js";
import { run, runCheck } from "../src/cli.js";
import { config, type Overrides } from "../src/config.js";
import { connect, type Db, type Row } from "../src/safety.js";
import { relationshipId, type CheckReport, type Relationship, type Snapshot, type Verified } from "../src/schemas.js";
import { readSnapshot } from "../src/snapshot.js";
import { cannedClaims, fakeModel } from "./canned.js";
import { copyOfFixture } from "./copies.js";

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

// Where polymorph's orphans fall: inside the key's range, below it, and above it on the photo branch.
const owed = claim("invoices", "account_id", "accounts");
const refunded = claim("refunds", "account_id", "accounts");
const ORPHANS = { relationships: [owed, refunded, photos] };

/** An offline full run on url, the model replying claims, with the tunables flags sets: what it printed and sent, and what it wrote. */
async function offline(url = POLYMORPH_URL, claims: object = CLAIMS, flags: Overrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-joins-"));
  const out: string[] = [];
  const err: string[] = [];
  const { transport, requests } = fakeModel(claims);
  const code = await run({ url, samples: true, reveal: [], json: true, flags, cwd, env: {}, out: (line) => out.push(line), err: (line) => err.push(line) }, { transport });
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
  // Branches of one join run one statement, and only the value sent beside it tells them apart. A branch confirmed on
  // inference is weighed in one more statement, over its own rows, with the same value.
  const target = (sql: string) => (sql.includes("AS also_fits") ? "weighed" : /EXISTS \(SELECT 1 FROM "public"\."(\w+)"/.exec(sql)?.[1]);
  const bound = statements.filter((s) => s.sql.includes("::text = $1")).map((s) => [target(s.sql), ...s.params]);
  const values = [["accounts", "05"], ["accounts", "5"], ["photos", "photo"], ["photos", "video"], ["posts", "\u0000"], ["posts", "post"], ["posts", "x'; DROP TABLE posts; --"], ["weighed", "5"], ["weighed", "post"]];
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
  for (const table of ["comments", "photos"]) has(table, "- **BROKEN** comments.commentable_id -> photos.id when commentable_type = 'photo': 66.7% match (120 of 180 sampled), 60 orphans, all above the highest photos.id (inferred).", true);
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
  const code = await runCheck({ url: POLYMORPH_URL, snapshot: SNAPSHOT, failOn: "regression", json: false, flags: {}, cwd, env: {}, out: () => {}, err: (line) => err.push(line) });
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

test("orphans are counted where they fall: above the key on the fixture, inside it and below it on polymorph", LIMIT, async () => {
  const ends = (verified: Verified, r: Relationship) => pick(verified.verdicts[relationshipId(r)]!.measurement.numbers, ["orphans", "orphansAbove", "orphansBelow"]);
  const fixture = await offline(FIXTURE_URL, cannedClaims);
  assert.deepEqual(ends(fixture.verified, claim("orders", "customer_id", "customers")), { orphans: 60, orphansAbove: 60, orphansBelow: 0 }, "customer ids from 9001 on, past the 250 customers");
  const { verified } = await offline(POLYMORPH_URL, ORPHANS);
  assert.deepEqual(ends(verified, owed), { orphans: 40, orphansAbove: 0, orphansBelow: 0 }, "accounts 10 to 19 are missing from the middle");
  assert.deepEqual(ends(verified, refunded), { orphans: 5, orphansAbove: 0, orphansBelow: 5 }, "-1 to -5, below account 1");
  assert.deepEqual(ends(verified, photos), { orphans: 60, orphansAbove: 60, orphansBelow: 0 }, "photos 41 to 60, past the 40 photos");
});

test("only counts leave the database for where the orphans fall", LIMIT, async () => {
  const { verified, err, requests, cwd, file, snapshot } = await offline(POLYMORPH_URL, ORPHANS);
  const { statements } = await recorded(POLYMORPH_URL, snapshot);
  const split = statements.filter((s) => s.sql.includes("AS orphans_above"));
  assert.equal(split.length, 3, "one statement for each join");
  for (const { rows } of split) assert.deepEqual(rows.map((row) => Object.keys(row).sort()), [["hits", "nulls", "orphans_above", "orphans_below", "total"]], "never the ends of the key");
  // Nor anything hidden, in what the run sent, printed and wrote.
  const tables = readdirSync(join(cwd, "context", "tables")).map((name) => file(`tables/${name}`));
  for (const text of [...requests, JSON.stringify(verified), ...err, file("snapshot.json"), ...tables]) assert.doesNotMatch(text, CANARY);
});

test("the per-table files say where the orphans fall, and no cause", LIMIT, async () => {
  const fixture = await offline(FIXTURE_URL, cannedClaims);
  const polymorph = await offline(POLYMORPH_URL, ORPHANS);
  const says = (file: (name: string) => string, tables: string[], words: string) => {
    for (const table of tables) assert.ok(file(`tables/${table}.md`).includes(words), `${table}.md does not say ${words}`);
  };
  says(fixture.file, ["orders", "customers"], "60 orphans, all above the highest customers.id (inferred). An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.");
  says(polymorph.file, ["invoices", "accounts"], "- **BROKEN** invoices.account_id -> accounts.id: 80.0% match (160 of 200 sampled), 40 orphans, all inside the accounts.id range (inferred). An inner join drops the orphans");
  says(polymorph.file, ["refunds"], "75.0% match (15 of 20 sampled), 5 orphans, all below the lowest accounts.id (inferred).");
  says(polymorph.file, ["photos"], "60 orphans, all above the highest photos.id (inferred).");
  for (const { cwd, file } of [fixture, polymorph]) {
    for (const name of readdirSync(join(cwd, "context", "tables"))) assert.doesNotMatch(file(`tables/${name}`), /deleted|never loaded|sequence|because|probably/i, name);
  }
});

// A quantity from 1 to 5 matches every product, and every other dense key of the fixture as well. product_id is declared.
const QUANTITY = claim("order_items", "quantity", "products");
const PRODUCT = claim("order_items", "product_id", "products");
const WEIGHED = { ...cannedClaims, relationships: [...cannedClaims.relationships, QUANTITY, PRODUCT] };

/** The relations a weighing compared a join with, in the order its statement names them. */
const arms = (query: string) => [...query.matchAll(/max\("id"\) AS hi FROM "public"\."(\w+)"/g)].map((m) => m[1]);

test("the fixture's inferred quantity join is confirmed, and says it would also match its 5 other dense keys", LIMIT, async () => {
  const { verified, err, requests, file } = await offline(FIXTURE_URL, WEIGHED);
  const { status, measurement } = verified.verdicts[relationshipId(QUANTITY)]!;
  assert.deepEqual([status, pick(measurement.numbers, ["total", "hits", "hit", "candidates", "alsoFits"])], ["confirmed", { total: 1200, hits: 1200, hit: 1, candidates: 5, alsoFits: 5 }]);
  assert.deepEqual(arms(measurement.query), ["customers", "order_items", "orders", "products_legacy", "vehicles"], "every integer key but the target: cars is empty, and events has two columns");
  assert.ok(err.includes("relationships: 3 confirmed (1 on weak evidence), 1 broken, 2 rejected, 0 unverifiable, 1 empty"), err.join("\n"));
  const line = "- order_items.quantity -> products.id: confirmed, 100.0% of 1200 sampled rows match (inferred; the same values would also match 5 other keys, so the match alone does not prove this join).";
  for (const table of ["order_items", "products"]) assert.ok(file(`tables/${table}.md`).split("\n").includes(line), `${table}.md`);
  // Prompt B, which writes README.md, is told the same.
  const told = JSON.parse((JSON.parse(requests[1]!) as { messages: { content: string }[] }).messages[0]!.content) as Verified;
  assert.equal(told.verdicts[relationshipId(QUANTITY)]!.measurement.numbers.alsoFits, 5);
});

test("a declared foreign key is never weighed, whatever basis the claim gives it", LIMIT, async () => {
  const { verified } = await offline(FIXTURE_URL, WEIGHED);
  for (const r of [PRODUCT, cannedClaims.relationships[1] as Relationship]) {
    const { status, measurement } = verified.verdicts[relationshipId(r)]!;
    assert.equal(status, "confirmed");
    assert.deepEqual(pick(measurement.numbers, ["candidates", "alsoFits"]), { candidates: undefined, alsoFits: undefined }, relationshipId(r));
    assert.doesNotMatch(measurement.query, /also_fits/);
  }
  // In the same run, the quantity join into the same key, which nothing declares, is.
  const { measurement } = verified.verdicts[relationshipId(QUANTITY)]!;
  assert.deepEqual(pick(measurement.numbers, ["candidates", "alsoFits"]), { candidates: 5, alsoFits: 5 });
  assert.match(measurement.query, /also_fits/);
});

test("only counts leave the database when a join is weighed", LIMIT, async () => {
  const fixture = await offline(FIXTURE_URL, WEIGHED);
  const polymorph = await offline();
  for (const [url, ran, keys] of [[FIXTURE_URL, fixture, 6], [POLYMORPH_URL, polymorph, 5]] as const) {
    const { statements } = await recorded(url, ran.snapshot);
    const probes = statements.filter((s) => / AS span FROM "public"\."\w+"$/.test(s.sql));
    assert.equal(probes.length, keys, "each integer key probed once");
    for (const { rows } of probes) assert.deepEqual(rows.map((row) => [Object.keys(row), /^\d+$/.test(String(row.span))]), [[["span"], true]], "how many values the key spans, never an end of it");
    const weighings = statements.filter((s) => s.sql.includes("AS also_fits"));
    assert.ok(weighings.length > 0);
    for (const { rows } of weighings) assert.deepEqual(rows.map((row) => Object.keys(row).sort()), [["also_fits", "candidates"]], "two counts, never the ends of a column");
    const names = Object.values(ran.snapshot.verdicts).flatMap((v) => Object.keys(v.measurement.numbers));
    assert.deepEqual(names.filter((name) => /^(lo|hi|min|max)$/i.test(name)), []);
    // Nor anything hidden, in what the run sent, printed and wrote.
    const tables = readdirSync(join(ran.cwd, "context", "tables")).map((name) => ran.file(`tables/${name}`));
    for (const text of [...ran.requests, JSON.stringify(ran.verified), ...ran.err, ran.file("snapshot.json"), ...tables]) assert.doesNotMatch(text, CANARY);
  }
  const reader = await offline(FIXTURE_URL.replace("dbtruth:dbtruth@", "reader:reader@"), WEIGHED);
  assert.deepEqual(reader.err.filter((line) => line.startsWith("WARNING")), []);
  assert.equal(reader.verified.verdicts[relationshipId(QUANTITY)]!.measurement.numbers.alsoFits, 5, "a role that may only SELECT probes and weighs the same");
});

test("keys are judged in the database: a key never analyzed is piloted, an emptied key and a sparse one are left out, a key below zero or past 2^53 compares exactly, a span past the integer range does not overflow, and the cap takes keys in catalog order", LIMIT, async (t) => {
  const copy = await copyOfFixture(t);
  // Autovacuum off, so that fresh is never analyzed, gone keeps the 100 rows its ANALYZE counted, and nothing sizes the
  // others again.
  for (const statement of [
    "CREATE TABLE fresh (id integer PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO fresh SELECT generate_series(1, 1000)",
    "CREATE TABLE ledger (id integer PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO ledger SELECT generate_series(-10, 9)",
    "CREATE TABLE sparse (id integer PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO sparse SELECT generate_series(1, 1000, 10)",
    "CREATE TABLE gone (id integer PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO gone SELECT generate_series(1, 100)",
    "ANALYZE gone",
    "DELETE FROM gone",
    "CREATE TABLE wide (id bigint PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO wide VALUES (-9223372036854775808), (9223372036854775807)",
    "CREATE TABLE serials (id bigint PRIMARY KEY) WITH (autovacuum_enabled = false)",
    "INSERT INTO serials SELECT 9007199254740992 + i FROM generate_series(0, 9) AS i",
    "CREATE TABLE serial_refs (id bigint PRIMARY KEY, serial_id bigint NOT NULL) WITH (autovacuum_enabled = false)",
    "INSERT INTO serial_refs SELECT 9007199254740992 + i, 9007199254740992 + i % 10 FROM generate_series(1, 10) AS i",
    "ANALYZE ledger, sparse, wide, serials, serial_refs",
  ]) {
    await copy.sql(statement);
  }
  // 2^53 to 2^53 + 9, all in serials, and one below serial_refs' lowest key, which a double would round up to it.
  const SERIAL = claim("serial_refs", "serial_id", "serials");
  // Each join's numbers, then the summary's line, which counts a join on weak evidence only where another key holds its values.
  const weighed = async (flags: Overrides) => {
    const { verified, err } = await offline(copy.url, { relationships: [QUANTITY, SERIAL] }, flags);
    const numbers = [QUANTITY, SERIAL].map((r) => pick(verified.verdicts[relationshipId(r)]!.measurement.numbers, ["hit", "candidates", "alsoFits"]));
    return [...numbers, err.find((line) => line.startsWith("relationships: "))];
  };
  // The keys, in catalog order: customers, fresh, gone, ledger, order_items, orders, products, products_legacy,
  // serial_refs, serials, sparse, vehicles, wide. The catalog cannot size fresh, so a pilot counts its 1,000 rows; gone
  // is empty, sparse fills 100 of 991 and wide 2 of 2^64.
  assert.deepEqual(await weighed({}), [{ hit: 1, candidates: 9, alsoFits: 7 }, { hit: 1, candidates: 9, alsoFits: 0 }, "relationships: 2 confirmed (1 on weak evidence), 0 broken, 0 rejected, 0 unverifiable, 0 empty"], "quantity fits all but serials and serial_refs; the serials fit none, so only quantity is on weak evidence");
  assert.deepEqual(await weighed({ denseKeyShare: 0 }), [{ hit: 1, candidates: 11, alsoFits: 9 }, { hit: 1, candidates: 11, alsoFits: 1 }, "relationships: 2 confirmed (2 on weak evidence), 0 broken, 0 rejected, 0 unverifiable, 0 empty"], "any key but an empty one counts, and wide holds every value");
  assert.deepEqual(await weighed({ weakEvidenceMaxCandidates: 3 }), [{ hit: 1, candidates: 2, alsoFits: 2 }, { hit: 1, candidates: 2, alsoFits: 0 }, "relationships: 2 confirmed (1 on weak evidence), 0 broken, 0 rejected, 0 unverifiable, 0 empty"], "customers, fresh and gone are probed");
  assert.deepEqual(await weighed({ weakEvidenceMaxCandidates: 0 }), [{ hit: 1, candidates: undefined, alsoFits: undefined }, { hit: 1, candidates: undefined, alsoFits: undefined }, "relationships: 2 confirmed, 0 broken, 0 rejected, 0 unverifiable, 0 empty"]);
});

test("a branch is weighed on its own rows, and check measures a weighed join again with the same numbers", LIMIT, async () => {
  const { verified, err } = await offline();
  const weighed = (r: Relationship) => pick(verified.verdicts[relationshipId(r)]!.measurement.numbers, ["total", "hits", "candidates", "alsoFits"]);
  // Dense: comments, invoices, photos and posts; accounts has 40 of its 50 ids.
  assert.deepEqual(weighed(whole), { total: 480, hits: 480, candidates: 3, alsoFits: 2 }, "1 to 100 fit comments and invoices, not photos");
  assert.deepEqual(weighed(posts), { total: 300, hits: 300, candidates: 3, alsoFits: 2 });
  assert.deepEqual(weighed(five), { total: 4, hits: 4, candidates: 4, alsoFits: 4 }, "5 fits every dense key");
  assert.ok(err.includes("relationships: 3 confirmed (3 on weak evidence), 1 broken, 0 rejected, 3 unverifiable, 3 empty"), err.join("\n"));

  // Each statement of the query kept reruns by hand as it is, with the value its closing note gives bound as $1.
  const lines = verified.verdicts[relationshipId(posts)]!.measurement.query.split("\n");
  assert.equal(lines.pop(), "-- $1 = 'post'");
  const [join, weigh] = lines.join("\n").split(";\n");
  const db = await connect(POLYMORPH_URL, config);
  try {
    const rerun = async (sql: string) => {
      const result = await db.query(sql, ["post"]);
      return result.ok ? result.rows[0] : undefined;
    };
    const measured = await rerun(join!);
    assert.deepEqual([measured?.total, measured?.hits], ["300", "300"]);
    assert.deepEqual(await rerun(weigh!), { candidates: "3", also_fits: "2" });
  } finally {
    await db.close();
  }

  const fixture = await offline(FIXTURE_URL, WEIGHED);
  const checked: string[] = [];
  const code = await runCheck({ url: FIXTURE_URL, snapshot: SNAPSHOT, failOn: "regression", json: false, flags: {}, cwd: fixture.cwd, env: {}, out: () => {}, err: (line) => checked.push(line) });
  assert.equal(code, 0);
  assert.deepEqual(checked, ["check fixture: 14 unchanged"]);
  const { report } = await recorded(FIXTURE_URL, blank(fixture.snapshot));
  assert.deepEqual(Object.fromEntries(report.claims.map((c) => [c.id, c.after])), fixture.snapshot.verdicts, "the query and the numbers of every weighed join included");
});
