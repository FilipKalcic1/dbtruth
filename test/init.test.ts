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

const TSX = import.meta.resolve("tsx");
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const QUICK_START = /^## Quick start$([\s\S]*?)^## /m.exec(README)?.[1] ?? "";

/** The next steps as the quick start shows them: the fenced block that opens with "next steps:". */
const NEXT = (/^```\r?\n(next steps:\r?\n[\s\S]*?)^```/m.exec(QUICK_START)?.[1] ?? "").trimEnd().split(/\r?\n/);
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

/** Runs init from cwd, with --skill and --force as given: its exit code and every line it printed. */
function init(cwd: string, options: { skill?: boolean; force?: boolean } = {}): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = runInit({ cwd, ...options, err: (line) => lines.push(line) });
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
  assert.deepEqual(lines, [".env already exists; left as it is", ...NEXT]);
  for (const line of lines) assert.doesNotMatch(line, /canary-pii/);
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
  assert.deepEqual(init(root).lines, ["wrote .env", ...NEXT]);
});

test("the next steps end with the command that adds dbtruth mcp to Claude Code, the one under Giving it to your agent", () => {
  const command = /^  add the MCP server to Claude Code: (claude mcp add .+)$/.exec(NEXT.at(-1) ?? "")?.[1];
  assert.ok(command, `the last next step is "${NEXT.at(-1)}"`);
  const agent = /^## Giving it to your agent$([\s\S]*?)^## /m.exec(README)?.[1] ?? "";
  assert.ok(agent.split(/\r?\n/).includes(command), `"${command}" is not a line under Giving it to your agent`);
});

test("as a command, init writes .env and nothing else, prints nothing on stdout, and exits 0, or 1 when it could not write", () => {
  const root = repository();
  const before = contents(root);
  const done = command(root);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, "");
  assert.equal(done.stderr, ["wrote .env", NOT_IGNORED, ...NEXT, ""].join("\n"));
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
  assert.equal(first.stderr, [kept, `wrote ${SKILL}`, ...NEXT, ""].join("\n"));

  // Edited since, as a user may edit it: kept, and nothing else is written.
  writeFileSync(join(root, SKILL), "edited by hand\n");
  const before = contents(root);
  const second = command(root, "--skill");
  assert.equal(second.status, 1, second.stderr);
  assert.equal(second.stderr, [kept, `${SKILL} already exists; pass --force to replace it`, ""].join("\n"));
  assert.deepEqual(contents(root), before, "every file as it was");

  const forced = command(root, "--skill", "--force");
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(forced.stderr, [kept, `wrote ${SKILL}`, ...NEXT, ""].join("\n"));
  const after = contents(root);
  assert.ok(after[SKILL]?.equals(SHIPPED), `${SKILL} is not the skill the package ships`);
  assert.deepEqual({ ...after, [SKILL]: before[SKILL] }, before, "the .env and every other file as they were");
  for (const run of [first, second, forced]) assert.equal(run.stdout, "");
});
