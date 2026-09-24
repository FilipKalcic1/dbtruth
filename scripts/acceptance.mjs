// Scores the tasks of BUILD_PLAN.md as its section 4 describes: runs the checks in
// acceptance/checks.json, counts the manual items in acceptance/manual.json, and
// prints one line per check, a score per task and, without --task, the overall score.
//
//   npm run acceptance -- --task T1.1     one task
//   npm run acceptance                    every task in the plan's overview table
//   --checks <path>, --manual <path>      other files, relative to the repository root
//
// Every entry names its task, its id (A1 for an acceptance item) and its part:
// acceptance, tests, gates, docs or invariants. A check takes one of two forms:
//
//   { "cmd": "npm run verify", "timeoutSeconds": 600,
//     "expectExit": 0, "expectStdout": "regex", "expectStderr": "regex" }
//     Runs through a shell from the repository root: cmd.exe on Windows, sh elsewhere,
//     so double quotes only, no single quotes and no environment variables. expectExit
//     defaults to 0. A command that runs past timeoutSeconds is killed with its whole
//     process tree and fails. A command repeated with the same timeout runs once per
//     invocation.
//   { "file": "README.md", "expectFile": "regex" }
//     Reads the file, for documentation checks (grep is not portable).
//
// Regexes take the m flag, so ^ and $ match at line ends, LF or CRLF. A manual item is
// { task, id, part, item, evidence } and passes only once its evidence is written. Its
// part is acceptance, for an A-item no command can judge, or tests, for the sabotage
// record of section 4.5: until that is written the tests part earns nothing, and the
// part's checks alone split its points.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Section 4.2: a part's weight is split evenly over its checks, and a failing gate or invariant caps the task.
const WEIGHTS = { acceptance: 50, tests: 20, gates: 15, docs: 10, invariants: 5 };
const GATE_CAP = 40;

const Regex = z.string().transform((source) => new RegExp(source, "m"));
const common = { task: z.string(), id: z.string(), part: z.enum(Object.keys(WEIGHTS)) };
const Check = z.union([
  z.strictObject({
    ...common,
    cmd: z.string(),
    timeoutSeconds: z.number().positive(),
    expectExit: z.int().default(0),
    expectStdout: Regex.optional(),
    expectStderr: Regex.optional(),
  }),
  z.strictObject({ ...common, file: z.string(), expectFile: Regex }),
]);
// Gates and invariants are earned by commands only, so no evidence can pass them.
const Manual = z.strictObject({ ...common, part: z.enum(["acceptance", "tests"]), item: z.string(), evidence: z.string() });

/**
 * The score of one task from the results of its checks and manual items, floored so that
 * a task that lost anything never shows 100.
 * @param {{ part: string, pass: boolean, evidence?: string }[]} results
 */
export function score(results) {
  // Section 4.5: the sabotage record, a manual item of the tests part, is not a share of the
  // test points but their condition.
  const isRecord = (r) => r.part === "tests" && r.evidence !== undefined;
  const recorded = results.filter(isRecord).every((r) => r.pass);
  // Added up as one fraction num/den: thirds added in floating point can fall just below a
  // whole number, and the floor would then take a point.
  let num = 0;
  let den = 1;
  for (const [part, weight] of Object.entries(WEIGHTS)) {
    const own = results.filter((r) => r.part === part && !isRecord(r));
    if (own.length === 0) continue;
    const points = part === "tests" && !recorded ? 0 : weight;
    num = num * own.length + points * own.filter((r) => r.pass).length * den;
    den *= own.length;
  }
  const gateFailed = results.some((r) => (r.part === "gates" || r.part === "invariants") && !r.pass);
  return Math.floor(gateFailed ? Math.min(num / den, GATE_CAP) : num / den);
}

async function main() {
  const { values } = parseArgs({
    options: {
      task: { type: "string" },
      checks: { type: "string", default: "acceptance/checks.json" },
      manual: { type: "string", default: "acceptance/manual.json" },
    },
  });
  const entries = [...load(values.checks, Check), ...load(values.manual, Manual)];
  const tasks = values.task ? [values.task] : planTasks();

  const scores = [];
  for (const task of tasks) {
    const results = [];
    for (const entry of entries.filter((e) => e.task === task)) {
      const r = { ...entry, ...(await judge(entry)) };
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.task} ${r.id} ${r.part}${r.pass ? "" : `: ${r.reason}`}`);
      if (!r.pass && r.output) {
        for (const line of r.output.trimEnd().split("\n").slice(0, 20)) console.log(`  ${line}`);
        // The first lines of a long command, such as npm run verify, are its preamble; the failure is further down.
        const saved = join(mkdtempSync(join(tmpdir(), "dbtruth-acceptance-")), `${r.task}-${r.id}.txt`);
        writeFileSync(saved, r.output);
        console.log(`  full output: ${saved}`);
      }
      results.push(r);
    }
    scores.push(score(results));
    console.log(`${task}: ${scores.at(-1)}/100${results.length === 0 ? " (no checks)" : ""}`);
  }
  if (!values.task) console.log(`overall: ${Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length)}/100 over ${tasks.length} tasks`);
  return scores.every((s) => s === 100) ? 0 : 1;
}

/** Every failure, whether the file cannot be read, is not JSON or breaks the schema, names the file. */
function load(path, schema) {
  try {
    return z.array(schema).parse(JSON.parse(readFileSync(resolve(ROOT, path), "utf8")));
  } catch (e) {
    throw new Error(`${path}: ${e instanceof z.ZodError ? z.prettifyError(e) : e.message}`);
  }
}

/** The overview table in section 6 of BUILD_PLAN.md is the list of tasks; a priority of exactly HUMAN is left out. */
function planTasks() {
  const rows = readFileSync(resolve(ROOT, "BUILD_PLAN.md"), "utf8").matchAll(/^\| (T\d+\.\d+) \|.*\| (.+?) \|$/gm);
  return [...rows].filter(([, , priority]) => priority !== "HUMAN").map(([, id]) => id);
}

// One run per command and timeout, because npm run verify is the gate of every task. A check
// with another timeout gets its own run, so it is never judged on one killed at another limit.
const runs = new Map();

/** A manual item passes by its evidence, a file check by the file's text, a command check by its run. */
async function judge(entry) {
  if (entry.evidence !== undefined) return entry.evidence.trim() ? { pass: true } : { pass: false, reason: `no evidence for: ${entry.item}` };
  if (entry.file !== undefined) {
    let text;
    try {
      text = readFileSync(resolve(ROOT, entry.file), "utf8");
    } catch (e) {
      return { pass: false, reason: e.message };
    }
    return entry.expectFile.test(text) ? { pass: true } : { pass: false, reason: `${entry.file} does not match ${entry.expectFile}` };
  }
  const key = `${entry.timeoutSeconds} ${entry.cmd}`;
  if (!runs.has(key)) runs.set(key, execute(entry.cmd, entry.timeoutSeconds));
  const r = await runs.get(key);
  const reason =
    r.timedOut ? `timed out after ${entry.timeoutSeconds}s${r.killFailure && `, and the kill failed: ${r.killFailure}`}`
    : r.code !== entry.expectExit ? `exit ${r.code}, expected ${entry.expectExit}`
    : entry.expectStdout && !entry.expectStdout.test(r.stdout) ? `stdout does not match ${entry.expectStdout}`
    : entry.expectStderr && !entry.expectStderr.test(r.stderr) ? `stderr does not match ${entry.expectStderr}`
    : undefined;
  return { pass: reason === undefined, reason, output: r.output };
}

/** Resolves once the command has exited and its output is closed, or at its timeout once its tree is killed. */
function execute(cmd, timeoutSeconds) {
  return new Promise((done) => {
    // Detached on POSIX so the command leads its own process group, which is killed as a whole.
    const child = spawn(cmd, { cwd: ROOT, shell: true, detached: process.platform !== "win32" });
    const chunks = { stdout: [], stderr: [], output: [] };
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", (chunk) => {
        chunks[stream].push(chunk);
        chunks.output.push(chunk);
      });
    }
    let timedOut = false;
    let killFailure = "";
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") {
        const kill = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { encoding: "utf8" });
        if (kill.status !== 0) killFailure = kill.stderr.trim();
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (e) {
          killFailure = e.message;
        }
      }
      // A process the kill cannot find, started detached or orphaned by an exited shell, can
      // still hold the output; the run stops reading it rather than wait for that process.
      child.stdout.destroy();
      child.stderr.destroy();
    }, timeoutSeconds * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = (list) => Buffer.concat(list).toString("utf8");
      done({ code, timedOut, killFailure, stdout: text(chunks.stdout), stderr: text(chunks.stderr), output: text(chunks.output) });
    });
  });
}

// Run only when invoked as a script, so the tests can import score() without side effects.
const invokedAs = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invokedAs === realpathSync(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`acceptance: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    },
  );
}
