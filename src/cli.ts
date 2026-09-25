#!/usr/bin/env node
// cli.ts: orchestrates one run, or one check, in order, writes the .env `init` starts a project with, hands `doctor`
// to doctor.ts, and `mcp` to mcp.ts with the settings it opens a connection with. Nothing else.

import { Command, Option, type OptionValues } from "commander";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { FAIL_ON, fails, remeasure, reportLines, reportMarkdown, type FailOn } from "./check.js";
import { EFFORT_ENV, EFFORT_FLAG, effortFor, resolveConfig, overridable, type Config, type Overrides } from "./config.js";
import { contextualize } from "./contextualize.js";
import { doctor } from "./doctor.js";
import { extract, fitToContext, integerKeys, readCatalog } from "./extract.js";
import { serve } from "./mcp.js";
import { createModel, DEFAULT_MODEL, type Transport } from "./model.js";
import { connect, readSettings, repositoryRoot, resolveDatabaseUrl } from "./safety.js";
import type { Verified } from "./schemas.js";
import { readSnapshot, serialize, toSnapshot } from "./snapshot.js";
import { assemble, describeKinds, EXIT_FAILURE, EXIT_FINDINGS, EXIT_OK, exitCode } from "./verdict.js";
import { verify } from "./verify.js";
import { OUTPUT_DIR, persist, SNAPSHOT_FILE, write } from "./write.js";

// package.json is one level up from both src/ under tsx and dist/ once installed.
const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
const SNAPSHOT = `${OUTPUT_DIR}/${SNAPSHOT_FILE}`;

export type RunOptions = {
  url?: string;
  /** The settings file to read instead of looking for .env, relative to cwd. */
  dotenv?: string;
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
  // 1. The settings, the tunables and the database URL.
  const found = setup(opts);
  if (!found) return EXIT_FAILURE;
  const { env, cfg, url } = found;

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
  const db = await connect(url, { ...cfg, warn: (message) => opts.err(`WARNING: ${message}`) });
  try {
    // 3. The catalog and the server's version, outside the budget; then extract, and trim to what the model can take.
    const catalog = await readCatalog(db);
    const version = await db.catalog("SELECT current_setting('server_version_num')::int AS num");
    if (!version.ok) throw new Error(`could not read the server version: ${version.message}`);
    const serverVersionNum = Number(version.rows[0]!.num);
    const raw = await extract(db, cfg, catalog, { samples: opts.samples, reveal: new Set(opts.reveal) });
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
    const measurements = await verify(db, cfg, extracted, claims, () => integerKeys(db, cfg, catalog));
    const verified = assemble(extracted, claims, measurements, cfg);
    const t2 = performance.now();
    opts.err(`verify: ${measurements.length} measurements, ${seconds(t2 - t1)}`);
    const { files, reduced: withheld } = await write(ai, verified, cfg, { effort });
    const modelMs = { contextualize: t1 - t0, write: performance.now() - t2 };
    opts.err(`write: ${Object.keys(files).length} files, ${seconds(modelMs.write)}${withheld ? `; ${withheld}` : ""}`);

    // 8. Write the files and the snapshot, print the summary, exit. The snapshot lists every relation of the catalog.
    const snapshot = serialize(toSnapshot(verified, catalog, cfg, { toolVersion: VERSION, serverVersionNum }));
    const saved = persist(opts.cwd, { ...files, [SNAPSHOT]: snapshot });
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

export type CheckOptions = {
  url?: string;
  /** The settings file to read instead of looking for .env, relative to cwd. */
  dotenv?: string;
  /** The snapshot to check, relative to cwd. */
  snapshot: string;
  failOn: FailOn;
  /** The report as JSON on out, and nothing else there. */
  json: boolean;
  /** The comment file, relative to cwd. */
  markdown?: string;
  flags: Overrides;
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * Measures again what the snapshot claims, with no model: 0 when it passes under failOn, 2 when it fails, 1 when it
 * cannot run or cannot write the comment it was asked for.
 */
export async function runCheck(opts: CheckOptions): Promise<number> {
  const found = setup(opts);
  if (!found) return EXIT_FAILURE;
  // Read and checked before anything connects.
  const snapshot = readSnapshot(opts.cwd, opts.snapshot);
  if (typeof snapshot === "string") {
    opts.err(snapshot);
    return EXIT_FAILURE;
  }
  const db = await connect(found.url, { ...found.cfg, warn: (message) => opts.err(`WARNING: ${message}`) });
  try {
    const report = await remeasure(db, found.cfg, snapshot);
    for (const line of reportLines(report)) opts.err(line);
    // The comment first: a check that cannot write it has not done what it was asked, and prints no JSON.
    if (opts.markdown !== undefined) {
      const comment = reportMarkdown(report);
      try {
        writeFileSync(resolve(opts.cwd, opts.markdown), comment);
      } catch (e) {
        opts.err(`could not write ${opts.markdown}: ${e instanceof Error ? e.message : String(e)}`);
        return EXIT_FAILURE;
      }
    }
    if (opts.json) opts.out(JSON.stringify(report, null, 2));
    return fails(report, opts.failOn) ? EXIT_FINDINGS : EXIT_OK;
  } finally {
    await db.close();
  }
}

export type McpOptions = Pick<RunOptions, "url" | "dotenv" | "flags" | "cwd" | "env" | "err"> & {
  /** The directory whose context/ the tools read and whose .env is looked for first, relative to cwd. */
  project?: string;
};

/**
 * Serves the MCP tools on stdin and stdout until the client closes stdin or the process is stopped: 0, or 1 when
 * --project names no directory. The project is --project, else CLAUDE_PROJECT_DIR, which Claude Code sets for the
 * servers it starts, else cwd. The settings are read, and the connection opened, when a tool first needs the database,
 * and again after a call that failed.
 */
export async function runMcp(opts: McpOptions): Promise<number> {
  const project = resolve(opts.cwd, opts.project ?? opts.env.CLAUDE_PROJECT_DIR ?? ".");
  if (opts.project !== undefined && !statSync(project, { throwIfNoEntry: false })?.isDirectory()) {
    opts.err(`--project ${opts.project}: no such directory`);
    return EXIT_FAILURE;
  }
  const open = async () => {
    // Printed as for any command, and when no settings are found, the failed call's answer too.
    const lines: string[] = [];
    const found = setup({
      ...opts,
      cwd: project,
      err: (line) => {
        lines.push(line);
        opts.err(line);
      },
    });
    if (!found) throw new Error(lines.join("\n"));
    return { db: await connect(found.url, { ...found.cfg, warn: (message) => opts.err(`WARNING: ${message}`) }), cfg: found.cfg };
  };
  await serve({ project, version: VERSION, open, err: opts.err });
  return EXIT_OK;
}

/**
 * The .env init writes: the quick start's two settings and the model, each commented out, so that nothing in it is read
 * until a line is filled in. Every comment is a line of its own, since a value runs to the end of its line.
 */
const DOTENV = [
  "# Settings for dbtruth. Remove the # before each setting you use.",
  "# A value runs to the end of its line, so a comment goes on a line of its own.",
  "# DATABASE_URL=postgres://user:password@host:5432/dbname",
  "# ANTHROPIC_API_KEY=sk-ant-...",
  `# ANTHROPIC_MODEL=${DEFAULT_MODEL}`,
  "",
].join("\n");

/** What init prints last, word for word as README.md's quick start shows it; test/init.test.ts holds the two equal. */
const NEXT_STEPS = [
  "next steps:",
  "  fill in .env",
  "  run npx dbtruth doctor",
  "  run npx dbtruth",
  "  add this line to CLAUDE.md: Before writing SQL against this database, read `context/README.md` and the file in `context/tables/` for every table you touch.",
  "  add the MCP server to Claude Code: claude mcp add --transport stdio dbtruth -- npx -y dbtruth mcp",
];

export type InitOptions = {
  cwd: string;
  err: (line: string) => void;
};

/**
 * Writes DOTENV at the repository root, or in cwd outside a repository, unless a .env is there, then says whether
 * .gitignore ignores it and what to do next. It changes no file that exists. 0 when done, 1 when it could not write.
 */
export function runInit(opts: InitOptions): number {
  const here = realpathSync(opts.cwd);
  const dir = repositoryRoot(here) ?? here;
  const path = join(dir, ".env");
  // Both named relative to cwd as given, as a run names the settings file it reads.
  const file = relative(opts.cwd, path);
  const gitignore = relative(opts.cwd, join(dir, ".gitignore"));
  if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
    opts.err(`${file} already exists; left as it is`);
  } else {
    try {
      // wx never opens what is there: a file that appeared since, or a directory of that name, fails instead.
      writeFileSync(path, DOTENV, { flag: "wx" });
    } catch (e) {
      opts.err(`could not write ${file}: ${e instanceof Error ? e.message : String(e)}`);
      return EXIT_FAILURE;
    }
    opts.err(`wrote ${file}`);
  }
  // Git judges the patterns in .gitignore: 0 ignored, 1 not, anything else no answer (git not found, no repository, or
  // one it refuses). The user's own ignore file is left out, since it covers no one else's clone, and --no-index judges
  // the patterns alone, so a .env already tracked is not reported as missing a line .gitignore has. Git is started
  // outside the repository and pointed at it with -C: Windows looks for a command in the working directory first.
  const git = spawnSync("git", ["-C", dir, "-c", "core.excludesFile=", "check-ignore", "--quiet", "--no-index", ".env"], { cwd: tmpdir() });
  if (git.status === 1) opts.err(`WARNING: ${gitignore} does not ignore ${file}; add this line to it: .env`);
  else if (git.status !== 0) opts.err(`WARNING: git could not say whether ${gitignore} ignores ${file}; if it does not, add this line to it: .env`);
  for (const line of NEXT_STEPS) opts.err(line);
  return EXIT_OK;
}

/**
 * DATABASE_URL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and DBTRUTH_* from the environment, else from the settings file:
 * --dotenv, or the .env nearest to cwd up to the repository root. Undefined once it has said why a run cannot start.
 */
function setup(opts: Pick<RunOptions, "url" | "dotenv" | "flags" | "cwd" | "env" | "err">): { env: Record<string, string | undefined>; cfg: Config; url: string } | undefined {
  const settings = readSettings(opts.cwd, opts.dotenv, opts.env, opts.err);
  if (typeof settings === "string") {
    opts.err(settings);
    return undefined;
  }
  if (settings.elsewhere) opts.err(`reading settings from ${settings.file}`);
  const cfg = resolveConfig(settings.env, opts.flags);
  const url = resolveDatabaseUrl(opts.url, settings.env);
  if (!url) {
    for (const line of noDatabaseUrl(settings.file, settings.searched)) opts.err(line);
    return undefined;
  }
  return { env: settings.env, cfg, url };
}

/** Where DATABASE_URL was looked for, then one way to set it per line. */
function noDatabaseUrl(file: string | undefined, searched: { dir: string }[]): string[] {
  return [
    `no database URL: DATABASE_URL is not in the environment or in ${file ?? "a .env"}`,
    ...searched.map(({ dir }) => `  searched ${dir}`),
    "set it to postgres://user:password@host:5432/dbname in one of these ways:",
    `  in ${file ?? "a .env in one of those directories"}`,
    "  in the environment",
    "  with --url",
    "  in a file elsewhere, read with --dotenv <path>",
  ];
}

function summary(v: Verified, fileCount: number, spentMs: number, modelMs: { contextualize: number; write: number }): string[] {
  const count = (prefix: string, status: string) => Object.entries(v.verdicts).filter(([id, x]) => id.startsWith(prefix) && x.status === status).length;
  const rel = (s: string) => count("relationship:", s);
  const sus = (s: string) => count("suspicion:", s);
  // Confirmed, and matched as well by other keys: the match alone proves nothing.
  const weak = Object.entries(v.verdicts).filter(([id, x]) => id.startsWith("relationship:") && x.status === "confirmed" && (x.measurement.numbers.alsoFits ?? 0) > 0).length;
  const broken = Object.entries(v.verdicts)
    .filter(([id, x]) => id.startsWith("relationship:") && x.status === "broken")
    .map(([id, x]) => `  ${id.slice("relationship:".length)}  hit rate ${(x.measurement.numbers.hit! * 100).toFixed(1)}%`);
  return [
    `dbtruth: ${v.database}`,
    `relations: ${v.relations}${v.fitsInContext ? " (fits in an agent's context)" : ""}`,
    `relationships: ${rel("confirmed")} confirmed${weak > 0 ? ` (${weak} on weak evidence)` : ""}, ${rel("broken")} broken, ${rel("rejected")} rejected, ${rel("unverifiable")} unverifiable, ${rel("empty")} empty`,
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
  const out = (line: string) => process.stdout.write(line + "\n");
  const err = (line: string) => process.stderr.write(line + "\n");
  // Set by the action commander runs; --help and --version exit before any does.
  let code = EXIT_FAILURE;
  const program = new Command()
    .name("dbtruth")
    .description("Verified database context for AI coding agents. Read-only, Postgres.")
    .version(VERSION, "-v, --version")
    // Options after a subcommand's name are its own, so doctor's --url is not taken for the full run's.
    .enablePositionalOptions()
    .option("--url <url>", "database URL (else DATABASE_URL, else .env)")
    .option("--dotenv <path>", "read settings from this file instead of the nearest .env up to the repository root")
    .option("--reveal <table.column>", "show one hidden column's values to the model (repeatable)", collect)
    .option("--no-samples", "send schema and statistics only, no sample rows")
    .option("--json", "print the Verified object as JSON to stdout")
    .option(`--${EFFORT_FLAG} <level>`, `auto, low, medium, high, xhigh or max (env ${EFFORT_ENV})`);
  for (const o of overridable) program.option(`--${o.flag} <number>`, `override config (env ${o.env})`);
  program.action(async (o) => {
    code = await run({
      url: o.url,
      dotenv: o.dotenv,
      samples: o.samples !== false,
      reveal: o.reveal ?? [],
      json: Boolean(o.json),
      flags: overrides(o),
      cwd: process.cwd(),
      env: process.env,
      out,
      err,
    });
  });
  program
    .command("doctor")
    .description("check what a full run needs, one line per check, without spending a token")
    .option("--url <url>", "database URL (else DATABASE_URL, else .env)")
    .option("--dotenv <path>", "read settings from this file instead of the nearest .env up to the repository root")
    .action(async (own) => {
      // Options before `doctor` are the program's, and would otherwise be dropped; its own, after its name, win.
      const o = { ...program.opts(), ...own };
      const ready = await doctor({ url: o.url, dotenv: o.dotenv, flags: overrides(o), cwd: process.cwd(), env: process.env, node: process.version, err });
      code = ready ? EXIT_OK : EXIT_FAILURE;
    });
  program
    .command("init")
    .description("write a .env to fill in at the repository root, and print the next steps")
    .action(() => {
      code = runInit({ cwd: process.cwd(), err });
    });
  const check = program
    .command("check")
    .description("measure again what context/snapshot.json claims, without a model or an API key")
    .option("--snapshot <path>", "the snapshot to check, relative to the current directory", SNAPSHOT)
    .addOption(new Option("--fail-on <when>", "exit 2 on a regression or a stale item, on any change, or never").choices(FAIL_ON).default("regression"))
    .option("--json", "print the report as JSON to stdout")
    .option("--markdown <path>", "write the report as a pull request comment to this file, relative to the current directory")
    .option("--url <url>", "database URL (else DATABASE_URL, else .env)")
    .option("--dotenv <path>", "read settings from this file instead of the nearest .env up to the repository root");
  for (const o of overridable) check.option(`--${o.flag} <number>`, `override config (env ${o.env})`);
  check.action(async (own) => {
    // As for doctor: the program's options before `check`, and its own after the name, which win.
    const o = { ...program.opts(), ...own };
    code = await runCheck({
      url: o.url,
      dotenv: o.dotenv,
      snapshot: o.snapshot,
      failOn: o.failOn,
      json: Boolean(o.json),
      markdown: o.markdown,
      flags: overrides(o),
      cwd: process.cwd(),
      env: process.env,
      out,
      err,
    });
  });
  const mcp = program
    .command("mcp")
    .description("serve context/ and measurements to an agent over MCP on stdin and stdout, without a model or an API key")
    .option("--project <dir>", "the directory whose context/ the tools read and whose .env is looked for first (default: CLAUDE_PROJECT_DIR, else the current directory)")
    .option("--url <url>", "database URL (else DATABASE_URL, else .env)")
    .option("--dotenv <path>", "read settings from this file instead of the nearest .env up to the repository root, relative to the project directory");
  for (const o of overridable) mcp.option(`--${o.flag} <number>`, `override config (env ${o.env})`);
  mcp.action(async (own) => {
    // As for check: the program's options before `mcp`, and its own after the name, which win. stdout is the protocol's.
    const o = { ...program.opts(), ...own };
    code = await runMcp({ url: o.url, dotenv: o.dotenv, project: o.project, flags: overrides(o), cwd: process.cwd(), env: process.env, err });
  });
  try {
    await program.parseAsync(argv);
  } catch (e) {
    err(`dbtruth: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_FAILURE;
  }
  return code;
}

/** The tunables given as flags, keyed as resolveConfig takes them. */
function overrides(o: OptionValues): Overrides {
  const flags: Overrides = {};
  for (const item of overridable) {
    const v = o[camel(item.flag)];
    if (v !== undefined) flags[item.path] = String(v);
  }
  if (o[camel(EFFORT_FLAG)] !== undefined) flags.modelEffort = String(o[camel(EFFORT_FLAG)]);
  return flags;
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
