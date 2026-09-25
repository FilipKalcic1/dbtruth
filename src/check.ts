// check.ts: a snapshot and the database now -> CheckReport. What context/ claims, measured again without a model.
//
// The snapshot comes from a pull request, so nothing in it is run: every statement is built again by extract and
// verify from the catalog read now, as a full run builds it, and a name a claim holds is only a key to look up there.
// The queries the snapshot stores are never run and never printed. Claims are measured with the settings the snapshot
// was measured with, so that a default changed since cannot pass for a change in the data; the budget, the timeout and
// the tolerance are this run's. Only the relations the claims name are profiled; the whole catalog is read, for the
// relations added or dropped since, and for the integer keys a join confirmed on inference is weighed against.
//
// The report is rendered here too: the lines check prints on stderr and a pull request comment; --json prints the object
// itself.

import type { Config } from "./config.js";
import { extract, integerKeys, readCatalog } from "./extract.js";
import type { Db } from "./safety.js";
import { CHECK_CLASSES, CHECK_REPORT_FORMAT, findTable, relationshipId, SnapshotSchema, suspicionId, type CheckClass, type CheckReport, type Claims, type ClaimCheck, type Snapshot, type Verdict } from "./schemas.js";
import { schemaOf, settingsOf } from "./snapshot.js";
import { verdicts } from "./verdict.js";
import { verify } from "./verify.js";

/** When check exits 2: on a regression or a stale item, on any change, or never. */
export const FAIL_ON = ["regression", "change", "never"] as const;
export type FailOn = (typeof FAIL_ON)[number];

const FAILING: Record<FailOn, CheckClass[]> = {
  regression: ["regression", "stale"],
  change: ["regression", "stale", "drift", "improved", "changed"],
  never: [],
};

// Moves between two measured statuses that are a regression or an improvement; any other is a change. A suspicion is
// a problem, so for it confirmed is the worse side.
const REGRESSIONS = { relationship: ["confirmed->broken", "confirmed->rejected", "broken->rejected"], suspicion: ["rejected->confirmed"] };
const IMPROVEMENTS = { relationship: ["broken->confirmed"], suspicion: ["confirmed->rejected"] };

/** The first line of every comment, by which it can be found again and updated. */
export const COMMENT_MARKER = "<!-- dbtruth-check -->";

// Part of the comment's format, like the snapshot's 10 MB: GitHub refuses a body over 65,536 characters. stderr and
// --json keep every item.
const COMMENT_MAX_ROWS = 50;

const FIX = "run npx dbtruth and commit context/";

/** A claim's table, with the column it names there when it names one. */
type Name = [table: string, column?: string];

/**
 * An item that is not unchanged, as a report shows it. A relation added or dropped has no before. Why it could not be
 * measured is printed on stderr only.
 */
type Row = { cls: CheckClass; name: string; before?: string; after: string; reason?: string };

/** The snapshot's claims measured again on db, as the snapshot measured them, and compared with it. */
export async function remeasure(db: Db, cfg: Config, snapshot: Snapshot): Promise<CheckReport> {
  const measuring: Config = { ...cfg, ...snapshot.measuredWith };
  const catalog = await readCatalog(db);
  const named = new Set(claimNames(snapshot.claims).flatMap((c) => c.names.map(([table]) => findTable(catalog, table))));
  const extracted = await extract(db, measuring, catalog.filter((r) => named.has(r)), { samples: false, reveal: new Set() });
  // A condition is measured only on a column that looks categorical, which these settings decide, and a pull request can
  // edit them: bounds wider than this run's, or a smaller sample, on whose few rows most columns repeat a value, would let
  // a condition count a guess at a hidden value (R3). With such settings no column counts as categorical.
  const wider = measuring.sampleRows < cfg.sampleRows || measuring.categoricalMaxDistinct > cfg.categoricalMaxDistinct || measuring.categoricalMaxValueLength > cfg.categoricalMaxValueLength;
  const tables = wider ? extracted.tables.map((t) => ({ ...t, columns: t.columns.map((c) => ({ ...c, visible: false })) })) : extracted.tables;
  const measured = verdicts(await verify(db, measuring, { ...extracted, tables }, snapshot.claims, () => integerKeys(db, measuring, catalog)), measuring);
  return diff(snapshot, { database: db.database, schema: schemaOf(catalog), verdicts: measured }, cfg);
}

/** The snapshot against what was measured now: a class for each of its claims, the relations added or dropped, and what to note. */
export function diff(before: Snapshot, now: Pick<Snapshot, "database" | "schema" | "verdicts">, cfg: Config): CheckReport {
  const claims = claimNames(before.claims).map(({ id, kind, names }): ClaimCheck => {
    // A claim the snapshot holds no verdict for was not measured then; verify measures every claim now.
    const was = before.verdicts[id];
    const status = was?.status ?? "unverifiable";
    const hitBefore = was?.measurement.numbers.hit;
    const after = now.verdicts[id]!;
    // A claim the snapshot could not measure on a name its schema lacked, such as a table the model invented, had
    // nothing to lose since; any other claim is stale once the database lacks a name it uses.
    const invented = status === "unverifiable" && missingName(before.schema.relations, names) !== undefined;
    const missing = invented ? undefined : missingName(now.schema.relations, names);
    const cls = classify(kind, status, hitBefore, after, missing, cfg.checkHitRateTolerance);
    return { id, class: cls, before: status, ...(hitBefore === undefined ? {} : { hitBefore }), after, ...(cls === "stale" ? { missing } : {}) };
  });
  // By exact name, in code-unit order; a relation the full run listed without examining it is in the context all the same.
  const listed = new Set(before.schema.relations.map((r) => r.name));
  const present = new Set(now.schema.relations.map((r) => r.name));
  const relations = [...new Set([...listed, ...present])]
    .sort()
    .filter((name) => listed.has(name) !== present.has(name))
    .map((name) => ({ name, in: present.has(name) ? ("database" as const) : ("context" as const) }));
  // This run's settings, not the defaults: a run given the snapshot's own has nothing to note.
  const current = new Map(Object.entries(settingsOf(SnapshotSchema.shape.measuredWith.parse(cfg))));
  const settings = Object.entries(settingsOf(before.measuredWith)).filter(([name, value]) => current.get(name) !== value).map(([name, value]) => ({ name, snapshot: value, now: current.get(name)! }));
  return {
    report: CHECK_REPORT_FORMAT,
    database: { snapshot: before.database, now: now.database },
    schemaChanged: before.schema.fingerprint !== now.schema.fingerprint,
    settings,
    claims,
    relations,
  };
}

/** Whether the build fails under failOn: a relation added or dropped counts as a stale item. */
export function fails(report: CheckReport, failOn: FailOn): boolean {
  return items(report).some((cls) => FAILING[failOn].includes(cls));
}

/**
 * The notes, a line for each item that is not unchanged, most serious first, the count of each class, and the fix when
 * there is one. Names are printed as they are, and a stale line says only what is gone.
 */
export function reportLines(report: CheckReport): string[] {
  return [
    ...notes(report).map((note) => `note ${note}`),
    ...rows(report).map(({ cls, name, before, after, reason }) => `${cls} ${name}: ${cls === "stale" ? "" : `${before} -> `}${after}${reason ? ` (${reason})` : ""}`),
    `check ${report.database.now}: ${tally(items(report))}`,
    ...(fails(report, "change") ? [FIX] : []),
  ];
}

/**
 * The pull request comment: the marker, the counts, a table of what fails the default build, the rest folded, at most
 * COMMENT_MAX_ROWS rows in all, the notes, and the fix. Names are code. No query and no reason: a reason can be the
 * server's words, and a comment is mailed to everyone who watches the pull request.
 */
export function reportMarkdown(report: CheckReport): string {
  const all = rows(report, code);
  const shown = all.slice(0, COMMENT_MAX_ROWS);
  const open = shown.filter((r) => FAILING.regression.includes(r.cls));
  const folded = shown.filter((r) => !FAILING.regression.includes(r.cls));
  // Each part is a Markdown block of its own, so a blank line goes between two.
  const parts = [
    [COMMENT_MARKER, `dbtruth: ${tally(items(report))}`],
    table(open),
    folded.length > 0 ? ["<details>", `<summary>${tally(folded.map((r) => r.cls))}</summary>`, "", ...table(folded), "", "</details>"] : [],
    all.length > shown.length ? [`and ${all.length - shown.length} more`] : [],
    notes(report, code).map((note) => `- note: ${note}`),
    fails(report, "change") ? [FIX] : [],
  ];
  return parts.filter((part) => part.length > 0).map((part) => part.join("\n")).join("\n\n") + "\n";
}

/**
 * The class of one claim, by the first rule that applies. A name the database lost makes it stale. The same status is
 * unchanged, or drift once the hit rate moved by the tolerance. Then a regression or an improvement, by the moves
 * above. A side that could not be measured says nothing about the data, so the claim is not measured and fails no
 * build; any other move is a change.
 */
function classify(kind: keyof typeof REGRESSIONS, before: Verdict["status"], hitBefore: number | undefined, after: Verdict, missing: string | undefined, tolerance: number): CheckClass {
  if (missing !== undefined) return "stale";
  if (before === after.status) {
    const hit = after.measurement.numbers.hit;
    const moved = hit === undefined || hitBefore === undefined ? 0 : Math.abs(hit - hitBefore);
    // Each rate is rounded to a double, so a move of exactly the tolerance can come out a hair short: 0.82 - 0.81 < 0.01.
    return moved > 0 && moved + Number.EPSILON >= tolerance ? "drift" : "unchanged";
  }
  const move = `${before}->${after.status}`;
  if (REGRESSIONS[kind].includes(move)) return "regression";
  if (IMPROVEMENTS[kind].includes(move)) return "improved";
  return before === "unverifiable" || after.status === "unverifiable" ? "not measured" : "changed";
}

/**
 * Each claim's id and kind, and the names it uses: a relationship its two columns and the column its condition names,
 * a suspicion its tables, the first with its column.
 */
function claimNames(claims: Claims): { id: string; kind: keyof typeof REGRESSIONS; names: Name[] }[] {
  return [
    ...claims.relationships.map((r) => ({
      id: relationshipId(r),
      kind: "relationship" as const,
      names: [[r.from.table, r.from.column], [r.to.table, r.to.column], ...(r.when ? [[r.from.table, r.when.column] satisfies Name] : [])] satisfies Name[],
    })),
    ...claims.suspicions.map((s) => ({ id: suspicionId(s), kind: "suspicion" as const, names: s.tables.map((table, i): Name => (i === 0 && s.column !== undefined ? [table, s.column] : [table])) })),
  ];
}

/** The first of names the database does not have, as "table" or "table.column". */
function missingName(relations: Snapshot["schema"]["relations"], names: Name[]): string | undefined {
  for (const [table, column] of names) {
    const found = findTable(relations, table);
    if (!found) return table;
    if (column !== undefined && !found.columns.some(([name]) => name === column)) return `${table}.${column}`;
  }
  return undefined;
}

/** Every item's class: each claim's, and stale for each relation added or dropped. */
function items(report: CheckReport): CheckClass[] {
  return [...report.claims.map((c) => c.class), ...report.relations.map((): CheckClass => "stale")];
}

/**
 * Every item that is not unchanged, most serious first: the classes in their order, the claims of each in the report's,
 * and the relations after the stale claims. show turns each name the report holds into what is printed.
 */
function rows({ claims, relations }: CheckReport, show = (text: string) => text): Row[] {
  return CHECK_CLASSES.filter((c) => c !== "unchanged").flatMap((cls) => [
    ...claims
      .filter((c) => c.class === cls)
      .map(({ id, before, hitBefore, after, missing }): Row => ({
        cls,
        name: show(id),
        before: side(before, hitBefore),
        ...(missing ? { after: `${show(missing)} is not in the database` } : { after: side(after.status, after.measurement.numbers.hit), ...(after.skipped ? { reason: after.skipped } : {}) }),
      })),
    ...(cls === "stale" ? relations.map((r): Row => ({ cls, name: show(r.name), after: r.in === "database" ? "in the database, not in the context" : "in the context, not in the database" })) : []),
  ]);
}

/** What the report notes: another database, other settings, a changed schema. The settings' names are the snapshot schema's own. */
function notes({ database, settings, schemaChanged }: CheckReport, show = (text: string) => text): string[] {
  return [
    ...(database.snapshot !== database.now ? [`the snapshot is of database ${show(database.snapshot)}; this is ${show(database.now)}`] : []),
    ...(settings.length > 0 ? [`measured with the snapshot's settings, which differ from this run's: ${settings.map((s) => `${s.name} ${s.snapshot} (this run ${s.now})`).join(", ")}`] : []),
    ...(schemaChanged ? ["the schema changed since the snapshot"] : []),
  ];
}

/** "1 regression, 3 stale": how many items of each class, in the order of the classes, or "no claims". */
function tally(classes: CheckClass[]): string {
  const counts = CHECK_CLASSES.flatMap((cls) => {
    const n = classes.filter((c) => c === cls).length;
    return n > 0 ? [`${n} ${cls}`] : [];
  });
  return counts.length > 0 ? counts.join(", ") : "no claims";
}

/** The rows as a Markdown table, or nothing. A pipe inside a cell is escaped: GitHub ends a cell at any other. */
function table(entries: Row[]): string[] {
  if (entries.length === 0) return [];
  return ["| Class | Claim | Before | After |", "|---|---|---|---|", ...entries.map(({ cls, name, before, after }) => `| ${[cls, name, before ?? "", after].map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`)];
}

/**
 * A name as a code span on one line, in which GitHub makes no mention, issue, emoji or link, and reads no HTML. The fence
 * is one backtick longer than the longest run inside, and the spaces inside it, one of which CommonMark strips from
 * each end, keep a backtick at either end of the name off the fence.
 */
function code(text: string): string {
  const inline = text.replace(/[\r\n]+/g, " ");
  // Not Math.max(...runs): a name from the snapshot can hold more runs than a call takes arguments.
  const longest = (inline.match(/`+/g) ?? []).reduce((n, run) => Math.max(n, run.length), 0);
  const fence = "`".repeat(longest + 1);
  return `${fence} ${inline} ${fence}`;
}

/** "broken 88.0%": the status, with the hit rate when there is one. */
function side(status: Verdict["status"], hit: number | undefined): string {
  return `${status}${hit === undefined ? "" : ` ${(hit * 100).toFixed(1)}%`}`;
}
