import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMENT_MARKER, diff, fails, FAIL_ON, reportLines, reportMarkdown } from "../src/check.js";
import { runCheck } from "../src/cli.js";
import { config, type Config } from "../src/config.js";
import { CheckReportSchema, relationshipId, suspicionId, type CatalogRelation, type CheckClass, type CheckReport, type ClaimCheck, type Claims, type Snapshot, type Verdict } from "../src/schemas.js";
import { parseSnapshot, schemaOf, serialize, toSnapshot } from "../src/snapshot.js";

const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const FILE = "context/snapshot.json";
// Nothing listens on port 1, so a check that got as far as connecting would fail with "could not connect".
const UNREACHABLE = "postgres://nobody:pw@127.0.0.1:1/none";

type Status = Verdict["status"];

const relation = (name: string, columns: string[], type = "integer"): CatalogRelation => ({
  name,
  schema: "public",
  kind: "table",
  primaryKey: ["id"],
  foreignKeys: [],
  columns: columns.map((column) => ({ name: column, type, nullable: false })),
});

// The database the snapshots below were written on, and the two claims they make about it.
const CATALOG = [relation("orders", ["id", "customer_id", "status"]), relation("customers", ["id"])];
const JOIN: Claims["relationships"][number] = { from: { table: "orders", column: "customer_id" }, to: { table: "customers", column: "id" }, basis: "inferred", confidence: 0.8, reason: "name" };
const VALUES: Claims["suspicions"][number] = { kind: "inconsistent_values", tables: ["orders"], column: "status", detail: "shipped / SHIPPED" };
const JOIN_ID = relationshipId(JOIN);
const VALUES_ID = suspicionId(VALUES);

const verdict = (status: Status, hit?: number, skipped?: string): Verdict => ({
  status,
  measurement: { query: "SELECT 1", numbers: hit === undefined ? {} : { hit } },
  ...(skipped ? { skipped } : {}),
});

/** A snapshot as a full run writes it, of the catalog given, with the claims and verdicts given and the relations named in examined examined. */
function snapshotOf(verdicts: Record<string, Verdict>, claims: Partial<Claims>, catalog = CATALOG, examined = catalog.map((r) => r.name), cfg: Config = config): Snapshot {
  const all: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [], ...claims };
  const tables = examined.map((name) => ({ name, kind: "table" as const, rowEstimate: 10, primaryKey: ["id"], categorical: {} }));
  return toSnapshot({ version: 1, database: "shop", relations: "", claims: all, verdicts, fitsInContext: true, tables }, catalog, cfg, { toolVersion: "0.3.0", serverVersionNum: 160004 });
}

/** check's report on one claim, the join or the suspicion, measured before as given (no verdict when undefined) and now, on the catalog given. */
function one(kind: "relationship" | "suspicion", before: Verdict | undefined, after: Verdict, catalog = CATALOG, cfg: Config = config): CheckReport {
  const [id, claims] = kind === "relationship" ? [JOIN_ID, { relationships: [JOIN] }] : [VALUES_ID, { suspicions: [VALUES] }];
  return diff(snapshotOf(before ? { [id]: before } : {}, claims), { database: "shop", schema: schemaOf(catalog), verdicts: { [id]: after } }, cfg);
}

/** Every item of a report by its class: each claim's, and stale for each relation. */
const items = (report: CheckReport): CheckClass[] => [...report.claims.map((c) => c.class), ...report.relations.map(() => "stale" as const)];

/** A claim as check reports it, with its hit rate in the snapshot and the name it lost when there are. */
const claim = (id: string, cls: CheckClass, before: Status, hitBefore: number | undefined, after: Verdict, missing?: string): ClaimCheck => ({
  id,
  class: cls,
  before,
  ...(hitBefore === undefined ? {} : { hitBefore }),
  after,
  ...(missing ? { missing } : {}),
});

/** A report with an item of every class, a relation each way and every note. */
const MOVED: CheckReport = {
  report: 1,
  database: { snapshot: "shop", now: "shop_ci" },
  schemaChanged: true,
  settings: [{ name: "join.confirmed", snapshot: 0.85, now: 0.95 }, { name: "sampleRows", snapshot: 1000, now: 50000 }],
  // In the snapshot's order, which is not the order of the classes.
  claims: [
    claim("relationship:cars.customer_id->customers.id", "changed", "empty", undefined, verdict("confirmed", 1)),
    claim("relationship:customers.address->customers.full_name", "unchanged", "rejected", 0, verdict("rejected", 0)),
    claim("relationship:order_items.order_id->orders.id", "regression", "confirmed", 1, verdict("broken", 0.8)),
    claim("relationship:orders.customer_id->customers.id", "drift", "broken", 0.88, verdict("broken", 0.9)),
    claim("relationship:vehicles.model_year->customers.id", "not measured", "rejected", 0, verdict("unverifiable", undefined, "time budget exhausted")),
    claim("suspicion:dead_table:cars", "improved", "confirmed", undefined, verdict("rejected")),
    claim("suspicion:inconsistent_values:orders.status", "stale", "confirmed", undefined, verdict("unverifiable", undefined, "unknown column orders.status"), "orders.status"),
  ],
  relations: [{ name: "added", in: "database" }, { name: "cars", in: "context" }],
};

/** A report of the claims and relations given, with nothing to note. */
const reportOf = (claims: ClaimCheck[], relations: CheckReport["relations"] = []): CheckReport => ({ report: 1, database: { snapshot: "shop", now: "shop" }, schemaChanged: false, settings: [], claims, relations });

/** `dbtruth <args>` as a user runs it, from cwd, with the environment given and no API key; one that hangs is killed at 30 s. */
function command(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", TSX, CLI, ...args], { cwd, env: { ...env, ANTHROPIC_API_KEY: "" }, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  return result;
}

test("every row of the plan's table classifies and fails as the plan says", () => {
  // The table in T3.2 of BUILD_PLAN.md, row by row: what moved, the class, and whether the build fails under
  // --fail-on regression and under --fail-on change. Nothing fails under never.
  const added = diff(snapshotOf({}, {}), { database: "shop", schema: schemaOf([...CATALOG, relation("added", ["id"])]), verdicts: {} }, config);
  const rows: [string, CheckReport, CheckClass, boolean, boolean][] = [
    ["relationship confirmed → broken", one("relationship", verdict("confirmed", 1), verdict("broken", 0.8)), "regression", true, true],
    ["relationship confirmed or broken → rejected", one("relationship", verdict("confirmed", 1), verdict("rejected", 0.1)), "regression", true, true],
    ["relationship confirmed or broken → rejected", one("relationship", verdict("broken", 0.8), verdict("rejected", 0.1)), "regression", true, true],
    ["suspicion rejected → confirmed (new problem)", one("suspicion", verdict("rejected"), verdict("confirmed")), "regression", true, true],
    ["claim names a table or column that no longer exists", one("relationship", verdict("confirmed", 1), verdict("unverifiable", undefined, "unknown column orders.customer_id"), [relation("orders", ["id", "status"]), CATALOG[1]!]), "stale", true, true],
    ["relation in the database that the snapshot does not have", added, "stale", true, true],
    ["relationship broken → confirmed", one("relationship", verdict("broken", 0.88), verdict("confirmed", 1)), "improved", false, true],
    ["suspicion confirmed → rejected", one("suspicion", verdict("confirmed"), verdict("rejected")), "improved", false, true],
    ["same status, hit rate moved by at least checkHitRateTolerance", one("relationship", verdict("broken", 0.88), verdict("broken", 0.9)), "drift", false, true],
    ["measured before, unverifiable now (timeout, budget)", one("relationship", verdict("confirmed", 1), verdict("unverifiable", undefined, "time budget exhausted")), "not measured", false, false],
    ["anything → empty", one("relationship", verdict("confirmed", 1), verdict("empty", undefined, "no non-null rows to test")), "changed", false, true],
    ["empty → anything", one("suspicion", verdict("empty"), verdict("confirmed")), "changed", false, true],
    ["same status, same band", one("relationship", verdict("confirmed", 1), verdict("confirmed", 1)), "unchanged", false, false],
  ];
  for (const [row, report, expected, underRegression, underChange] of rows) {
    assert.deepEqual(items(report), [expected], row);
    assert.equal(fails(report, "regression"), underRegression, `${row}, --fail-on regression`);
    assert.equal(fails(report, "change"), underChange, `${row}, --fail-on change`);
    assert.equal(fails(report, "never"), false, `${row}, --fail-on never`);
  }
});

test("every pair of statuses gets exactly one class", () => {
  // Rows are the status in the snapshot, columns the status now, in the order of STATUSES.
  const STATUSES: Status[] = ["confirmed", "broken", "rejected", "unverifiable", "empty"];
  const matrices: Record<"relationship" | "suspicion", Record<Status, CheckClass[]>> = {
    relationship: {
      confirmed: ["unchanged", "regression", "regression", "not measured", "changed"],
      broken: ["improved", "unchanged", "regression", "not measured", "changed"],
      rejected: ["changed", "changed", "unchanged", "not measured", "changed"],
      unverifiable: ["not measured", "not measured", "not measured", "unchanged", "not measured"],
      empty: ["changed", "changed", "changed", "not measured", "unchanged"],
    },
    // A broken suspicion comes only from a hand edit: any move to or from it is a change.
    suspicion: {
      confirmed: ["unchanged", "changed", "improved", "not measured", "changed"],
      broken: ["changed", "unchanged", "changed", "not measured", "changed"],
      rejected: ["regression", "changed", "unchanged", "not measured", "changed"],
      unverifiable: ["not measured", "not measured", "not measured", "unchanged", "not measured"],
      empty: ["changed", "changed", "changed", "not measured", "unchanged"],
    },
  };
  for (const [kind, matrix] of Object.entries(matrices) as ["relationship" | "suspicion", Record<Status, CheckClass[]>][]) {
    for (const before of STATUSES) {
      STATUSES.forEach((after, i) => {
        assert.deepEqual(items(one(kind, verdict(before), verdict(after))), [matrix[before][i]], `${kind} ${before} -> ${after}`);
      });
    }
  }
  // A claim the snapshot holds no verdict for was not measured then.
  assert.deepEqual(items(one("relationship", undefined, verdict("confirmed", 1))), ["not measured"]);
  assert.deepEqual(items(one("relationship", undefined, verdict("unverifiable"))), ["unchanged"]);
});

test("drift needs the hit rate to move, by at least the tolerance", () => {
  const at = (tolerance: number, before: number, after: number) =>
    items(one("relationship", verdict("broken", before), verdict("broken", after), CATALOG, { ...config, checkHitRateTolerance: tolerance }));
  assert.deepEqual(at(0, 0.88, 0.88), ["unchanged"], "a tolerance of 0 still needs a move");
  assert.deepEqual(at(0, 0.88, 0.8801), ["drift"]);
  assert.deepEqual(at(0.25, 0.5, 0.25), ["drift"], "a move of exactly the tolerance");
  assert.deepEqual(at(0.01, 405 / 500, 410 / 500), ["drift"], "one point, 81% to 82%, which comes out a hair under 0.01 in doubles");
  assert.deepEqual(at(0.25, 0.5, 0.3), ["unchanged"], "a move below it");
  assert.deepEqual(items(one("suspicion", verdict("confirmed"), verdict("confirmed"))), ["unchanged"], "a suspicion has no hit rate to move");
});

test("a claim is stale when the database lost a name it uses, unless the snapshot lacked one too and could not measure it", () => {
  const unknown = (name: string) => verdict("unverifiable", undefined, `unknown table ${name}`);
  const classes = (report: CheckReport) => report.claims.map((c) => [c.class, c.missing]);
  const withoutCustomers = [CATALOG[0]!];
  for (const status of ["confirmed", "broken", "rejected", "empty"] as const) {
    assert.deepEqual(classes(one("relationship", verdict(status, 1), unknown("customers"), withoutCustomers)), [["stale", "customers"]], `a dropped table, ${status} in the snapshot`);
  }
  const noColumn = (column: string) => [relation("orders", ["id", "customer_id", "status"].filter((c) => c !== column)), CATALOG[1]!];
  assert.deepEqual(classes(one("relationship", verdict("confirmed", 1), verdict("unverifiable"), noColumn("customer_id"))), [["stale", "orders.customer_id"]], "a dropped column");
  assert.deepEqual(classes(one("suspicion", verdict("confirmed"), verdict("unverifiable"), noColumn("status"))), [["stale", "orders.status"]], "a suspicion's column");
  // Past the statement timeout in the full run, on names its schema had: stale all the same.
  const timedOut = verdict("unverifiable", undefined, "canceling statement due to statement timeout");
  assert.deepEqual(classes(one("relationship", timedOut, unknown("customers"), withoutCustomers)), [["stale", "customers"]], "a dropped table the snapshot could not measure");
  assert.deepEqual(classes(one("relationship", timedOut, verdict("unverifiable"), noColumn("customer_id"))), [["stale", "orders.customer_id"]], "a dropped column the snapshot could not measure");
  // A table the model invented was in neither schema: a claim on it has nothing to lose.
  const invented = diff(snapshotOf({ [JOIN_ID]: unknown("customers") }, { relationships: [JOIN] }, withoutCustomers), { database: "shop", schema: schemaOf(withoutCustomers), verdicts: { [JOIN_ID]: unknown("customers") } }, config);
  assert.deepEqual(classes(invented), [["unchanged", undefined]]);
});

test("a claim whose condition names a column the database lost is stale", () => {
  const shipped = { ...JOIN, when: { column: "status", equals: "shipped" } };
  const id = relationshipId(shipped);
  const before = snapshotOf({ [id]: verdict("confirmed", 1) }, { relationships: [shipped] });
  const withoutStatus = [relation("orders", ["id", "customer_id"]), CATALOG[1]!];
  const report = diff(before, { database: "shop", schema: schemaOf(withoutStatus), verdicts: { [id]: verdict("unverifiable", undefined, "unknown column orders.status") } }, config);
  assert.deepEqual(report.claims.map((c) => [c.id, c.class, c.missing]), [[id, "stale", "orders.status"]]);
});

test("relations added and removed are stale; a relation not examined is still in the context", () => {
  // customers and cars were listed but not examined: skipped over budget, or dropped to fit the model.
  const before = snapshotOf({}, {}, [...CATALOG, relation("cars", ["id"])], ["orders"]);
  const report = diff(before, { database: "shop", schema: schemaOf([...CATALOG, relation("added", ["id"])]), verdicts: {} }, config);
  assert.deepEqual(report.relations, [{ name: "added", in: "database" }, { name: "cars", in: "context" }]);
  assert.equal(fails(report, "regression"), true);
});

test("an empty snapshot gives relation items only", () => {
  const before = snapshotOf({}, {});
  const same = diff(before, { database: "shop", schema: schemaOf(CATALOG), verdicts: {} }, config);
  assert.deepEqual([same.claims, same.relations], [[], []]);
  assert.deepEqual(reportLines(same), ["check shop: no claims"]);
  const moved = diff(before, { database: "shop", schema: schemaOf([CATALOG[0]!, relation("added", ["id"])]), verdicts: {} }, config);
  assert.deepEqual(moved.claims, []);
  assert.deepEqual(reportLines(moved), [
    "note the schema changed since the snapshot",
    "stale added: in the database, not in the context",
    "stale customers: in the context, not in the database",
    "check shop: 2 stale",
    "run npx dbtruth and commit context/",
  ]);
});

test("a snapshot with duplicate claim ids gives one item per id", () => {
  const written = JSON.parse(serialize(snapshotOf({ [JOIN_ID]: verdict("broken", 0.88) }, { relationships: [JOIN] }))) as Snapshot;
  const twice = { ...written, claims: { ...written.claims, relationships: [JOIN, { ...JOIN, basis: "stated", reason: "declared" }] } };
  const parsed = parseSnapshot(JSON.stringify(twice), FILE);
  if (typeof parsed === "string") assert.fail(parsed);
  const report = diff(parsed, { database: "shop", schema: schemaOf(CATALOG), verdicts: { [JOIN_ID]: verdict("broken", 0.88) } }, config);
  assert.deepEqual(report.claims.map((c) => [c.id, c.class]), [[JOIN_ID, "unchanged"]]);
});

test("another database, other settings and a changed fingerprint are notes, never failures", () => {
  // Written with a confirmed band of 0.85, on shop; checked on shop_ci, whose status column has another type.
  const written = { ...config, join: { confirmed: 0.85, broken: 0.5 } };
  const before = snapshotOf({ [JOIN_ID]: verdict("confirmed", 0.88) }, { relationships: [JOIN] }, CATALOG, undefined, written);
  const now = { database: "shop_ci", schema: schemaOf([{ ...CATALOG[0]!, columns: CATALOG[0]!.columns.map((c) => (c.name === "status" ? { ...c, type: "text" } : c)) }, CATALOG[1]!]), verdicts: { [JOIN_ID]: verdict("confirmed", 0.88) } };
  const report = diff(before, now, config);
  assert.deepEqual([report.database, report.settings, report.schemaChanged], [{ snapshot: "shop", now: "shop_ci" }, [{ name: "join.confirmed", snapshot: 0.85, now: 0.95 }], true]);
  for (const failOn of FAIL_ON) assert.equal(fails(report, failOn), false, failOn);
  assert.deepEqual(reportLines(report), [
    "note the snapshot is of database shop; this is shop_ci",
    "note measured with the snapshot's settings, which differ from this run's: join.confirmed 0.85 (this run 0.95)",
    "note the schema changed since the snapshot",
    "check shop_ci: 1 unchanged",
  ]);
  // Compared with this run's settings, not with the defaults: a run given the snapshot's own has nothing to note.
  assert.deepEqual(diff(before, now, written).settings, []);
});

test("reportLines: notes, one line per item that is not unchanged, counts, and the fix line only when something differs", () => {
  assert.deepEqual(reportLines(MOVED), [
    "note the snapshot is of database shop; this is shop_ci",
    "note measured with the snapshot's settings, which differ from this run's: join.confirmed 0.85 (this run 0.95), sampleRows 1000 (this run 50000)",
    "note the schema changed since the snapshot",
    "regression relationship:order_items.order_id->orders.id: confirmed 100.0% -> broken 80.0%",
    "stale suspicion:inconsistent_values:orders.status: orders.status is not in the database",
    "stale added: in the database, not in the context",
    "stale cars: in the context, not in the database",
    "drift relationship:orders.customer_id->customers.id: broken 88.0% -> broken 90.0%",
    "improved suspicion:dead_table:cars: confirmed -> rejected",
    "changed relationship:cars.customer_id->customers.id: empty -> confirmed 100.0%",
    "not measured relationship:vehicles.model_year->customers.id: rejected 0.0% -> unverifiable (time budget exhausted)",
    "check shop_ci: 1 regression, 3 stale, 1 drift, 1 improved, 1 changed, 1 not measured, 1 unchanged",
    "run npx dbtruth and commit context/",
  ]);

  // Only what could not be measured, and what did not move: reported, and nothing to fix.
  const quiet = reportOf(MOVED.claims.filter((c) => c.class === "unchanged" || c.class === "not measured"));
  assert.deepEqual(reportLines(quiet), [
    "not measured relationship:vehicles.model_year->customers.id: rejected 0.0% -> unverifiable (time budget exhausted)",
    "check shop: 1 not measured, 1 unchanged",
  ]);
  // A drift alone fails no default build, and the context is out of date all the same.
  assert.deepEqual(reportLines({ ...quiet, claims: MOVED.claims.filter((c) => c.class === "drift") }).slice(-1), ["run npx dbtruth and commit context/"]);
});

test("the comment on a report with every class: the marker, the counts, what fails the default build in a table, the rest folded, the notes, and the fix", () => {
  assert.equal(
    reportMarkdown(MOVED),
    [
      "<!-- dbtruth-check -->",
      "dbtruth: 1 regression, 3 stale, 1 drift, 1 improved, 1 changed, 1 not measured, 1 unchanged",
      "",
      "| Class | Claim | Before | After |",
      "|---|---|---|---|",
      "| regression | ` relationship:order_items.order_id->orders.id ` | confirmed 100.0% | broken 80.0% |",
      "| stale | ` suspicion:inconsistent_values:orders.status ` | confirmed | ` orders.status ` is not in the database |",
      "| stale | ` added ` |  | in the database, not in the context |",
      "| stale | ` cars ` |  | in the context, not in the database |",
      "",
      "<details>",
      "<summary>1 drift, 1 improved, 1 changed, 1 not measured</summary>",
      "",
      "| Class | Claim | Before | After |",
      "|---|---|---|---|",
      "| drift | ` relationship:orders.customer_id->customers.id ` | broken 88.0% | broken 90.0% |",
      "| improved | ` suspicion:dead_table:cars ` | confirmed | rejected |",
      "| changed | ` relationship:cars.customer_id->customers.id ` | empty | confirmed 100.0% |",
      "| not measured | ` relationship:vehicles.model_year->customers.id ` | rejected 0.0% | unverifiable |",
      "",
      "</details>",
      "",
      "- note: the snapshot is of database ` shop `; this is ` shop_ci `",
      "- note: measured with the snapshot's settings, which differ from this run's: join.confirmed 0.85 (this run 0.95), sampleRows 1000 (this run 50000)",
      "- note: the schema changed since the snapshot",
      "",
      "run npx dbtruth and commit context/",
      "",
    ].join("\n"),
  );
});

test("a report of unchanged claims, or of none, with nothing to note is the marker and its counts alone: the all-clear an old comment is updated to", () => {
  const unchanged = one("relationship", verdict("confirmed", 1), verdict("confirmed", 1));
  const empty = diff(snapshotOf({}, {}), { database: "shop", schema: schemaOf(CATALOG), verdicts: {} }, config);
  for (const [report, counts] of [[unchanged, "dbtruth: 1 unchanged"], [empty, "dbtruth: no claims"]] as const) {
    assert.deepEqual(reportMarkdown(report).split("\n"), [COMMENT_MARKER, counts, ""], "the marker first, the counts, and no other line");
  }
});

test("the comment shows at most 50 rows, the most serious first, then how many more", () => {
  // The drifts come first in the report's order; the regressions take the rows all the same.
  const comment = (regressions: number, drifts: number) =>
    reportMarkdown(
      reportOf([
        ...Array.from({ length: drifts }, (_, i) => claim(`relationship:d${i}.id->t.id`, "drift", "broken", 0.8, verdict("broken", 0.9))),
        ...Array.from({ length: regressions }, (_, i) => claim(`relationship:r${i}.id->t.id`, "regression", "confirmed", 1, verdict("broken", 0.8))),
      ]),
    ).split("\n");
  // The class of each row, in the comment's order.
  const rows = (lines: string[]) => lines.flatMap((line) => /^\| (regression|stale|drift|improved|changed|not measured) \|/.exec(line)?.[1] ?? []);
  const times = (n: number, cls: string) => Array<string>(n).fill(cls);

  const past = comment(60, 5);
  assert.deepEqual(rows(past), times(50, "regression"), "the regressions take every row, the drifts none");
  assert.ok(!past.includes("<details>"), "nothing left to fold");
  assert.deepEqual(past.slice(-4), ["and 15 more", "", "run npx dbtruth and commit context/", ""]);

  const folded = comment(45, 10);
  assert.deepEqual(rows(folded), [...times(45, "regression"), ...times(5, "drift")]);
  assert.ok(folded.includes("<summary>5 drift</summary>"), "the summary counts the rows it folds");
  assert.ok(folded.includes("and 5 more"));

  const full = comment(40, 10);
  assert.deepEqual(rows(full), [...times(40, "regression"), ...times(10, "drift")]);
  assert.ok(!full.some((line) => line.startsWith("and ")), "50 items, none left to count");
});

test("a name from the snapshot or the database is code in the comment: one cell, one row, no markup of its own", () => {
  const regressed = (id: string) => claim(id, "regression", "confirmed", 1, verdict("broken", 0.8));
  // A condition's value is free text, from the model or from a snapshot a pull request edited, and a relation or a
  // database can be given any name Postgres takes quoted.
  const hostile: CheckReport = {
    ...reportOf([regressed("relationship:comments.commentable_id->posts.id[commentable_type=x\n| forged | row |]"), regressed("relationship:a.b->c.d[e=x\\|y``z]")], [{ name: "</details><img src=x>@octocat", in: "database" }]),
    database: { snapshot: "shop", now: "shop|ci" },
  };
  const plain: CheckReport = { ...reportOf([regressed("relationship:a.b->c.d"), regressed("relationship:e.f->g.h")], [{ name: "added", in: "database" }]), database: { snapshot: "shop", now: "shop_ci" } };
  const lines = reportMarkdown(hostile).split("\n");
  for (const line of [
    "| regression | ` relationship:comments.commentable_id->posts.id[commentable_type=x \\| forged \\| row \\|] ` | confirmed 100.0% | broken 80.0% |",
    "| regression | ``` relationship:a.b->c.d[e=x\\\\|y``z] ``` | confirmed 100.0% | broken 80.0% |",
    "| stale | ` </details><img src=x>@octocat ` |  | in the database, not in the context |",
    // Outside a table a pipe ends nothing, and a backslash inside code would be shown.
    "- note: the snapshot is of database ` shop `; this is ` shop|ci `",
  ]) {
    assert.ok(lines.includes(line), `no line ${line}`);
  }
  // GitHub ends a cell at a pipe with no backslash before it.
  for (const row of lines.filter((line) => line.startsWith("| "))) assert.equal(row.split(/(?<!\\)\|/).length, 6, row);
  assert.equal(lines.length, reportMarkdown(plain).split("\n").length, "as many lines as with plain names");
});

test("a name of 200,000 backtick runs, which a snapshot can hold, is still one code span in one cell", () => {
  // More runs than a function call takes arguments.
  const name = "`a".repeat(200_000);
  const lines = reportMarkdown(reportOf([], [{ name, in: "context" }])).split("\n");
  assert.ok(lines.includes(`| stale | \`\` ${name} \`\` |  | in the context, not in the database |`), "no row of the name in a fence of two");
});

test("a comment of the longest names Postgres allows stays under GitHub's 65,536 characters", () => {
  // An identifier holds at most 63 bytes, and a condition is measured only on a column whose values are at most
  // categoricalMaxValueLength long. A stale row names the column it lost as well, the longest row there is. A hundred
  // such rows would pass the limit; the row cap keeps the comment under it.
  const longest = "x".repeat(63);
  const column = `${longest}.${longest}.${longest}`;
  const value = (i: number) => String(i).padStart(config.categoricalMaxValueLength, "v");
  const stale = Array.from({ length: 100 }, (_, i) => claim(`relationship:${column}->${column}[${longest}=${value(i)}]`, "stale", "confirmed", 1, verdict("unverifiable", undefined, `unknown table ${longest}.${longest}`), column));
  assert.equal(stale[0]!.id.length, 493);
  const bytes = Buffer.byteLength(reportMarkdown({ ...MOVED, database: { snapshot: longest, now: "y".repeat(63) }, claims: stale, relations: [] }));
  assert.ok(bytes <= 65_536, `${bytes} bytes`);
});

test("the report is the value CheckReportSchema describes, whole", () => {
  const stale = one("relationship", verdict("confirmed", 1), verdict("unverifiable", undefined, "unknown column orders.customer_id"), [relation("orders", ["id", "status"]), CATALOG[1]!]);
  // Parsing refuses a report without its format, 1, and drops a key the schema lacks, so a report equal to its parse
  // has the one and none of the other.
  for (const report of [one("relationship", verdict("confirmed", 1), verdict("broken", 0.8)), stale, MOVED]) assert.deepEqual(CheckReportSchema.parse(report), report);
});

test("a snapshot that cannot be used exits 1 with its sentence before any connection", { timeout: 30_000 }, async (t) => {
  // A check that went on to connect would throw "could not connect to the database" instead of returning.
  const checked = async (cwd: string, snapshot = FILE) => {
    const err: string[] = [];
    const code = await runCheck({ url: UNREACHABLE, snapshot, failOn: "regression", json: false, flags: {}, cwd, env: {}, out: () => {}, err: (line) => err.push(line) });
    return { code, err };
  };
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-check-"));
  // Not left behind: the file over the limit is 11 MB.
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  assert.deepEqual(await checked(cwd), { code: 1, err: ["no context/snapshot.json: run npx dbtruth first"] });
  mkdirSync(join(cwd, FILE), { recursive: true });
  assert.deepEqual(await checked(cwd), { code: 1, err: ["context/snapshot.json is not a file"] });

  const valid = serialize(snapshotOf({ [JOIN_ID]: verdict("confirmed", 1) }, { relationships: [JOIN] }));
  const refused: [string, string, string][] = [
    ["not-json.json", "<<<<<<< HEAD\n", "context/not-json.json is not valid JSON: run npx dbtruth and commit context/"],
    ["shape.json", "[]", "context/shape.json is not a dbtruth snapshot: the top level: Invalid input: expected object, received array"],
    ["newer.json", JSON.stringify({ ...(JSON.parse(valid) as object), snapshot: 99 }), "context/newer.json was written by a newer dbtruth (snapshot format 99); upgrade dbtruth to check it"],
    ["large.json", valid + " ".repeat(11 * 1024 * 1024), "context/large.json is larger than 10 MB, the most dbtruth reads"],
  ];
  for (const [name, text, sentence] of refused) {
    writeFileSync(join(cwd, "context", name), text);
    assert.deepEqual(await checked(cwd, `context/${name}`), { code: 1, err: [sentence] }, name);
  }
});

test("check exits 1 for a --fail-on it does not know, with no database URL, and for a database it cannot reach", { timeout: 60_000 }, () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-check-"));
  mkdirSync(join(cwd, "context"));
  writeFileSync(join(cwd, FILE), serialize(snapshotOf({ [JOIN_ID]: verdict("confirmed", 1) }, { relationships: [JOIN] })));
  const env = { ...process.env, DATABASE_URL: "" };

  const unknown = command(cwd, env, "check", "--fail-on", "sometimes");
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr, "error: option '--fail-on <when>' argument 'sometimes' is invalid. Allowed choices are regression, change, never.\n");

  const nowhere = command(cwd, env, "check");
  assert.equal(nowhere.status, 1);
  assert.equal(nowhere.stderr.split("\n")[0], "no database URL: DATABASE_URL is not in the environment or in a .env");

  const unreachable = command(cwd, env, "check", "--url", UNREACHABLE);
  assert.equal(unreachable.status, 1);
  assert.equal(unreachable.stdout, "");
  assert.equal(unreachable.stderr, "dbtruth: could not connect to the database: nothing is listening at the host and port in the URL; check them, and that the server is running\n");
});

test("check takes its options after its name, and the program's before it", { timeout: 60_000 }, () => {
  // No snapshot in context/, so a check that gets past its settings stops there, before it connects.
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-check-"));
  writeFileSync(join(cwd, "ci.env"), `DATABASE_URL=${UNREACHABLE}\n`);
  // Not set at all: an empty DATABASE_URL in the environment would hide the one in ci.env.
  const env = { ...process.env, DATABASE_URL: undefined };
  const lines = (...args: string[]) => {
    const { status, stdout, stderr } = command(cwd, env, ...args);
    return { status, stdout, stderr: stderr.split("\n").filter(Boolean) };
  };

  assert.deepEqual(lines("--url", UNREACHABLE, "check", "--snapshot", "elsewhere.json"), { status: 1, stdout: "", stderr: ["no elsewhere.json: run npx dbtruth first"] }, "the program's --url, and --snapshot");
  assert.deepEqual(lines("check", "--dotenv", "ci.env"), { status: 1, stdout: "", stderr: ["no context/snapshot.json: run npx dbtruth first"] }, "the URL from the file --dotenv names");
  assert.deepEqual(
    lines("check", "--url", UNREACHABLE, "--check-hit-rate-tolerance", "2"),
    { status: 1, stdout: "", stderr: ["dbtruth: DBTRUTH_CHECK_HIT_RATE_TOLERANCE / --check-hit-rate-tolerance: 2 is above the maximum 1"] },
    "a tunable after the name",
  );
});
