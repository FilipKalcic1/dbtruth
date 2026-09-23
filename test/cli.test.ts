import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("--version prints the version in package.json and nothing else, and exits 0", () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  // Run from a directory with no package.json, so the version has to come from next to the code, and with
  // no database URL, so a flag that fell through to a full run would stop there, before any network.
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-cli-"));
  const env = { ...process.env, DATABASE_URL: "" };
  for (const flag of ["--version", "-v"]) {
    // Each run takes about a second; one that hangs is killed at 20 s and fails with ETIMEDOUT.
    const result = spawnSync(process.execPath, ["--import", TSX, CLI, flag], { cwd, env, encoding: "utf8", timeout: 20_000 });
    assert.equal(result.error, undefined, `${flag}: ${result.error?.message}`);
    assert.equal(result.stdout, `${version}\n`, `${flag}: ${result.stderr}`);
    assert.equal(result.status, 0, flag);
  }
});
