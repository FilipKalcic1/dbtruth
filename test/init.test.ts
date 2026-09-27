import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/cli.js";
import { DEFAULT_MODEL } from "../src/model.js";
import { readEnvFile } from "../src/safety.js";
import { writeUnreadable } from "./unreadable.js";

const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const QUICK_START = /^## Quick start$([\s\S]*?)^## /m.exec(README)?.[1] ?? "";
const AGENT = /^## Giving it to your agent$([\s\S]*?)^## /m.exec(README)?.[1] ?? "";

/** The next steps as the quick start shows them: the fenced block that opens with "next steps:". */
const NEXT = (/^```\r?\n(next steps:\r?\n[\s\S]*?)^```/m.exec(QUICK_START)?.[1] ?? "").trimEnd().split(/\r?\n/);
/** The steps init leaves out once they are done: filling in the .env, and the run. Doctor stays: it checks each .env. */
const FILL = "  fill in .env";
const RUN = "  run npx dbtruth";
/** The next steps less those done, from the quick start's or from the list given. */
const without = (done: string[], next = NEXT) => next.filter((line) => !done.includes(line));
/** The command that adds the server on native Windows, as the quick start gives it: npx started through cmd. */
const WINDOWS_COMMAND = /`(claude mcp add [^`]* -- cmd \/c [^`]*)`/.exec(QUICK_START)?.[1];
/** The next steps on native Windows: the last one with that command. */
const WINDOWS_NEXT = [...NEXT.slice(0, -1), NEXT.at(-1)!.replace(/claude mcp add .*$/, WINDOWS_COMMAND ?? "")];
/** The next steps init prints as a command on this machine, which passes it process.platform. */
const HERE = process.platform === "win32" ? WINDOWS_NEXT : NEXT;
/** The line for CLAUDE.md under "Giving it to your agent", unwrapped. */
const CLAUDE_LINE = /^- \*\*Claude Code\*\*: one line in `CLAUDE\.md`\. \*([^*]+)\*/m.exec(README)?.[1]?.replace(/\s+/g, " ");
/** Where init --skill installs the skill, from the repository root, and the file the package ships. */
const SKILL = join(".claude", "skills", "dbtruth", "SKILL.md");
const SHIPPED = readFileSync(new URL("../skills/dbtruth/SKILL.md", import.meta.url));

const git = (cwd: string, ...args: string[]) => assert.equal(spawnSync("git", args, { cwd }).status, 0, `git ${args.join(" ")}`);

/** A git repository in a temporary directory, by its real path, holding the given files. */
function repository(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-init-")));
  git(root, "init", "--quiet", "--template=");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** Every file under dir, .git included, with its bytes. */
function contents(dir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const path of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (statSync(join(dir, path)).isFile()) out[path] = readFileSync(join(dir, path));
  }
  return out;
}

/** Runs init from cwd with the options given, on Linux unless they name a platform: its exit code and every line it printed. */
function init(cwd: string, options: { skill?: boolean; force?: boolean; platform?: NodeJS.Platform } = {}): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = runInit({ cwd, platform: "linux", ...options, err: (line) => lines.push(line) });
  return { code, lines };
}

/** Runs dbtruth init as a command from cwd, with the options given. */
const command = (cwd: string, ...options: string[]) => spawnSync(process.execPath, ["--import", TSX, CLI, "init", ...options], { cwd, encoding: "utf8", timeout: 20_000 });

const NOT_IGNORED = "WARNING: .gitignore does not ignore .env; add this line to it: .env";
const NO_ANSWER = "WARNING: git could not say whether .gitignore ignores .env; if it does not, add this line to it: .env";

test("in a fresh repository init writes .env and nothing else", () => {
  const root = repository();
  const before = contents(root);
  const { code, lines } = init(root);
  assert.equal(code, 0, lines.join("\n"));
  const { ".env": written, ...rest } = contents(root);
  assert.ok(written, "no .env at the root");
  assert.deepEqual(rest, before, "every other file, .git included, as it was");
  assert.deepEqual(lines, ["wrote .env", NOT_IGNORED, ...NEXT]);
});

test("from a nested package init writes the .env at the repository root, and names both files from there", () => {
  const root = repository({ "packages/api/package.json": "{}\n" });
  const api = join(root, "packages", "api");
  const up = (file: string) => join("..", "..", file);
  const { code, lines } = init(api);
  assert.equal(code, 0);
  assert.deepEqual(lines, [`wrote ${up(".env")}`, `WARNING: ${up(".gitignore")} does not ignore ${up(".env")}; add this line to it: .env`, ...NEXT]);
  assert.ok(existsSync(join(root, ".env")));
  assert.ok(!existsSync(join(api, ".env")));
});

test("the .env init writes holds no setting until a line is uncommented, and then that line's alone, as the quick start writes it", () => {
  const root = repository();
  init(root);
  const path = join(root, ".env");
  const text = readFileSync(path, "utf8");
  assert.deepEqual(readEnvFile(path), {}, "nothing is read until a line is filled in");
  // The quick start's two settings and the model it names as the default. Each is found as a whole line after "# ",
  // so a comment on that line, which readEnvFile would read into the value, fails here.
  const example = /^```\r?\n([\s\S]*?)^```/m.exec(QUICK_START)![1]!.trimEnd().split(/\r?\n/);
  for (const setting of [...example, `ANTHROPIC_MODEL=${DEFAULT_MODEL}`]) {
    const [, key, value] = /^([A-Z_]+)=(.*)$/.exec(setting)!;
    writeFileSync(path, text.replace(`# ${setting}\n`, `${setting}\n`));
    assert.deepEqual(readEnvFile(path), { [key!]: value }, `${setting}, uncommented`);
  }
});

test("an existing .env is left as it is, byte for byte, and init says so and goes on", () => {
  // CRLF, no final newline, and values init must never print.
  const root = repository({ ".env": "DATABASE_URL=postgres://canary-pii:canary-pii-pass@canary-pii/canary-pii\r\n# kept\r\nANTHROPIC_API_KEY=sk-canary-pii", ".gitignore": ".env\n" });
  const before = contents(root);
  const { code, lines } = init(root);
  assert.equal(code, 0);
  assert.deepEqual(contents(root), before, "every file, .env included, as it was");
  assert.deepEqual(lines, [".env already exists; left as it is", ...without([FILL])], "the next steps, less filling in a .env that sets both settings");
  for (const line of lines) assert.doesNotMatch(line, /canary-pii/);
});

test("init leaves out filling in the .env once the .env it found sets both settings a run needs, as a run reads them", () => {
  assert.ok(NEXT.includes(FILL), `"${FILL}" is not a line of the quick start's next steps`);
  const cases: [string, boolean][] = [
    ["DATABASE_URL=postgres://u@h/d\nANTHROPIC_API_KEY=sk-ant-x\n", true],
    // Set in the other forms a run reads: after export, quoted, around spaces.
    ["export DATABASE_URL=\"postgres://u@h/d\"\n  ANTHROPIC_API_KEY = 'sk-ant-x'\n", true],
    // One of the two missing, empty, or still behind the # init writes: a run reads it as not set.
    ["DATABASE_URL=postgres://u@h/d\n", false],
    ["ANTHROPIC_API_KEY=sk-ant-x\n", false],
    ["DATABASE_URL=\nANTHROPIC_API_KEY=sk-ant-x\n", false],
    ["DATABASE_URL=postgres://u@h/d\n# ANTHROPIC_API_KEY=sk-ant-x\n", false],
    ["", false],
  ];
  for (const [dotenv, filled] of cases) {
    const root = repository({ ".env": dotenv, ".gitignore": ".env\n" });
    const { code, lines } = init(root);
    assert.equal(code, 0, lines.join("\n"));
    assert.deepEqual(lines, [".env already exists; left as it is", ...(filled ? without([FILL]) : NEXT)], `${JSON.stringify(dotenv)}: ${filled ? "filled in" : "still to fill in"}`);
  }
});

test("a .env init cannot read sets nothing, as a run passes it over, so filling it in stays a step", () => {
  const root = repository({ ".gitignore": ".env\n" });
  writeUnreadable(join(root, ".env"), "DATABASE_URL=postgres://u@h/d\nANTHROPIC_API_KEY=sk-ant-x\n");
  const { code, lines } = init(root);
  assert.equal(code, 0, lines.join("\n"));
  assert.deepEqual(lines, [".env already exists; left as it is", ...NEXT], "every next step, filling in the .env among them");
});

test("init leaves out the run once context/snapshot.json is beside the .env, keeps doctor, and not for one elsewhere", () => {
  assert.ok(NEXT.includes(RUN), `"${RUN}" is not a line of the quick start's next steps`);
  const up = (file: string) => join("..", "..", file);
  // Beside the .env init wrote, as in a clone of a repository that commits context/, and beside the one it found at the
  // root when run from a package: measured. Doctor stays, since it checks the .env of whoever runs init.
  const fresh = repository({ "context/snapshot.json": "{}\n", ".gitignore": ".env\n" });
  assert.deepEqual(init(fresh).lines, ["wrote .env", ...without([RUN])], "a snapshot beside the .env init wrote: doctor and not the run");
  const measured = repository({ "context/snapshot.json": "{}\n", "packages/api/package.json": "{}\n", ".env": "", ".gitignore": ".env\n" });
  assert.deepEqual(init(join(measured, "packages", "api")).lines, [`${up(".env")} already exists; left as it is`, ...without([RUN])], "a snapshot at the root, init run from a package");
  // In the package init was run from, or a context/ with no snapshot, as a dbtruth older than 0.4.0 left it: not done.
  const elsewhere = repository({ "packages/api/context/snapshot.json": "{}\n", ".env": "", ".gitignore": ".env\n" });
  assert.deepEqual(init(join(elsewhere, "packages", "api")).lines, [`${up(".env")} already exists; left as it is`, ...NEXT], "a snapshot in the package alone");
  const older = repository({ "context/README.md": "# context\n", ".env": "", ".gitignore": ".env\n" });
  assert.deepEqual(init(older).lines, [".env already exists; left as it is", ...NEXT], "a context/ with no snapshot.json in it");
  // Nor a directory by that name, which no run writes.
  const directory = repository({ "context/snapshot.json/x": "", ".env": "", ".gitignore": ".env\n" });
  assert.deepEqual(init(directory).lines, [".env already exists; left as it is", ...NEXT], "a directory named context/snapshot.json");
});

test("a .env that is a directory, such as a Python virtualenv, is left alone, and init exits 1: it could not write the file", () => {
  const root = repository({ ".env/bin/python": "", ".gitignore": ".env\n" });
  const before = contents(root);
  const { code, lines } = init(root);
  assert.equal(code, 1);
  assert.deepEqual(contents(root), before);
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.match(lines[0]!, /^could not write \.env: EEXIST: /);
});

test("git decides whether .env is ignored, and .gitignore is only read", () => {
  const cases: [string | undefined, boolean][] = [
    [undefined, false],
    [".env\n", true],
    ["node_modules/\r\n/.env\r\n", true],
    // Patterns that cover it.
    [".env*\n", true],
    ["*.env\n", true],
    // Patterns that look as if they do, and do not: another file, a directory only, and one taken back.
    [".env.local\n", false],
    [".env/\n", false],
    [".env*\n!.env\n", false],
  ];
  for (const [gitignore, ignored] of cases) {
    const root = repository(gitignore === undefined ? {} : { ".gitignore": gitignore });
    const { code, lines } = init(root);
    assert.equal(code, 0);
    assert.deepEqual(lines, ["wrote .env", ...(ignored ? [] : [NOT_IGNORED]), ...NEXT], JSON.stringify(gitignore));
    if (gitignore === undefined) assert.ok(!existsSync(join(root, ".gitignore")), "no .gitignore is made");
    else assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), gitignore);
  }
});

test("the user's own ignore file does not stand in for the line in .gitignore", () => {
  // Set in the repository's config as a user sets it globally: it covers .env on this machine, not in a teammate's clone.
  const root = repository({ ".git/personal-ignore": ".env\n" });
  git(root, "config", "core.excludesFile", join(root, ".git", "personal-ignore"));
  assert.deepEqual(init(root).lines, ["wrote .env", NOT_IGNORED, ...NEXT]);
});

test("a .env git already tracks draws no warning when .gitignore lists it", () => {
  // Committed before the line went into .gitignore. Git counts a tracked file as not ignored, whatever the patterns say,
  // so asked about the file rather than the patterns it would warn about a line that is there.
  const root = repository({ ".env": "DATABASE_URL=\n", ".gitignore": ".env\n" });
  git(root, "add", "--force", ".env");
  assert.deepEqual(init(root).lines, [".env already exists; left as it is", ...NEXT]);
});

test("init never runs a git.exe the repository holds", () => {
  // Windows looks for a command in the working directory before the PATH, unless this variable is set, as Git Bash sets
  // it. An empty git.exe cannot start, so had init run it, it would say git could not tell.
  const root = repository({ "git.exe": "" });
  const skip = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  let lines: string[];
  try {
    lines = init(root).lines;
  } finally {
    if (skip !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = skip;
  }
  assert.deepEqual(lines, ["wrote .env", NOT_IGNORED, ...NEXT]);
});

test("when git cannot be run, init says it could not tell, with the line to add", () => {
  const root = repository();
  // Emptied, not removed: without PATH a system searches its default directories, where git may be.
  const path = process.env.PATH;
  process.env.PATH = "";
  let lines: string[];
  try {
    lines = init(root).lines;
  } finally {
    process.env.PATH = path;
  }
  assert.deepEqual(lines, ["wrote .env", NO_ANSWER, ...NEXT]);
});

test("outside a repository init writes .env in the current directory, and warns that git could not say whether it is ignored", () => {
  // The temporary directory is in no repository, as the tests of findDotEnv rely on too. Git gives no answer there, and
  // the directory may become a repository later.
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "dbtruth-init-")));
  const cwd = join(parent, "project");
  mkdirSync(cwd);
  const { code, lines } = init(cwd);
  assert.equal(code, 0);
  assert.deepEqual(lines, ["wrote .env", NO_ANSWER, ...NEXT]);
  assert.deepEqual(readdirSync(cwd), [".env"]);
  assert.deepEqual(readdirSync(parent), ["project"]);
});

test("the next steps init prints are exactly the quick start's, and its line for CLAUDE.md is the one under Giving it to your agent", () => {
  assert.ok(NEXT.length > 1, "no block of next steps in the quick start");
  assert.ok(CLAUDE_LINE, 'no line for CLAUDE.md under "Giving it to your agent"');
  assert.ok(NEXT.some((line) => line.endsWith(`CLAUDE.md: ${CLAUDE_LINE}`)), `the quick start's next steps do not end a line with "CLAUDE.md: ${CLAUDE_LINE}"`);
  const root = repository({ ".gitignore": ".env\n" });
  assert.deepEqual(init(root).lines, ["wrote .env", ...NEXT], "every step in a new project, filling in the .env init just wrote among them");
});

test("the next steps end with the command that adds dbtruth mcp to Claude Code, the one under Giving it to your agent", () => {
  const command = /^  add the MCP server to Claude Code: (claude mcp add .+)$/.exec(NEXT.at(-1) ?? "")?.[1];
  assert.ok(command, `the last next step is "${NEXT.at(-1)}"`);
  assert.ok(AGENT.split(/\r?\n/).includes(command), `"${command}" is not a line under Giving it to your agent`);
});

test("on native Windows the last next step adds the server through cmd, as the quick start and Giving it to your agent give it, and elsewhere as the block shows it", () => {
  assert.ok(WINDOWS_COMMAND, "the quick start gives no claude mcp add command through cmd /c");
  assert.ok(AGENT.includes(`\`${WINDOWS_COMMAND}\``), `"${WINDOWS_COMMAND}" is not under Giving it to your agent`);
  // win32 is native Windows alone: WSL reports linux.
  for (const platform of ["win32", "linux", "darwin"] as const) {
    const root = repository({ ".gitignore": ".env\n" });
    assert.deepEqual(init(root, { platform }).lines, ["wrote .env", ...(platform === "win32" ? WINDOWS_NEXT : NEXT)], `the next steps on ${platform}`);
  }
});

test("as a command, init writes .env and nothing else, prints nothing on stdout, and exits 0, or 1 when it could not write", () => {
  const root = repository();
  const before = contents(root);
  const done = command(root);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, "");
  assert.equal(done.stderr, ["wrote .env", NOT_IGNORED, ...HERE, ""].join("\n"), `what it did, then the next steps as ${process.platform} gets them`);
  const { ".env": written, ...rest } = contents(root);
  assert.ok(written, "no .env at the root");
  assert.deepEqual(rest, before, "every other file, .git included, as it was");

  const blocked = command(repository({ ".env/bin/python": "" }));
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.equal(blocked.stdout, "");
  assert.match(blocked.stderr, /^could not write \.env: EEXIST: [^\n]+\n$/);
});

test("init --skill installs the skill the package ships at the repository root, beside the .env, and nothing else", () => {
  const root = repository({ "packages/api/package.json": "{}\n" });
  const before = contents(root);
  const up = (file: string) => join("..", "..", file);
  const { code, lines } = init(join(root, "packages", "api"), { skill: true });
  assert.equal(code, 0, lines.join("\n"));
  assert.deepEqual(lines, [`wrote ${up(".env")}`, `WARNING: ${up(".gitignore")} does not ignore ${up(".env")}; add this line to it: .env`, `wrote ${up(SKILL)}`, ...NEXT]);
  const { ".env": written, [SKILL]: skill, ...rest } = contents(root);
  assert.ok(written, "no .env at the root");
  assert.ok(skill?.equals(SHIPPED), `${SKILL} at the root is not the skill the package ships`);
  assert.deepEqual(rest, before, "every other file, .git included, as it was");
});

test("init --skill --force installs the skill where there is none yet", () => {
  const root = repository({ ".env": "", ".gitignore": ".env\n" });
  const { code, lines } = init(root, { skill: true, force: true });
  assert.equal(code, 0, lines.join("\n"));
  assert.deepEqual(lines, [".env already exists; left as it is", `wrote ${SKILL}`, ...NEXT]);
  assert.ok(readFileSync(join(root, SKILL)).equals(SHIPPED), `${SKILL} is not the skill the package ships`);
});

test("init --skill --force puts a file of its own where the skill is a link, and leaves the linked file as it was", () => {
  // A hard link, since Windows makes a symbolic one only with privileges: either would carry a write to the other name.
  const root = repository({ ".env": "", ".gitignore": ".env\n", "shared.md": "shared\n" });
  mkdirSync(dirname(join(root, SKILL)), { recursive: true });
  linkSync(join(root, "shared.md"), join(root, SKILL));
  const { code, lines } = init(root, { skill: true, force: true });
  assert.equal(code, 0, lines.join("\n"));
  assert.equal(readFileSync(join(root, "shared.md"), "utf8"), "shared\n", "shared.md was written through the link");
  assert.ok(readFileSync(join(root, SKILL)).equals(SHIPPED), `${SKILL} is not the skill the package ships`);
});

test("a skill path taken by a directory is left alone, with --force too, and init exits 1: it could not write the file", () => {
  const root = repository({ [join(SKILL, "notes.md")]: "kept\n", ".env": "", ".gitignore": ".env\n" });
  const before = contents(root);
  for (const force of [false, true]) {
    const { code, lines } = init(root, { skill: true, force });
    assert.equal(code, 1, lines.join("\n"));
    assert.deepEqual(contents(root), before, `every file as it was, --force ${force}`);
    assert.equal(lines.length, 2, lines.join("\n"));
    assert.ok(lines[1]!.startsWith(`could not write ${SKILL}: `), lines.join("\n"));
  }
});

test("init --skill installs the skill beside a directory named .env, such as a virtualenv, and exits 1: it could not write the .env", () => {
  const root = repository({ ".env/bin/python": "" });
  const before = contents(root);
  const { code, lines } = init(root, { skill: true });
  assert.equal(code, 1, lines.join("\n"));
  assert.match(lines[0]!, /^could not write \.env: EEXIST: /);
  assert.deepEqual(lines.slice(1), [`wrote ${SKILL}`], "the skill's line alone after the .env's: no warning about a .env not written, and no next steps");
  const { [SKILL]: skill, ...rest } = contents(root);
  assert.ok(skill?.equals(SHIPPED), `${SKILL} is not the skill the package ships`);
  assert.deepEqual(rest, before, "every other file, .git included, as it was");
});

test("as a command, init --skill installs the skill, refuses a second time without --force, and --force replaces the skill alone", () => {
  // A .env no option may touch, with values init must never print.
  const root = repository({ ".env": "DATABASE_URL=postgres://canary-pii:canary-pii-pass@canary-pii/canary-pii\n", ".gitignore": ".env\n" });
  const kept = ".env already exists; left as it is";
  const first = command(root, "--skill");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, [kept, `wrote ${SKILL}`, ...HERE, ""].join("\n"), `the skill written, then the next steps as ${process.platform} gets them`);

  // Edited since, as a user may edit it: kept, and nothing else is written.
  writeFileSync(join(root, SKILL), "edited by hand\n");
  const before = contents(root);
  const second = command(root, "--skill");
  assert.equal(second.status, 1, second.stderr);
  assert.equal(second.stderr, [kept, `${SKILL} already exists; pass --force to replace it`, ""].join("\n"));
  assert.deepEqual(contents(root), before, "every file as it was");

  const forced = command(root, "--skill", "--force");
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(forced.stderr, [kept, `wrote ${SKILL}`, ...HERE, ""].join("\n"), `the skill replaced, then the next steps as ${process.platform} gets them`);
  const after = contents(root);
  assert.ok(after[SKILL]?.equals(SHIPPED), `${SKILL} is not the skill the package ships`);
  assert.deepEqual({ ...after, [SKILL]: before[SKILL] }, before, "the .env and every other file as they were");
  for (const run of [first, second, forced]) assert.equal(run.stdout, "");
});

test("as a command, init --skill after a full run gives only the steps left: doctor, the line for CLAUDE.md and the MCP server", () => {
  // The root as a full run leaves it: a .env that sets both settings, with values init must never print, and the snapshot.
  const root = repository({
    ".env": "DATABASE_URL=postgres://canary-pii:canary-pii-pass@canary-pii/canary-pii\nANTHROPIC_API_KEY=sk-canary-pii\n",
    ".gitignore": ".env\n",
    "context/snapshot.json": "{}\n",
  });
  const left = without([FILL, RUN], HERE);
  assert.equal(left.length, 4, "the heading, doctor, the line for CLAUDE.md and the MCP server's");
  const done = command(root, "--skill");
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, "");
  assert.equal(done.stderr, [".env already exists; left as it is", `wrote ${SKILL}`, ...left, ""].join("\n"), "no step a full run has done");
});
