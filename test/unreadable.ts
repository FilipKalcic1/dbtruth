import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Writes a file this user cannot read. Mode bits do not govern reading on Windows, so there the file's ACL denies
 * everyone (S-1-1-0) the right to read its data; it can still be deleted. Root reads anything, hence the check.
 */
export function writeUnreadable(path: string, text: string): void {
  writeFileSync(path, text);
  if (process.platform === "win32") spawnSync("icacls", [path, "/deny", "*S-1-1-0:(RD)"], { stdio: "ignore" });
  else chmodSync(path, 0o000);
  assert.throws(() => readFileSync(path), `${path} must be unreadable for this test to mean anything; is it running as root?`);
}
