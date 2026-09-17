#!/usr/bin/env node
// cli.ts: orchestrates one run, in order. Nothing else.

import { Command } from "commander";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { EFFORT_ENV, EFFORT_FLAG, effortFor, resolveConfig, overridable, type Overrides } from "./config.js";
import { contextualize } from "./contextualize.js";
import { extract, fitToContext } from "./extract.js";
import { createModel, DEFAULT_MODEL, type Transport } from "./model.js";
import { connect, readDotEnv, resolveDatabaseUrl } from "./safety.js";
import type { Verified } from "./schemas.js";
import { assemble, describeKinds, EXIT_FAILURE, exitCode } from "./verdict.js";
import { verify } from "./verify.js";
import { OUTPUT_DIR, persist, write } from "./write.js";

export type RunOptions = {
  url?: string;
  samples: boolean;
  reveal: string[];
  json: boolean;
  flags: Overrides;
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
};

export type RunDeps = {
  /** Test hook: replaces the API transport so the loop runs without the network. */
  transport?: Transport;
};

export async function run(opts: RunOptions, deps: RunDeps = {}): Promise<number> {
  // 1. DATABASE_URL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and DBTRUTH_* from the environment, else from .env in cwd.
  const env = { ...readDotEnv(opts.cwd), ...opts.env };
  const cfg = resolveConfig(env, opts.flags);
  const url = resolveDatabaseUrl(opts.url, env);
  if (!url) {
    opts.err("no database URL: set DATABASE_URL, put it in .env, or pass --url");
    return EXIT_FAILURE;
  }

  // 1. Prove the API is reachable with this key and model before touching the database. Sends only the model id.
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const ai = createModel({
    rawDir: join(opts.cwd, OUTPUT_DIR),
    model,
    maxOutputTokens: cfg.modelMaxOutputTokens,
    ...(env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : {}),
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  await ai.preflight();

  // 2. Connect through safety, prove read-only.
  const db = await connect(url, { ...cfg, warn: opts.err });
  try {
    // 3. Extract, then trim to what the model can take.
    const raw = await extract(db, cfg, { samples: opts.samples, reveal: new Set(opts.reveal) });
    for (const miss of raw.unmatchedReveal) opts.err(`--reveal ${miss}: no such column, nothing revealed`);
    const { extract: extracted, reduced } = fitToContext(raw, cfg);
    const effort = effortFor(extracted.schemaTokens, cfg);

    // 4. Disclosure, before the first call that carries data. Human-facing lines go to stderr so --json stays clean.
    opts.err(
      `Sending to ${model} at effort ${effort}${cfg.modelEffort === "auto" ? ` (by schema size, ${extracted.schemaTokens} tokens)` : ""}: ` +
        `${extracted.tables.length} relations (${describeKinds(extracted.tables)})` +
        (extracted.skipped.length ? ` (${extracted.skipped.length} skipped)` : "") +
        `, schema and per-column statistics, ` +
        (opts.samples
          ? `${cfg.sampleRowsShown} sample rows per table with high-cardinality columns hidden (--no-samples off, --reveal: ${opts.reveal.length ? opts.reveal.join(", ") : "none"})`
          : `no sample rows (--no-samples on, --reveal ignored)`) +
        (reduced ? `; ${reduced}` : "") +
        `. Nothing else leaves this machine.`,
    );

    // 5. Contextualize. 6. Verify. 7. Write. One progress line each, so a person can see it working.
    const t0 = performance.now();
    const claims = await contextualize(ai, extracted, { effort });
    const t1 = performance.now();
    opts.err(`contextualize: ${claims.tables.length} tables described, ${claims.relationships.length + claims.suspicions.length} claims to test, ${seconds(t1 - t0)}`);
    const measurements = await verify(db, cfg, extracted, claims);
    const verified = assemble(extracted, claims, measurements, cfg);
    const t2 = performance.now();
    opts.err(`verify: ${measurements.length} measurements, ${seconds(t2 - t1)}`);
    const files = await write(ai, verified, { effort });
    const modelMs = { contextualize: t1 - t0, write: performance.now() - t2 };
    opts.err(`write: ${Object.keys(files).length} files, ${seconds(modelMs.write)}`);

    // 8. Write files, print the summary, exit.
    const saved = persist(opts.cwd, files);
    for (const f of saved.failed) opts.err(`could not write ${f.path}: ${f.error}`);
    if (opts.json) opts.out(JSON.stringify(verified, null, 2));
    for (const line of summary(verified, saved.written.length, db.budget().spentMs, modelMs)) opts.err(line);
    const used = ai.usage();
    if (used.inputTokens > 0) opts.err(`tokens: ${used.inputTokens} in, ${used.outputTokens} out, ${used.calls} calls`);
    if (used.effortDropped) opts.err(`note: ${model} did not accept the effort parameter; the calls ran at its default effort`);
    return exitCode(verified);
  } finally {
    await db.close();
  }
}

function summary(v: Verified, fileCount: number, spentMs: number, modelMs: { contextualize: number; write: number }): string[] {
  const count = (prefix: string, status: string) => Object.entries(v.verdicts).filter(([id, x]) => id.startsWith(prefix) && x.status === status).length;
  const rel = (s: string) => count("relationship:", s);
  const sus = (s: string) => count("suspicion:", s);
  const broken = Object.entries(v.verdicts)
    .filter(([id, x]) => id.startsWith("relationship:") && x.status === "broken")
    .map(([id, x]) => `  ${id.slice("relationship:".length)}  hit rate ${(x.measurement.numbers.hit! * 100).toFixed(1)}%`);
  return [
    `dbtruth: ${v.database}`,
    `relations: ${v.relations}${v.fitsInContext ? " (fits in an agent's context)" : ""}`,
    `relationships: ${rel("confirmed")} confirmed, ${rel("broken")} broken, ${rel("rejected")} rejected, ${rel("unverifiable")} unverifiable, ${rel("empty")} empty`,
    ...broken,
    `suspicions: ${sus("confirmed")} confirmed, ${sus("rejected")} rejected, ${sus("unverifiable")} unverifiable, ${sus("empty")} empty`,
    ...emptyClaims(v),
    `entities: ${v.claims.entities.length}, questions for a human: ${v.claims.questions.length}`,
    `files written: ${fileCount} under ./${OUTPUT_DIR}/`,
    `database time: ${seconds(spentMs)}, model time: ${seconds(modelMs.contextualize + modelMs.write)} (contextualize ${seconds(modelMs.contextualize)}, write ${seconds(modelMs.write)})`,
  ];
}

function emptyClaims(v: Verified): string[] {
  const reasons = new Map<string, number>();
  for (const verdict of Object.values(v.verdicts)) {
    if (verdict.status !== "empty") continue;
    const reason = verdict.skipped ?? "no reason given";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const total = [...reasons.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const ranked = [...reasons].sort(([, a], [, b]) => b - a);
  const shown = ranked.slice(0, 3).map(([reason, n]) => `${n} ${reason}`);
  const rest = ranked.slice(3);
  if (rest.length > 0) shown.push(`${rest.reduce((sum, [, n]) => sum + n, 0)} for ${rest.length} other reasons`);
  return [`empty: ${total} claim${total === 1 ? "" : "s"} with nothing to measure (${shown.join("; ")})`];
}

export async function main(argv: string[]): Promise<number> {
  const program = new Command()
    .name("dbtruth")
    .description("Verified database context for AI coding agents. Read-only, Postgres.")
    .option("--url <url>", "database URL (else DATABASE_URL, else .env)")
    .option("--reveal <table.column>", "show one hidden column's values to the model (repeatable)", collect)
    .option("--no-samples", "send schema and statistics only, no sample rows")
    .option("--json", "print the Verified object as JSON to stdout")
    .option(`--${EFFORT_FLAG} <level>`, `auto, low, medium, high, xhigh or max (env ${EFFORT_ENV})`);
  for (const o of overridable) program.option(`--${o.flag} <number>`, `override config (env ${o.env})`);
  program.parse(argv);
  const o = program.opts();
  const flags: Overrides = {};
  for (const item of overridable) {
    const v = o[camel(item.flag)];
    if (v !== undefined) flags[item.path] = String(v);
  }
  if (o[camel(EFFORT_FLAG)] !== undefined) flags.modelEffort = String(o[camel(EFFORT_FLAG)]);
  try {
    return await run({
      url: o.url,
      samples: o.samples !== false,
      reveal: o.reveal ?? [],
      json: Boolean(o.json),
      flags,
      cwd: process.cwd(),
      env: process.env,
      out: (line) => process.stdout.write(line + "\n"),
      err: (line) => process.stderr.write(line + "\n"),
    });
  } catch (e) {
    process.stderr.write(`dbtruth: ${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT_FAILURE;
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function camel(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Run only when invoked as the entry point, so tests can import run() without side effects.
const invokedAs = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invokedAs && invokedAs === realpathSync(fileURLToPath(import.meta.url))) {
  // Exit only once stdout has drained: a large --json reply piped to another process would otherwise be cut off.
  main(process.argv).then((code) => process.stdout.write("", () => process.exit(code)));
}
