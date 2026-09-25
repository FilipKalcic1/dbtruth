// Packs the package as npm would publish it, installs the tarball into an empty project
// and runs the installed binary: what a user gets, not what the working copy has.
// Expects `npm run build` to have run; `npm run verify` orders it that way.

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// What the installed dbtruth mcp must list, sorted.
const TOOLS = "check, context, describe_table, measure_join";
const REQUIRED = ["dist/cli.js", "dist/prompts/contextualize.md", "dist/prompts/write.md", "README.md", "LICENSE"];
// Matched against every path segment, so dist/test/ or dist/.env is caught as well.
const FORBIDDEN = ["test", "src", ".env", "context"];
// The database the installed doctor checks: DATABASE_URL, else the fixture, as every test falls back to it.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture";

// Through a shell, because npm and the installed bin shim are .cmd files on Windows.
const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// The tarball and the project that installs it live in one temporary directory, removed whatever happens.
const dir = mkdtempSync(join(tmpdir(), "dbtruth-pack-"));
try {
  const [{ filename, files, version }] = JSON.parse(sh(`npm pack --json --pack-destination "${dir}"`, ROOT));
  const paths = files.map((f) => f.path);
  const missing = REQUIRED.filter((p) => !paths.includes(p));
  if (missing.length > 0) throw new Error(`${filename} lacks ${missing.join(", ")}`);
  const stray = paths.filter((p) => p.split("/").some((segment) => FORBIDDEN.includes(segment)));
  if (stray.length > 0) throw new Error(`${filename} contains ${stray.join(", ")}`);
  console.log(`pack-smoke: ${filename} contains ${REQUIRED.join(", ")}`);
  console.log(`pack-smoke: ${filename} contains no ${FORBIDDEN.join(", ")}`);

  sh("npm init -y", dir);
  sh(`npm install --no-audit --no-fund "${join(dir, filename)}"`, dir);
  const dbtruth = `"${join("node_modules", ".bin", "dbtruth")}"`;
  const help = sh(`${dbtruth} --help`, dir);
  if (!help.startsWith("Usage: dbtruth")) throw new Error(`the installed dbtruth --help printed no usage:\n${help}`);
  console.log("pack-smoke: the installed dbtruth --help prints its usage");
  const printed = sh(`${dbtruth} --version`, dir);
  if (printed !== `${version}\n`) throw new Error(`the installed dbtruth --version printed ${JSON.stringify(printed)}, not ${version}`);
  console.log(`pack-smoke: the installed dbtruth --version prints ${version}, the version in package.json`);
  // Without an API key, so doctor sends nothing to the API: the key's line is a note, and no line can fail.
  const doctor = spawnSync(`${dbtruth} doctor`, { cwd: dir, env: { ...process.env, DATABASE_URL, ANTHROPIC_API_KEY: "" }, shell: true, encoding: "utf8" });
  const checks = doctor.stderr.trimEnd().split(/\r?\n/);
  if (doctor.status !== 0 || doctor.stdout !== "" || !checks.every((line) => /^(ok|note) /.test(line))) {
    throw new Error(`the installed dbtruth doctor exited ${doctor.status}:\n${doctor.stdout}${doctor.stderr}`);
  }
  console.log(`pack-smoke: the installed dbtruth doctor prints ${checks.length} checks, none failing`);
  // Started as a client starts it, with the variables the SDK passes a server and the database's: no API key.
  const client = new Client({ name: "pack-smoke", version });
  await client.connect(new StdioClientTransport({ command: join(dir, "node_modules", ".bin", "dbtruth"), args: ["mcp"], cwd: dir, env: { DATABASE_URL }, stderr: "pipe" }));
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort().join(", ");
    if (tools !== TOOLS) throw new Error(`the installed dbtruth mcp lists ${tools}, not ${TOOLS}`);
    const measured = await client.callTool({ name: "measure_join", arguments: { from_table: "orders", from_column: "customer_id", to_table: "customers", to_column: "id" } });
    const status = measured.isError ? undefined : JSON.parse(measured.content[1].text).status;
    if (status !== "broken") throw new Error(`the installed dbtruth mcp measured orders.customer_id -> customers.id as:\n${measured.content.map((block) => block.text).join("\n")}`);
  } finally {
    await client.close();
  }
  console.log(`pack-smoke: the installed dbtruth mcp lists ${TOOLS}, and measures orders.customer_id -> customers.id as broken`);
} catch (e) {
  console.error(`pack-smoke: FAIL ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
