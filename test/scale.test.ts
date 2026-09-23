import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";
import type { Transport } from "../src/model.js";
import type { Extract, Verified } from "../src/schemas.js";

const SCALE_URL = (process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture").replace(/\/[^/]+$/, "/scale");

/** Proposes one relationship per table, so verify has 300 measurements to get through. */
function fakeModel(): Transport {
  return async (system, messages) => {
    if (system.includes("writing reference files")) {
      return JSON.stringify({ "context/README.md": "# scale\n", "context/ENTITIES.md": "# entities\n" });
    }
    const extract = JSON.parse((messages[0]!.content as string)) as Extract;
    return JSON.stringify({
      entities: [],
      tables: [],
      relationships: extract.tables.map((t) => ({
        from: { table: t.name, column: "ref_id" },
        to: { table: "t_1", column: "id" },
        basis: "inferred",
        confidence: 0.5,
        reason: "same shape",
      })),
      suspicions: extract.tables.slice(0, 20).map((t) => ({ kind: "dead_table", tables: [t.name], detail: "check" })),
      questions: [],
    });
  };
}

test("300 tables: the budget is respected and output still renders", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-scale-"));
  const out: string[] = [];
  const started = Date.now();
  const code = await run(
    { url: SCALE_URL, samples: true, reveal: [], json: true, flags: { budgetSeconds: 0.3, statementTimeoutSeconds: 2 }, cwd, env: {}, out: (l) => out.push(l), err: () => {} },
    { transport: fakeModel() },
  );
  const seconds = (Date.now() - started) / 1000;
  const verified = JSON.parse(out.join("\n")) as Verified;
  const statuses = Object.values(verified.verdicts).map((v) => v.status);

  assert.ok(code === 0 || code === 2);
  assert.ok(seconds < 30, `took ${seconds.toFixed(1)}s`);
  assert.equal(Object.keys(verified.verdicts).length, verified.claims.relationships.length + verified.claims.suspicions.length);
  assert.ok(statuses.includes("unverifiable"), "some measurements ran out of budget");
  assert.ok(verified.tables.length < 300, "extraction stopped when the budget ran out");
  assert.equal(verified.fitsInContext, false, "tables were skipped or the schema is too large");
  assert.ok(existsSync(join(cwd, "context", "README.md")));
});

test("an extract over the model's input limit is trimmed before it is sent, and the disclosure says so", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-scale-"));
  const err: string[] = [];
  let sent: Extract | undefined;
  const transport: Transport = async (system, messages) => {
    if (system.includes("writing reference files")) return JSON.stringify({ "context/README.md": "# scale", "context/ENTITIES.md": "# entities" });
    sent = JSON.parse(messages[0]!.content as string) as Extract;
    return JSON.stringify({ entities: [], tables: [], relationships: [], suspicions: [], questions: [] });
  };
  await run({ url: SCALE_URL, samples: true, reveal: [], json: false, flags: { modelMaxInputTokens: "30000" }, cwd, env: {}, out: () => {}, err: (l) => err.push(l) }, { transport });
  assert.ok(sent, "the model was called");
  assert.ok(sent!.tables.every((t) => t.samples.length === 0), "sample rows were dropped");
  assert.ok(err.some((l) => /dropped to fit the model's input limit/.test(l)), "the disclosure line names the reduction");
});

test("300 tables with the full budget: every table extracted", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-scale-"));
  const out: string[] = [];
  const started = Date.now();
  await run(
    { url: SCALE_URL, samples: true, reveal: [], json: true, flags: {}, cwd, env: {}, out: (l) => out.push(l), err: () => {} },
    { transport: fakeModel() },
  );
  const seconds = (Date.now() - started) / 1000;
  const verified = JSON.parse(out.join("\n")) as Verified;
  assert.equal(verified.tables.length, 300);
  assert.equal(Object.values(verified.verdicts).filter((v) => v.status === "confirmed").length, 300, "every ref_id -> t_1.id join confirmed");
  assert.equal(Object.values(verified.verdicts).filter((v) => v.status === "rejected").length, 20, "every generated table is alive, so dead_table is rejected");
  assert.equal(verified.fitsInContext, false, "300 tables do not fit in an agent's context");
  assert.equal(readdirSync(join(cwd, "context", "tables")).length, 300, "every relation gets a file from a two-file model reply");
  assert.ok(seconds < 90, `took ${seconds.toFixed(1)}s`);
});
