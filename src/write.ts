// write.ts: Verified -> Files. One call, prompt B, validated.
//
// Paths are confined to context/: anything outside it is dropped, so a strange
// reply can never write elsewhere on disk.

import type { Model } from "./model.js";
import { FilesSchema, type Files, type Verified } from "./schemas.js";

export const OUTPUT_DIR = "context";

export async function write(model: Model, verified: Verified): Promise<Files> {
  const files = await model.ask("write", verified, FilesSchema);
  const out: Files = {};
  for (const [path, markdown] of Object.entries(files)) {
    const safe = confine(path);
    if (safe) out[safe] = markdown;
  }
  return out;
}

/** "context/tables/orders.md" style path inside OUTPUT_DIR, or undefined if it escapes. */
export function confine(path: string): string | undefined {
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === "..")) return undefined;
  if (parts[0] !== OUTPUT_DIR) parts.unshift(OUTPUT_DIR);
  return parts.length > 1 ? parts.join("/") : undefined;
}
