import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { score } from "../scripts/acceptance.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/acceptance.mjs", import.meta.url));
const PASSES = "node --version";
const PARTS = ["acceptance", "tests", "gates", "docs", "invariants"];

/** Runs the scoring script on temporary checks and manual files, the way `npm run acceptance` runs it. */
function acceptance(checks: object[], manual: object[], args: string[], dir = mkdtempSync(join(tmpdir(), "dbtruth-acceptance-"))) {
  writeFileSync(join(dir, "checks.json"), JSON.stringify(checks));
  writeFileSync(join(dir, "manual.json"), JSON.stringify(manual));
  return spawnSync(process.execPath, [SCRIPT, "--checks", join(dir, "checks.json"), "--manual", join(dir, "manual.json"), ...args], { encoding: "utf8" });
}

test("one passing and one failing check: the score is below 100 and the output names the failing check", () => {
  const r = acceptance(
    [
      { task: "T9.1", id: "A1", part: "acceptance", cmd: 'node -e "console.log(42)"', expectStdout: "^42$", timeoutSeconds: 30 },
      { task: "T9.1", id: "A2", part: "acceptance", cmd: 'node -e "for (let i = 1; i < 31; i++) console.log(i); process.exitCode = 3"', timeoutSeconds: 30 },
      { task: "T9.1", id: "suite", part: "tests", cmd: PASSES, timeoutSeconds: 30 },
      { task: "T9.1", id: "verify", part: "gates", cmd: PASSES, timeoutSeconds: 30 },
      { task: "T9.1", id: "docs", part: "docs", cmd: PASSES, timeoutSeconds: 30 },
      { task: "T9.1", id: "structure", part: "invariants", cmd: PASSES, timeoutSeconds: 30 },
    ],
    [],
    ["--task", "T9.1"],
  );
  assert.match(r.stdout, /^PASS T9\.1 A1 acceptance$/m);
  assert.match(r.stdout, /^FAIL T9\.1 A2 acceptance: exit 3, expected 0$/m, "the failing check is named, with the reason");
  assert.match(r.stdout, /^ {2}20$/m, "the first 20 lines of its output follow");
  assert.doesNotMatch(r.stdout, /^ {2}21$/m, "and no more");
  const saved = /^ {2}full output: (.+)$/m.exec(r.stdout)?.[1];
  assert.ok(saved, "the whole output is kept, since a long command fails far below its first lines");
  assert.match(readFileSync(saved.trim(), "utf8"), /^30$/m);
  assert.match(r.stdout, /^T9\.1: 75\/100$/m, "half of the 50 acceptance points are lost");
  assert.equal(r.status, 1, "exit 0 only at 100");
});

test("a failing gate or invariant caps the score at 40", () => {
  const allBut = (failing: string) => PARTS.map((part) => ({ part, pass: part !== failing }));
  assert.equal(score(allBut("")), 100);
  assert.equal(score(allBut("gates")), 40, "85 without the cap");
  assert.equal(score(allBut("invariants")), 40, "95 without the cap");
  assert.equal(score(allBut("docs")), 90, "docs are not a gate");
  assert.equal(score([{ part: "gates", pass: false }, { part: "acceptance", pass: false }]), 0, "the cap is a ceiling, not a floor");
});

/** process.kill(pid, 0) sends nothing: it throws ESRCH once the process is gone. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw e;
  }
}

test("a check that hangs is killed with its whole process tree at its timeout, and fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dbtruth-acceptance-"));
  // The shell starts node, which starts a sleeping node and writes down its pid.
  writeFileSync(
    join(dir, "hang.mjs"),
    'import { spawn } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit" });\nwriteFileSync(new URL("hang.pid", import.meta.url), String(child.pid));\n',
  );
  const started = Date.now();
  const r = acceptance([{ task: "T9.1", id: "hang", part: "tests", cmd: `node "${join(dir, "hang.mjs")}"`, timeoutSeconds: 2 }], [], ["--task", "T9.1"], dir);
  const seconds = (Date.now() - started) / 1000;
  // The sleeper would end on its own after 60 s, and the pid check below would then pass without any kill.
  assert.ok(seconds < 20, `took ${seconds.toFixed(1)}s: the hanging command was waited out, not killed at its timeout`);
  assert.match(r.stdout, /^FAIL T9\.1 hang tests: timed out after 2s$/m);
  const pid = Number(readFileSync(join(dir, "hang.pid"), "utf8"));
  // Killed is not gone at once: under Linux the process is a zombie until its new parent reaps it, which can lag the
  // run by a moment (CI caught that once), and never happens in a container without an init (docker run --init).
  for (let waited = 0; alive(pid) && waited < 5_000; waited += 100) await delay(100);
  assert.equal(alive(pid), false, "the sleeping node, two levels down, was killed with the shell");
});

test("a process the kill cannot reach does not keep the run past the timeout", () => {
  const dir = mkdtempSync(join(tmpdir(), "dbtruth-acceptance-"));
  // Node starts a sleeping node outside its process tree, one that still holds the output, and exits at once.
  writeFileSync(
    join(dir, "escape.mjs"),
    'import { spawn } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit", detached: true });\nchild.unref();\nwriteFileSync(new URL("escape.pid", import.meta.url), String(child.pid));\n',
  );
  const started = Date.now();
  const r = acceptance([{ task: "T9.1", id: "escape", part: "tests", cmd: `node "${join(dir, "escape.mjs")}"`, timeoutSeconds: 2 }], [], ["--task", "T9.1"], dir);
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 20, `took ${seconds.toFixed(1)}s: the run waited for the process that outlived the command`);
  process.kill(Number(readFileSync(join(dir, "escape.pid"), "utf8")));
  assert.match(r.stdout, /^FAIL T9\.1 escape tests: timed out after 2s, and the kill failed: .+$/m, "the reason says that something may still run");
});

test("a task with no checks scores 0, not 100", () => {
  assert.equal(score([]), 0);
  const r = acceptance([], [], ["--task", "T9.1"]);
  assert.match(r.stdout, /^T9\.1: 0\/100 \(no checks\)$/m);
  assert.equal(r.status, 1);
});

test("each part's weight is split evenly over its checks, and a part with no checks earns nothing", () => {
  assert.equal(score([{ part: "acceptance", pass: true }]), 50);
  assert.equal(score([{ part: "docs", pass: true }, { part: "docs", pass: false }, { part: "acceptance", pass: true }]), 55);
  const manyTests = Array.from({ length: 41 }, (_, i) => ({ part: "tests", pass: i > 0 }));
  assert.equal(score([...PARTS.filter((p) => p !== "tests").map((part) => ({ part, pass: true })), ...manyTests]), 99, "one failure in 41 costs half a point, and still no 100");
  const thirds = (part: string) => [true, false, false].map((pass) => ({ part, pass }));
  assert.equal(score([{ part: "acceptance", pass: true }, ...thirds("tests"), { part: "gates", pass: true }, ...thirds("docs"), { part: "invariants", pass: true }]), 80, "20/3 + 10/3 is a whole 10");
});

test("without a written sabotage record the tests part earns nothing, and the record is not a share of it", () => {
  const checks = PARTS.map((part) => ({ task: "T9.1", id: part, part, cmd: PASSES, timeoutSeconds: 30 }));
  const record = { task: "T9.1", id: "sabotage", part: "tests", item: "the sabotage check" };
  assert.match(acceptance(checks, [{ ...record, evidence: "" }], ["--task", "T9.1"]).stdout, /^T9\.1: 80\/100$/m, "section 4.5: no record, no test points");
  assert.match(acceptance(checks, [{ ...record, evidence: "inverted the cap; the gate test failed; restored" }], ["--task", "T9.1"]).stdout, /^T9\.1: 100\/100$/m);
  const halfTests = [{ part: "tests", pass: false }, { part: "tests", pass: true, evidence: "written" }];
  assert.equal(score([...PARTS.map((part) => ({ part, pass: true })), ...halfTests]), 90, "the two test checks split the 20 points, one passing");
});

test("a manual item counts in its part and passes only with written evidence", () => {
  const r = acceptance(
    [],
    [
      { task: "T9.1", id: "A1", part: "acceptance", item: "a newcomer follows the quick start", evidence: "4 minutes, PROGRESS.md iteration 2" },
      { task: "T9.1", id: "A2", part: "acceptance", item: "the agent calls measure_join", evidence: " " },
    ],
    ["--task", "T9.1"],
  );
  assert.match(r.stdout, /^PASS T9\.1 A1 acceptance$/m);
  assert.match(r.stdout, /^FAIL T9\.1 A2 acceptance: no evidence for: the agent calls measure_join$/m);
  assert.match(r.stdout, /^T9\.1: 25\/100$/m);
});

test("a command repeated with the same timeout runs once per invocation, and each check judges the shared output", () => {
  const dir = mkdtempSync(join(tmpdir(), "dbtruth-acceptance-"));
  writeFileSync(join(dir, "count.mjs"), 'import { appendFileSync } from "node:fs";\nappendFileSync(new URL("runs.txt", import.meta.url), "run\\n");\nconsole.log("counted");\nconsole.error("on stderr");\n');
  const cmd = `node "${join(dir, "count.mjs")}"`;
  const r = acceptance(
    [
      { task: "T0.1", id: "A1", part: "acceptance", cmd, expectStdout: "^counted$", expectStderr: "^on stderr$", timeoutSeconds: 30 },
      { task: "T0.1", id: "A2", part: "acceptance", cmd, expectStdout: "^on stderr$", timeoutSeconds: 30 },
      { task: "T0.2", id: "A1", part: "acceptance", cmd, timeoutSeconds: 30 },
      { task: "T0.2", id: "A2", part: "acceptance", cmd, timeoutSeconds: 60 },
    ],
    [],
    [],
    dir,
  );
  assert.equal(readFileSync(join(dir, "runs.txt"), "utf8"), "run\nrun\n", "one run for three checks in two tasks, one for the check with its own timeout");
  assert.match(r.stdout, /^PASS T0\.1 A1 acceptance$/m);
  assert.match(r.stdout, /^FAIL T0\.1 A2 acceptance: stdout does not match \/\^on stderr\$\/m$/m, "stdout and stderr are judged apart");
  assert.match(r.stdout, /^PASS T0\.2 A1 acceptance$/m);
});

test("a docs check reads the file, and a missing file fails without stopping the run", () => {
  const r = acceptance(
    [
      { task: "T9.1", id: "gone", part: "docs", file: "NO_SUCH_FILE.md", expectFile: "anything" },
      { task: "T9.1", id: "license", part: "docs", file: "LICENSE", expectFile: "^MIT License$" },
    ],
    [],
    ["--task", "T9.1"],
  );
  assert.match(r.stdout, /^FAIL T9\.1 gone docs: .*no such file/m);
  assert.match(r.stdout, /^PASS T9\.1 license docs$/m);
  assert.match(r.stdout, /^T9\.1: 5\/100$/m);
});

test("without --task every task in the plan's overview is scored, HUMAN tasks are left out, and the overall is their mean", () => {
  const r = acceptance(PARTS.map((part) => ({ task: "T0.1", id: part, part, cmd: PASSES, timeoutSeconds: 30 })), [], []);
  const tasks = [...r.stdout.matchAll(/^(T\d+\.\d+): (\d+)\/100/gm)].map(([, id, points]) => ({ id, points: Number(points) }));
  assert.deepEqual(tasks.find((t) => t.id === "T0.1"), { id: "T0.1", points: 100 });
  assert.ok(tasks.some((t) => t.id === "T6.1"), "a task that is partly HUMAN is still scored");
  assert.ok(!tasks.some((t) => t.id === "T6.3"), "a HUMAN task is not");
  assert.match(r.stdout, new RegExp(`^overall: ${Math.floor(100 / tasks.length)}/100 over ${tasks.length} tasks$`, "m"));
  assert.equal(r.status, 1);
});

test("a malformed checks or manual file is refused before anything runs, naming the file", () => {
  const r = acceptance(
    [
      { task: "T9.1", id: "A1", part: "acceptance", cmd: PASSES, timeoutSeconds: 30 },
      { task: "T9.1", id: "A2", part: "acceptance", cmd: PASSES },
    ],
    [],
    ["--task", "T9.1"],
  );
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /checks\.json/);
  assert.match(r.stderr, /at \[1\]/, "the entry without a timeout is named");
  assert.equal(r.status, 1);

  const gate = acceptance([], [{ task: "T9.1", id: "verify", part: "gates", item: "npm run verify is green", evidence: "it was green yesterday" }], ["--task", "T9.1"]);
  assert.equal(gate.stdout, "");
  assert.match(gate.stderr, /manual\.json: .*\n.*at \[0\]\.part/, "no evidence can pass a gate");

  const regex = acceptance([{ task: "T9.1", id: "readme", part: "docs", file: "README.md", expectFile: "(" }], [], ["--task", "T9.1"]);
  assert.equal(regex.stdout, "");
  assert.match(regex.stderr, /checks\.json: Invalid regular expression: \/\(\//);
});

test("every test file is in exactly one of test:unit and test:db", () => {
  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts as Record<string, string>;
  const lists = [scripts["test:unit"]!, scripts["test:db"]!].map((s) => s.split(" "));
  for (const file of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".test.ts"))) {
    assert.equal(lists.filter((l) => l.includes(`test/${file}`)).length, 1, `test/${file}`);
  }
});
