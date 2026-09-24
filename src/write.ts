// write.ts: Verified -> Files, and Files -> disk. README and ENTITIES from one call, prompt B,
// validated; one file per relation rendered from the measurements, no call at all.
//
// This module owns the output directory. Paths are confined to context/ and made
// safe for every filesystem, files from a previous run are cleared so a renamed or
// dropped table leaves nothing stale behind, and one file that cannot be written is
// reported instead of aborting the rest.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AskOptions, Model } from "./model.js";
import { FilesSchema, relationshipId, suspicionId, type Files, type TableFacts, type Verified } from "./schemas.js";

export const OUTPUT_DIR = "context";

export async function write(model: Model, verified: Verified, options?: AskOptions): Promise<Files> {
  const written = await model.ask("write", verified, FilesSchema, options);
  // One flat file per relation, so a name with a path separator in it still lands under tables/.
  const rendered = Object.fromEntries(verified.tables.map((t) => [`${OUTPUT_DIR}/tables/${t.name.replace(/[\\/]/g, "_")}.md`, tableFile(verified, t)]));
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
  return out;
}

/**
 * context/tables/<table>.md from Verified rather than from the model: the purpose and grain the model
 * gave in contextualize, and the key, size, joins, problems and values the database gave in extract
 * and verify. Rejected claims are left out, and nothing unconfirmed passes as a fact.
 */
export function tableFile(v: Verified, t: TableFacts): string {
  const mine = (name: string) => name === t.name;
  const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
  const meaning = v.claims.tables.find((m) => mine(m.name));

  const joins = v.claims.relationships.filter((r) => mine(r.from.table) || mine(r.to.table)).flatMap((r) => {
    const verdict = v.verdicts[relationshipId(r)];
    if (!verdict || verdict.status === "rejected") return [];
    const n = verdict.measurement.numbers;
    const edge = `${r.from.table}.${r.from.column} -> ${r.to.table}.${r.to.column}`;
    const inferred = r.basis === "stated" ? "" : " (inferred)";
    const nulls = n.nulls ? ` ${n.nulls} sampled rows (${pct(n.nulls / (n.total! + n.nulls))}) have no ${r.from.column}; an inner join drops them too.` : "";
    if (verdict.status === "confirmed") return [`- ${edge}: confirmed, ${pct(n.hit!)} of ${n.total} sampled rows match${inferred}.${nulls}`];
    if (verdict.status === "broken") return [`- **BROKEN** ${edge}: ${pct(n.hit!)} match (${n.hits} of ${n.total} sampled), ${n.orphans} orphans${inferred}. An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.${nulls}`];
    return [`- ${edge} (inferred, ${verdict.skipped ? `not measured: ${verdict.skipped}` : verdict.status})`];
  });

  const problems = v.claims.suspicions.filter((s) => s.tables.some(mine)).flatMap((s) => {
    const verdict = v.verdicts[suspicionId(s)];
    if (!verdict || verdict.status === "rejected") return [];
    const subject = [...s.tables.filter((name) => !mine(name)), ...(s.column ? [s.column] : [])].join(", ");
    const head = `${s.kind}${subject ? ` ${subject}` : ""}`;
    if (verdict.status !== "confirmed") return [`- ${head} (inferred${verdict.skipped ? `, not measured: ${verdict.skipped}` : ""}): ${s.detail}`];
    const numbers = Object.entries(verdict.measurement.numbers).map(([k, x]) => `${k} ${x}`).join(", ");
    const hint = s.kind === "inconsistent_values" && s.column ? ` Compare with lower(btrim(${s.column})).` : "";
    return [`- **${head}**: ${s.detail} (${numbers}).${hint}`];
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

/** Clears what a previous run wrote under cwd/context, then writes every file, collecting failures. */
export function persist(cwd: string, files: Files): Persisted {
  const dir = join(cwd, OUTPUT_DIR);
  for (const stale of previousOutputs(dir)) rmSync(stale, { force: true });
  const out: Persisted = { written: [], failed: [] };
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

/** Only the files this tool writes: the two top-level files, per-table files, and raw-reply dumps. */
function previousOutputs(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  const top = readdirSync(dir).filter((f) => f === "README.md" || f === "ENTITIES.md" || /^\.raw-.*\.json$/.test(f)).map((f) => join(dir, f));
  const tables = join(dir, "tables");
  const perTable = isDirectory(tables) ? readdirSync(tables).filter((f) => f.endsWith(".md")).map((f) => join(tables, f)) : [];
  return [...top, ...perTable];
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
