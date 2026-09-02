import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createModel, type Transport } from "../src/model.js";

const Schema = z.object({ answer: z.number() });

function scripted(replies: string[]): { transport: Transport; calls: { system: string; messages: unknown[] }[] } {
  const calls: { system: string; messages: unknown[] }[] = [];
  const transport: Transport = async (system, messages) => {
    calls.push({ system, messages: structuredClone(messages) });
    const next = replies.shift();
    if (next === undefined) throw new Error("no scripted reply left");
    return next;
  };
  return { transport, calls };
}

test("a valid reply wrapped in prose and fences is accepted on the first try", async () => {
  const s = scripted(['Sure, here it is:\n```json\n{ "answer": 42 }\n```']);
  const model = createModel({ rawDir: mkdtempSync(join(tmpdir(), "dbtruth-")), maxOutputTokens: 1000, transport: s.transport });
  const out = await model.ask("contextualize", { hello: "world" }, Schema);
  assert.deepEqual(out, { answer: 42 });
  assert.equal(s.calls.length, 1);
  assert.match(s.calls[0]!.system, /Postgres database/);
  assert.deepEqual(s.calls[0]!.messages, [{ role: "user", content: '{"hello":"world"}' }]);
});

test("a malformed reply is sent back with the validation error, once", async () => {
  const s = scripted(['{ "answer": "forty-two" }', '{ "answer": 42 }']);
  const model = createModel({ rawDir: mkdtempSync(join(tmpdir(), "dbtruth-")), maxOutputTokens: 1000, transport: s.transport });
  const out = await model.ask("contextualize", {}, Schema);
  assert.deepEqual(out, { answer: 42 });
  assert.equal(s.calls.length, 2);
  const retry = s.calls[1]!.messages as { role: string; content: string }[];
  assert.equal(retry.length, 3);
  assert.equal(retry[1]!.role, "assistant");
  assert.equal(retry[1]!.content, '{ "answer": "forty-two" }');
  assert.equal(retry[2]!.role, "user");
  assert.match(retry[2]!.content, /did not validate/);
  assert.match(retry[2]!.content, /answer/);
});

test("two malformed replies throw and save the raw replies", async () => {
  const rawDir = mkdtempSync(join(tmpdir(), "dbtruth-"));
  const s = scripted(["not json at all", '{ "answer": null }']);
  const model = createModel({ rawDir, maxOutputTokens: 1000, transport: s.transport });
  await assert.rejects(model.ask("write", {}, Schema), /failed validation twice/);
  const raw = join(rawDir, ".raw-write.json");
  assert.ok(existsSync(raw));
  const saved = JSON.parse(readFileSync(raw, "utf8"));
  assert.deepEqual(saved.replies, ["not json at all", '{ "answer": null }']);
  assert.equal(saved.errors.length, 2);
});
