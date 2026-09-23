// Packs the package as npm would publish it, installs the tarball into an empty project
// and runs the installed binary: what a user gets, not what the working copy has.
// Expects `npm run build` to have run; `npm run verify` orders it that way.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REQUIRED = ["dist/cli.js", "dist/prompts/contextualize.md", "dist/prompts/write.md", "README.md", "LICENSE"];
// Matched against every path segment, so dist/test/ or dist/.env is caught as well.
const FORBIDDEN = ["test", "src", ".env", "context"];

// Through a shell, because npm and the installed bin shim are .cmd files on Windows.
const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// The tarball and the project that installs it live in one temporary directory, removed whatever happens.
const dir = mkdtempSync(join(tmpdir(), "dbtruth-pack-"));
try {
  const [{ filename, files }] = JSON.parse(sh(`npm pack --json --pack-destination "${dir}"`, ROOT));
  const paths = files.map((f) => f.path);
  const missing = REQUIRED.filter((p) => !paths.includes(p));
  if (missing.length > 0) throw new Error(`${filename} lacks ${missing.join(", ")}`);
  const stray = paths.filter((p) => p.split("/").some((segment) => FORBIDDEN.includes(segment)));
  if (stray.length > 0) throw new Error(`${filename} contains ${stray.join(", ")}`);
  console.log(`pack-smoke: ${filename} contains ${REQUIRED.join(", ")}`);
  console.log(`pack-smoke: ${filename} contains no ${FORBIDDEN.join(", ")}`);

  sh("npm init -y", dir);
  sh(`npm install --no-audit --no-fund "${join(dir, filename)}"`, dir);
  const help = sh(`"${join("node_modules", ".bin", "dbtruth")}" --help`, dir);
  if (!help.startsWith("Usage: dbtruth")) throw new Error(`the installed dbtruth --help printed no usage:\n${help}`);
  console.log("pack-smoke: the installed dbtruth --help prints its usage");
} catch (e) {
  console.error(`pack-smoke: FAIL ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
