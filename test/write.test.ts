import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModel } from "../src/model.js";
import type { Verified } from "../src/schemas.js";
import { confine, persist, write } from "../src/write.js";

test("confine keeps every path inside context/ and makes it safe on every filesystem", () => {
  assert.equal(confine("context/tables/orders.md"), "context/tables/orders.md");
  assert.equal(confine("tables/orders.md"), "context/tables/orders.md", "a missing prefix is added");
  assert.equal(confine("./context/README.md"), "context/README.md");
  assert.equal(confine("../escape.md"), undefined, "nothing escapes");
  assert.equal(confine("context"), undefined, "the directory itself is not a file");
  assert.equal(confine("context/tables/what?.md"), "context/tables/what_.md", "Windows-invalid characters become underscores");
  assert.equal(confine("context/tables/app:orders.md"), "context/tables/app_orders.md", "a colon would name an NTFS stream");
  assert.equal(confine("C:/evil/x.md"), "context/C_/evil/x.md", "a drive letter is just a directory name inside context/");
  assert.equal(confine("context/tables/con.md"), "context/tables/_con.md", "reserved device names get a prefix");
  assert.equal(confine("context/tables/my-table. "), "context/tables/my-table", "trailing dots and spaces go, hyphens stay");
});

test("two names that differ only by case get distinct files", async () => {
  const model = createModel({
    rawDir: mkdtempSync(join(tmpdir(), "dbtruth-")),
    maxOutputTokens: 1,
    transport: async () => JSON.stringify({ "context/tables/Users.md": "a", "context/tables/users.md": "b", "context/tables/USERS.md": "c" }),
  });
  const stub = { version: 1, database: "x", relations: "1 table", claims: { entities: [], tables: [], relationships: [], suspicions: [], questions: [] }, verdicts: {}, fitsInContext: true, tables: [] } as Verified;
  const files = await write(model, stub);
  assert.deepEqual(Object.keys(files), ["context/tables/Users.md", "context/tables/users~2.md", "context/tables/USERS~3.md"]);
});

test("persist clears a previous run's files, leaves other files alone, and writes the new set", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-"));
  mkdirSync(join(cwd, "context", "tables"), { recursive: true });
  writeFileSync(join(cwd, "context", "tables", "dropped_table.md"), "stale");
  writeFileSync(join(cwd, "context", ".raw-write.json"), "{}");
  writeFileSync(join(cwd, "context", "keep.txt"), "not ours");

  const r = persist(cwd, { "context/README.md": "# a", "context/tables/orders.md": "# o" });

  assert.deepEqual(r.written, ["context/README.md", "context/tables/orders.md"]);
  assert.deepEqual(r.failed, []);
  assert.ok(!existsSync(join(cwd, "context", "tables", "dropped_table.md")), "a table that no longer exists leaves no stale file");
  assert.ok(!existsSync(join(cwd, "context", ".raw-write.json")), "a failed run's raw dump does not survive a successful one");
  assert.ok(existsSync(join(cwd, "context", "keep.txt")), "files the tool did not write are not touched");
  assert.equal(readFileSync(join(cwd, "context", "README.md"), "utf8"), "# a");
});

test("a file that cannot be written is reported, and the others are still written", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-"));
  mkdirSync(join(cwd, "context"), { recursive: true });
  writeFileSync(join(cwd, "context", "tables"), "a file where a directory is needed");

  const r = persist(cwd, { "context/README.md": "# a", "context/tables/orders.md": "# o" });

  assert.deepEqual(r.written, ["context/README.md"]);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0]!.path, "context/tables/orders.md");
});
