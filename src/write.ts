// write.ts: Verified -> Files, and Files -> disk. One call, prompt B, validated.
//
// This module owns the output directory. Paths are confined to context/ and made
// safe for every filesystem, files from a previous run are cleared so a renamed or
// dropped table leaves nothing stale behind, and one file that cannot be written is
// reported instead of aborting the rest.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AskOptions, Model } from "./model.js";
import { FilesSchema, type Files, type Verified } from "./schemas.js";

export const OUTPUT_DIR = "context";

export async function write(model: Model, verified: Verified, options?: AskOptions): Promise<Files> {
  const files = await model.ask("write", verified, FilesSchema, options);
  const out: Files = {};
  const taken = new Set<string>();
  for (const [path, markdown] of Object.entries(files)) {
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
