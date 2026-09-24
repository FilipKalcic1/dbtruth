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
    "cli.ts": ["config", "safety", "extract", "contextualize", "verify", "verdict", "write", "schemas", "model", "doctor"],
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
