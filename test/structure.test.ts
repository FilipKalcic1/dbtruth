import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const modules = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));

test("only safety.ts imports pg and only model.ts imports the Anthropic SDK", () => {
  assert.ok(modules.includes("safety.ts"));
  assert.ok(modules.includes("model.ts"));
  for (const file of modules) {
    const source = readFileSync(join(srcDir, file), "utf8");
    const importsPg = /from\s+["']pg["']/.test(source) || /require\(\s*["']pg["']\s*\)/.test(source);
    const importsSdk = /["']@anthropic-ai\/sdk/.test(source);
    assert.equal(importsPg, file === "safety.ts", `${file} must ${file === "safety.ts" ? "" : "not "}import pg`);
    assert.equal(importsSdk, file === "model.ts", `${file} must ${file === "model.ts" ? "" : "not "}import the SDK`);
  }
});

test("every module loads without side effects (cli.ts is the entry point and is excluded)", async () => {
  for (const file of modules) {
    if (file === "cli.ts") continue;
    await import(new URL(`../src/${file.replace(/\.ts$/, ".js")}`, import.meta.url).href);
  }
});

test("dependency direction matches the spec", () => {
  const allowed: Record<string, string[]> = {
    "cli.ts": ["config", "safety", "extract", "contextualize", "verify", "verdict", "write", "schemas", "model", "doctor", "snapshot", "check", "mcp"],
    "config.ts": [],
    "safety.ts": [],
    "model.ts": ["config"],
    "extract.ts": ["safety", "config", "schemas"],
    "contextualize.ts": ["model", "schemas"],
    "verify.ts": ["safety", "schemas", "config"],
    "verdict.ts": ["config", "schemas"],
    "write.ts": ["model", "schemas"],
    "schemas.ts": [],
    "doctor.ts": ["safety", "model", "config"],
    "snapshot.ts": ["schemas", "config"],
    // safety for the Db type only, as write.ts imports model for its types.
    "check.ts": ["schemas", "config", "extract", "verify", "verdict", "snapshot", "safety"],
    // safety for the Connection type only.
    "mcp.ts": ["config", "safety", "extract", "verify", "verdict", "schemas", "snapshot", "check", "write"],
  };
  for (const file of modules) {
    const source = readFileSync(join(srcDir, file), "utf8");
    const local = [...source.matchAll(/from\s+["']\.\/([a-z]+)\.js["']/g)].map((m) => m[1]!);
    const permitted = allowed[file];
    assert.ok(permitted, `${file} is not in the module list of the spec`);
    for (const dep of local) {
      assert.ok(permitted.includes(dep), `${file} must not import ./${dep}`);
    }
  }
});

test("check.ts and snapshot.ts never import model", () => {
  // Nor through a module they import: check runs without a model, and loading one would load the Anthropic SDK.
  const imports = (file: string) => [...readFileSync(join(srcDir, file), "utf8").matchAll(/from\s+["']\.\/([a-z]+)\.js["']/g)].map((m) => `${m[1]}.ts`);
  for (const start of ["check.ts", "snapshot.ts"]) {
    const reached = new Set([start]);
    for (const file of reached) for (const dep of imports(file)) reached.add(dep);
    assert.ok(!reached.has("model.ts"), `${start} reaches model.ts through ${[...reached].join(", ")}`);
  }
});

test("only mcp.ts imports the MCP SDK, whose version is pinned", () => {
  assert.ok(modules.includes("mcp.ts"));
  for (const file of modules) {
    const importsSdk = /["']@modelcontextprotocol\//.test(readFileSync(join(srcDir, file), "utf8"));
    assert.equal(importsSdk, file === "mcp.ts", `${file} must ${file === "mcp.ts" ? "" : "not "}import the MCP SDK`);
  }
  // Exact versions, so no install brings in a release of the server, or of the client its tests use, nobody tested.
  const { dependencies, devDependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Record<string, Record<string, string>>;
  assert.match(dependencies!["@modelcontextprotocol/server"] ?? "", /^\d+\.\d+\.\d+$/);
  assert.match(devDependencies!["@modelcontextprotocol/client"] ?? "", /^\d+\.\d+\.\d+$/);
});

test("mcp.ts never loads model.ts at run time", () => {
  // Through the modules it imports for more than types, which TypeScript erases: write.ts imports model's types only.
  const loads = (file: string) => [...readFileSync(join(srcDir, file), "utf8").matchAll(/^import (?!type )[^;]*?from\s+["']\.\/([a-z]+)\.js["']/gm)].map((m) => `${m[1]}.ts`);
  const reached = new Set(["mcp.ts"]);
  for (const file of reached) for (const dep of loads(file)) reached.add(dep);
  assert.ok(reached.has("write.ts") && reached.has("check.ts"), `the walk reached ${[...reached].join(", ")}`);
  assert.ok(!reached.has("model.ts"), `mcp.ts reaches model.ts through ${[...reached].join(", ")}`);
});
