// write.ts: Verified -> Files, and Files -> disk. README and ENTITIES from one call, prompt B,
// validated, and sent no more than the model's input ceiling; one file per relation rendered
// from the measurements, no call at all.
//
// This module owns the output directory. Paths are confined to context/ and made
// safe for every filesystem, files from a previous run that this one does not write
// again are cleared so a renamed or dropped table leaves nothing stale behind, and one
// file that cannot be removed or written is reported instead of aborting the rest.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { AskOptions, Model } from "./model.js";
import { FilesSchema, relationshipId, sqlString, suspicionId, type Files, type Relationship, type TableFacts, type Verdict, type Verified } from "./schemas.js";

export const OUTPUT_DIR = "context";
/** cli.ts adds the snapshot to the files it hands persist, so this module need not know what it holds. */
export const SNAPSHOT_FILE = "snapshot.json";

/**
 * The files of a run: README and ENTITIES from prompt B, sent Verified as fitForWriter holds it, and one file per
 * relation rendered from Verified whole, which wins over a file of the same name. The note says what prompt B was not
 * sent.
 */
export async function write(model: Model, verified: Verified, limits: { modelMaxInputTokens: number; charsPerToken: number }, options?: AskOptions): Promise<{ files: Files; reduced?: string }> {
  const { verified: sent, reduced } = fitForWriter(verified, limits);
  const written: Files = sent ? await model.ask("write", sent, FilesSchema, options) : {};
  const rendered = Object.fromEntries(verified.tables.map((t) => [tableFileName(t.name), tableFile(verified, t)]));
  const out: Files = {};
  const taken = new Set<string>();
  for (const [path, markdown] of Object.entries({ ...written, ...rendered })) {
    const safe = confine(path);
    if (!safe) continue;
    // Two names that differ only by case would overwrite each other on a case-insensitive filesystem.
    let unique = safe;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = safe.replace(/(\.[^./]+)?$/, `~${n}$1`);
    taken.add(unique.toLowerCase());
    out[unique] = markdown;
  }
  return { files: out, reduced };
}

/**
 * What prompt B is sent: Verified, held to the model's input ceiling as fitToContext holds prompt A's input. Over it,
 * every verdict's query is left out, which --json and the snapshot keep and no per-table file shows; if that is still
 * over it, nothing is sent. The note says which.
 */
export function fitForWriter(verified: Verified, cfg: { modelMaxInputTokens: number; charsPerToken: number }): { verified?: Verified; reduced?: string } {
  const tokens = (v: Verified) => Math.ceil(JSON.stringify(v).length / cfg.charsPerToken);
  if (tokens(verified) <= cfg.modelMaxInputTokens) return { verified };
  const verdicts = Object.fromEntries(Object.entries(verified.verdicts).map(([id, v]) => [id, { ...v, measurement: { ...v.measurement, query: "" } }]));
  const shorter = { ...verified, verdicts };
  if (tokens(shorter) <= cfg.modelMaxInputTokens) return { verified: shorter, reduced: "the verdicts' queries dropped to fit the model's input limit" };
  return { reduced: "README.md and ENTITIES.md not written: over the model's input limit even without the verdicts' queries" };
}

/** A relation's file under context/tables/, before confine: one flat file, so a name with a path separator in it still lands under tables/. */
export function tableFileName(name: string): string {
  return `${OUTPUT_DIR}/tables/${name.replace(/[\\/]/g, "_")}.md`;
}

/**
 * context/tables/<table>.md from Verified rather than from the model: the purpose and grain the model
 * gave in contextualize, and the key, size, joins, problems and values the database gave in extract
 * and verify. Rejected claims are left out, and nothing unconfirmed passes as a fact.
 */
export function tableFile(v: Verified, t: TableFacts): string {
  const mine = (name: string) => name === t.name;
  const meaning = v.claims.tables.find((m) => mine(m.name));

  const joins = v.claims.relationships.filter((r) => mine(r.from.table) || mine(r.to.table)).flatMap((r) => {
    const verdict = v.verdicts[relationshipId(r)];
    return verdict && verdict.status !== "rejected" ? [`- ${joinLine(r, verdict)}`] : [];
  });

  const problems = v.claims.suspicions.filter((s) => s.tables.some(mine)).flatMap((s) => {
    const verdict = v.verdicts[suspicionId(s)];
    if (!verdict || verdict.status === "rejected") return [];
    const subject = [...s.tables.filter((name) => !mine(name)), ...(s.column ? [s.column] : [])].join(", ");
    const head = `${s.kind}${subject ? ` ${subject}` : ""}`;
    if (verdict.status !== "confirmed") return [`- ${head} (inferred${verdict.skipped ? `, not measured: ${verdict.skipped}` : ""}): ${s.detail}`];
    // A verdict confirms the numbers, measured over the first table the suspicion names, and not the detail's words.
    const numbers = Object.entries(verdict.measurement.numbers).map(([k, x]) => `${k} ${x}`).join(", ");
    const over = s.tables.length > 1 ? ` (measured over ${s.tables[0]})` : "";
    const hint = s.kind === "inconsistent_values" && s.column ? ` Compare with lower(btrim(${s.column})).` : "";
    return [`- **${head}**: ${numbers}${over}.${hint} ${s.detail} (inferred)`];
  });

  const values = Object.entries(t.categorical).map(([column, list]) => `- ${column}: ${list.map((x) => JSON.stringify(x)).join(", ")}`);
  const sampled = t.estimateSource === "pilot" ? " (estimated from a sample)" : "";
  const size = t.rowEstimate < 0 ? "size unknown" : t.rowEstimate === 0 ? "no rows" : `~${Math.round(t.rowEstimate)} rows${sampled}`;
  const facts = `${t.kind}${t.partitions ? `, ${t.partitions.count} partitions` : ""}, ${size}, primary key: ${t.primaryKey?.join(", ") ?? "none"}`;
  const section = (title: string, lines: string[]) => (lines.length ? ["", `## ${title}`, "", ...lines] : []);
  return [
    `# ${t.name}`,
    "",
    ...(meaning ? [`${meaning.purpose}${meaning.basis === "inferred" ? " (inferred)" : ""}`, `Grain: ${meaning.grain}`, ...meaning.notes.map((note) => `- ${note}`), ""] : []),
    facts,
    ...section("Joins", joins),
    ...section("Known problems", problems),
    ...section("Values", values),
  ].join("\n") + "\n";
}

/**
 * One join and its verdict in a sentence: a table's file shows it as a line, and measure_join answers with it. Only
 * measure_join reaches a rejected join, which a table's file leaves out.
 */
export function joinLine(r: Relationship, verdict: Verdict): string {
  const n = verdict.measurement.numbers;
  const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
  // A branch's condition as a SQL literal, which an agent can paste into a WHERE.
  const edge = `${r.from.table}.${r.from.column} -> ${r.to.table}.${r.to.column}${r.when ? ` when ${r.when.column} = ${sqlString(r.when.equals)}` : ""}`;
  const inferred = r.basis === "stated" ? "" : " (inferred)";
  // A join confirmed on inference whose values other keys would hold too is not stated as a fact.
  const evidence = n.alsoFits ? ` (inferred; the same values would also match ${n.alsoFits} other key${n.alsoFits === 1 ? "" : "s"}, so the match alone does not prove this join)` : inferred;
  const nulls = n.nulls ? ` ${n.nulls} sampled rows (${pct(n.nulls / (n.total! + n.nulls))}) have no ${r.from.column}; an inner join drops them too.` : "";
  if (verdict.status === "confirmed") return `${edge}: confirmed, ${pct(n.hit!)} of ${n.total} sampled rows match${evidence}.${nulls}`;
  if (verdict.status === "broken") return `**BROKEN** ${edge}: ${pct(n.hit!)} match (${n.hits} of ${n.total} sampled), ${n.orphans} orphans${orphanShape(n, `${r.to.table}.${r.to.column}`)}${inferred}. An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.${nulls}`;
  if (verdict.status === "rejected") return `${edge}: rejected, ${pct(n.hit!)} of ${n.total} sampled rows match: these columns do not relate; find the right key.`;
  const status = verdict.skipped ? `not measured: ${verdict.skipped}` : verdict.status;
  return `${edge} (${r.basis === "stated" ? status : `inferred, ${status}`})`;
}

/** Where a join's orphans fall against the key it points at, when verify counted them: the place, never a cause. */
function orphanShape(n: Record<string, number>, key: string): string {
  if (n.orphansAbove === undefined || n.orphansBelow === undefined) return "";
  const places: [number, string][] = [
    [n.orphansAbove, `above the highest ${key}`],
    [n.orphansBelow, `below the lowest ${key}`],
    [n.orphans! - n.orphansAbove - n.orphansBelow, `inside the ${key} range`],
  ];
  const found = places.filter(([count]) => count > 0).map(([count, place]) => `${count === n.orphans ? "all" : count} ${place}`);
  return `, ${new Intl.ListFormat("en").format(found)}`;
}

/** Control characters and the set Windows refuses in file names, built without escape sequences. */
const UNSAFE_CHARACTERS = new RegExp("[<>:" + String.fromCharCode(34) + "|?*" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + "]", "g");

/** Names Windows refuses as files, with or without an extension. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * "context/tables/orders.md" style path inside OUTPUT_DIR, or undefined if it escapes.
 * Characters no filesystem should be handed (control characters and Windows' reserved set)
 * become underscores, trailing dots and spaces go, and reserved device names get a prefix.
 */
export function confine(path: string): string | undefined {
  const raw = path.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (raw.some((p) => p === "..")) return undefined;
  const parts = raw
    .map((p) => p.replace(UNSAFE_CHARACTERS, "_").replace(/[. ]+$/, ""))
    .filter((p) => p !== "")
    .map((p) => (RESERVED_NAMES.test(p) ? `_${p}` : p));
  if (parts[0] !== OUTPUT_DIR) parts.unshift(OUTPUT_DIR);
  return parts.length > 1 ? parts.join("/") : undefined;
}

export type Persisted = { written: string[]; failed: { path: string; error: string }[] };

/** Clears what a previous run wrote under cwd/context and this one does not write again, then writes every file, collecting failures. */
export function persist(cwd: string, files: Files): Persisted {
  const out: Persisted = { written: [], failed: [] };
  // A file written again is replaced by the write, which reports it if it cannot be. Any other, held open on Windows or
  // in a directory this user cannot write, stays, and is named as found on disk.
  const rewritten = new Set(Object.keys(files).map((path) => join(cwd, path)));
  for (const stale of previousOutputs(join(cwd, OUTPUT_DIR)).filter((path) => !rewritten.has(path))) {
    try {
      rmSync(stale, { force: true });
    } catch (e) {
      out.failed.push({ path: relative(cwd, stale), error: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const [path, markdown] of Object.entries(files)) {
    const full = join(cwd, path);
    try {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, markdown);
      out.written.push(path);
    } catch (e) {
      out.failed.push({ path, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** Only the files this tool writes: the two top-level files, the snapshot, per-table files, and raw-reply dumps. */
function previousOutputs(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  const top = readdirSync(dir).filter((f) => f === "README.md" || f === "ENTITIES.md" || f === SNAPSHOT_FILE || /^\.raw-.*\.json$/.test(f)).map((f) => join(dir, f));
  const tables = join(dir, "tables");
  const perTable = isDirectory(tables) ? readdirSync(tables).filter((f) => f.endsWith(".md")).map((f) => join(tables, f)) : [];
  return [...top, ...perTable];
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
