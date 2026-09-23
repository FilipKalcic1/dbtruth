# dbtruth build plan: from 0.1.8 to a product people pay for

Audience: the coding agent that implements this (Claude Code or similar) and the
maintainers who review it. Put this file at the repository root next to
`NOTES.md` and add one line to `CLAUDE.md`:

> Work from BUILD_PLAN.md. Before every task, reread section 3 (rules) and
> section 4 (quality loop). Record every iteration in PROGRESS.md.

---

## 0. How to use this document

1. Read sections 1 to 5 completely before changing any code.
2. Work the tasks in section 6 in the order given. Inside a phase, a task starts
   only when every earlier P0 task has scored 100 (section 4) or is marked
   BLOCKED with evidence.
3. Every task has the same parts: **Why**, **Build**, **Edge cases**, **Tests**,
   **Acceptance** (numbered A-items) and **Docs**. The A-items are the only
   definition of done. If an A-item is ambiguous, stop and ask; do not pick the
   easier reading.
4. Items marked **HUMAN** need an account, money, a signature or a product
   decision. The agent prepares everything around them, lists exactly what the
   human must do, and does not mark them done.
5. When this plan and the code disagree about how something works today, the
   code wins. Write the difference into `NOTES.md` and continue.
6. When this plan conflicts with a rule in section 3, the rule wins. Stop the
   task and write the conflict into `PROGRESS.md`.
7. Priorities: **P0** is the target for today, **P1** this week, **P2** after
   the paid tier exists. If the day ends before P0 is finished, stop at a task
   boundary with the suite green; never leave a half-finished task on `main`.

---

## 1. Where the project stands (verified on 2026-09-23)

Measured on a clean clone of `main` at commit `2f0e15b`, Postgres 16, Node 22:

| Check | Result |
|---|---|
| Version on npm (`dist-tags.latest`) | `0.1.8` (the Reddit post calls it "0.8") |
| `npm run typecheck` | clean |
| `npm test` against the fixture databases | 69 tests: 67 pass, 2 skipped (the live tests that need `ANTHROPIC_API_KEY`), 0 fail |
| The six test files that need no database | 35 of 35 pass |

The pipeline, as `src/cli.ts` runs it:

```
.env / env / --url -> model.preflight() -> safety.connect() (read-only proof)
  -> extract (SQL, sampled) -> fitToContext -> contextualize (model, prompt A)
  -> verify (SQL, one bounded query per claim) -> assemble (pure verdicts)
  -> write (README.md + ENTITIES.md by the model, tables/*.md rendered in code)
  -> persist (clears previous outputs, writes context/)
```

`test/structure.test.ts` pins which module may import which. Only `safety.ts`
imports `pg`, only `model.ts` imports `@anthropic-ai/sdk`.

**Already done; do not redo:** stale per-table files are removed on rerun
(0.1.6); empty claims are collapsed into one summary line and relations are
counted once (0.1.8, PR #1 by stepolan); per-table files are rendered from the
measurements without a model call (0.1.8); the sample is sized from the
estimate instead of being cut by `LIMIT` (0.1.8); join numbers separate `nulls`
from `orphans` (0.1.8); the `IN (subquery)` and correlated `EXISTS` measurements
were rewritten to read each side once (0.1.8).

**Defects found while writing this plan.** Each was reproduced on Postgres 16
in a scratch database; the numbers are real.

1. **Partitioned tables are sampled from their first partition.** Autovacuum
   analyzes leaf partitions but never the partitioned parent, so the parent's
   `pg_class.reltuples` stays `-1`. `sampleSource` treats `-1 <= sampleRows` as
   "small" and uses the plain `LIMIT` form. Reproduction: a 300,000-row table
   partitioned by year into 2024, 2025 and 2026, leaves analyzed, parent not.
   `SELECT * FROM ev LIMIT 50000` covered 2024 only; `TABLESAMPLE SYSTEM` on the
   parent covered 2024 to 2026. This is the same bias as the Reddit post, one
   level up. Fixed by T2.1.
2. **Never-analyzed tables are sampled from their oldest pages.** A table
   loaded since the last `ANALYZE` has `reltuples = -1` and `relpages = 0`, while
   `pg_relation_size` reported 1,664 pages. The plain `LIMIT 50000` read ids
   1 to 50,000 of 300,000. Fixed by T2.1.
3. **A small-integer column matches any dense key.** On the fixture,
   `order_items.quantity` (values 1 to 5) against `products.id` has a 100% hit
   rate, and five other dense single-column keys in the fixture would also score
   100%. Any such inferred claim is reported as confirmed. Addressed by T2.2.
4. **`--version` does not exist.** Commander's `.version()` is never called,
   yet external tools (HOL Guard's dbtruth rules) expect it. Fixed by T1.2.
5. **`.env` is read from the current directory only** (`readDotEnv(cwd)`), so
   in a monorepo with `.env` at the root and the command run from a package,
   the tool reports "no database URL". Fixed by T1.1.

---

## 2. Product goal and scope

**Goal.** A developer points dbtruth at a Postgres database and gets context an
agent can trust. A team keeps that context true over time: every pull request
re-measures what the context claims and says what broke. Users bring their own
model access; no customer data ever passes through a server of ours.

| Tier | What | Price |
|---|---|---|
| Free | CLI (`dbtruth`, `check`, `doctor`, `init`), MCP server, skill, the GitHub Action on public repositories | free |
| Team | the GitHub Action on private repositories: PR comment, regression gate | per team per month, HUMAN decides |

**Definition of finished for this plan (release 0.4.0):**

- A new user gets from zero to `context/` with one command from any folder of
  their repository, or gets one sentence that says exactly what to fix
  (`dbtruth doctor`).
- Sampling is unbiased on partitioned and never-analyzed tables.
- Every full run leaves `context/snapshot.json`; `dbtruth check` re-measures it
  with no model and no API key and returns an exit code a CI job can use.
- A GitHub Action runs `check` on pull requests and keeps one comment updated.
- `dbtruth mcp` lets an agent measure a join before writing it, and a skill
  tells the agent when to do so.
- The free and paid split lives in the Action only, and fails open.
- Every task scored 100 under section 4.

**Out of scope:** MySQL and MariaDB, a hosted service that connects to customer
databases, a UI, telemetry of any kind, anything that writes to a database.

---

## 3. Rules that override everything

These come from `README.md` and `NOTES.md` and are what the project is. A task
that cannot be done within them is BLOCKED, not bent.

- **R1 Never write to the user's database.** Only `safety.ts` imports `pg`.
  The only write-shaped statement stays the rolled-back read-only proof.
- **R2 One module per external SDK.** Only `model.ts` imports
  `@anthropic-ai/sdk`. The MCP SDK gets the same treatment (only `mcp.ts`), and
  `structure.test.ts` pins both.
- **R3 Hidden values never leave the database.** New outputs (snapshot, check
  report, PR comment, MCP responses, anything sent to the model) may carry only
  what `Verified` already carries: names, types, counts, rates, categorical
  values that passed the visibility rule, and query text. Minimum and maximum
  values of a column count as values: compare them inside the database and
  return only counts. (Declared non-text key columns are visible by the
  existing rule and may be read, but are still not written into outputs
  without a reason.) Every new output gets a canary test.
- **R4 No column-name matching in code to decide meaning.** The model may read
  names; the code measures. Numeric ranges, counts and types are fine; patterns
  like `_id` or `_type` are not.
- **R5 Every number lives in `config.ts`** with a comment saying what breaks if
  it is set wrong, a range in `overridable`, a `DBTRUTH_*` variable and a flag.
- **R6 stdout is data only**: JSON, or the MCP protocol in `mcp` mode. Every
  human-facing line goes to stderr.
- **R7 Every verdict carries a query a human can rerun, and its numbers.**
- **R8 Untrusted input never becomes SQL text.** Anything that comes from the
  model, a flag, a file or an MCP client is untrusted. Identifiers are used only
  after they are found in the catalog, and only through `q()` or `qualified()`.
  Values are bind parameters (`$1`), never interpolated. SQL text read from a
  file is never executed.
- **R9 No network** from the dbtruth package except the database and, during a
  full run, the Anthropic API. The GitHub Action additionally calls the GitHub
  API (comments) and, from T6.2, the license endpoint; nothing else.
- **R10 Every behavior change gets a `NOTES.md` entry**: what, why, and what was
  deliberately not done.
- **R11 Do not weaken the guard rails to make something pass** (section 4.4).

---

## 4. The quality loop: every task is scored 1 to 100

### 4.1 The score is computed, not felt

`scripts/acceptance.mjs` (built in T0.1) runs every automatable acceptance check
and prints a score per task and overall. The few A-items a script cannot judge
(for example "a newcomer can follow the quick start in five minutes") are
manual items: they count like any other A-item, but only with written evidence
in `acceptance/manual.json` and `PROGRESS.md`. Empty evidence scores zero.

### 4.2 Weights for one task

| Part | Weight | Earned when |
|---|---|---|
| Acceptance items | 50 | every A-item passes; the 50 points are split evenly over the A-items |
| Tests | 20 | a test exists for every A-item and every listed edge case, and the sabotage check (4.5) is recorded |
| Project gates | 15 | `npm run verify` is green: typecheck, full test suite, build, package smoke test |
| Docs | 10 | every file under **Docs** is updated: README, NOTES, `--help` text, CHANGELOG |
| Invariants | 5 | structure test, canary tests and stdout-cleanliness tests are green |

**Gate rule:** if a project gate or an invariant fails, the task scores at most
40, whatever else passes.

**Overall score** = the mean of all non-HUMAN task scores. A release happens only
at 100.

### 4.3 The loop, per task

1. Read the task and the rules again.
2. Write the tests for every A-item and edge case first. Run them; they must
   fail, for the reason the task describes.
3. Implement.
4. Run `npm run verify`, then `npm run acceptance -- --task <id>`.
5. Write the iteration into `PROGRESS.md` (format in 4.7).
6. Below 100: for every lost point, write the failing output, find the cause
   (not the symptom), fix it, and go back to step 4.
7. At 100: do the sabotage check, then commit with the message
   `<task id>: <title> (score 100)`.

### 4.4 Forbidden ways to raise a score

- Deleting, skipping, loosening or rewriting an existing test, unless an A-item
  explicitly changes that behavior; then the change is named in `NOTES.md`.
- Lowering a threshold, widening a range, or adding to the dependency map in
  `structure.test.ts` beyond what the task says.
- Catching an error and ignoring it; `as any`; `@ts-ignore`; `// eslint-disable`.
- Mocking the thing under test in an integration test.
- Hard-coding fixture names or numbers in `src/`.
- Marking a HUMAN item or a BLOCKED item as done.

### 4.5 The sabotage check

For every task, break the core of the implementation on purpose (revert the
fix, invert the key condition, return early), run the new tests, confirm that at
least one fails with a message that explains the problem, then restore. Record
what was broken and which test caught it. A test that stays green under
sabotage is not a test, and the task does not get its 20 test points.

### 4.6 When to stop instead of looping

Stop a task and mark it **BLOCKED** in `PROGRESS.md` when the same A-item has
failed five iterations in a row with no new information, when it needs a
decision this plan does not make, or when it conflicts with a rule. Write the
evidence and the exact question, then continue with the next task that does
not depend on it. Never report 100 for a blocked task.

### 4.7 PROGRESS.md format

```
## T1.1 .env discovery
### Iteration 3: 85/100
- Lost A4 (-10): CLI run from packages/api still says "no database URL"
  (stderr: ...). Cause: findDotEnv stops at cwd because .git is a file in a
  worktree. Next: treat a .git file as a boundary.
- Lost Docs (-5): README has no monorepo section.
### Iteration 4: 100/100
- Sabotage: made findDotEnv read only cwd; "nested package finds the root
  .env" failed with "expected ... got undefined". Restored.
- Commit: T1.1: .env discovery (score 100)
```

---

## 5. Test strategy

### 5.1 Layers

| Layer | What it proves | How |
|---|---|---|
| Unit | pure logic: config ranges, schemas, verdicts, the check diff, snapshot serialization, `.env` discovery, MCP input validation | `node --test`, no database, temp directories for file tests |
| Database integration | the whole loop on real Postgres, offline | the fixture databases plus the injectable model `Transport` (as `test/integration.test.ts` does today) |
| CLI black box | exit codes, stderr lines, stdout JSON, behavior from other working directories | spawn `tsx src/cli.ts` with a controlled `cwd` and `env`, as the existing tests do |
| Package smoke | what a user actually installs | `npm pack`, install the tarball in an empty temp directory, run the installed binary |
| MCP protocol | the server speaks MCP over stdio and nothing else | spawn `dbtruth mcp` and drive it with the SDK's client |
| GitHub Action | the action passes, fails and comments as documented | the action repository's own workflow, with a Postgres service |
| Live (opt-in) | the real model still produces claims the pipeline accepts | the two existing live tests plus one new "full run, then check", run only with `ANTHROPIC_API_KEY` |
| Version matrix | nothing depends on one Postgres or Node version | CI: Postgres 12, 14, 16, 18 and Node 20, 22 |

### 5.2 Fixtures

Existing: `fixture` (seed.sql, every deliberate problem listed at its top),
`clean` (clean.sql, nothing wrong), `scale` (300 tables). New in this plan:

- `sampling` (T2.1): a large never-analyzed table and a partitioned table whose
  parent was never analyzed.
- `polymorph` (T2.3, T2.4): a polymorphic reference with one broken branch, and
  a table whose orphans fall inside the key range.
- `fixture_template` (T3.2): an untouched copy of `fixture`, created once at
  init time by a last init file that first runs `\connect postgres` (each init
  file starts connected to `fixture`, and a database cannot be copied while a
  session is connected to it). No test ever connects to it. Tests that must
  change data create a throwaway copy with
  `CREATE DATABASE <name> TEMPLATE fixture_template` and drop it afterwards.
  Copying from `fixture` itself would fail whenever another test file holds a
  connection to it, and `node --test` runs files in parallel.

Rules for every fixture: deterministic data (`generate_series`, never
`random()`); `WITH (autovacuum_enabled = false)` on every table whose catalog
state a test depends on, so autovacuum cannot change `reltuples` mid-run; a
comment block at the top listing each deliberate problem, like `seed.sql`.
Add each new file to `docker-compose.yml` in init order and to the CI loading
step (T0.2). Do not change `seed.sql`: existing assertions count its relations.

### 5.3 Standing assertions for every new output

Every new command, file or response must be covered by tests that prove:

1. **Canary:** no value containing `canary-pii` appears in it (R3).
2. **Clean stdout:** stdout holds only the documented data (R6).
3. **No model call** where none is expected (`check`, `doctor`, `mcp`): run with
   no `ANTHROPIC_API_KEY` and with an injected transport that throws if called.
4. **Read-only:** runs as the `reader` role (SELECT only, on the `fixture`
   database) succeed with no warning.
5. **Bounded time:** each test states a time limit and asserts it.

### 5.4 Commands (added in T0.1)

```
npm run typecheck        # tsc, no emit
npm run test:unit        # tests that need no database
npm run test:db          # tests that need the fixture databases
npm test                 # everything (unchanged meaning)
npm run build            # tsc + copy prompts (+ skills from T5.2)
npm run test:pack        # scripts/pack-smoke.mjs
npm run verify           # typecheck && test && build && test:pack
npm run acceptance -- --task T1.1   # score one task
npm run acceptance       # score everything
```

Local database: `docker compose up -d --wait` (port 54329), as today.

### 5.5 Manual acceptance before each release

Run the released package against Pagila (used in NOTES.md) and, when available,
a WordPress or Discourse dump (a commenter suggested both: WordPress declares no
foreign keys, Discourse very few). Record the run time, the verdict counts and
anything false in `NOTES.md` under the release heading. Anything false is a
blocker.

---

## 6. Tasks

Overview:

| Id | Task | Priority |
|---|---|---|
| T0.1 | Verification harness and scoring script | P0 |
| T0.2 | CI for this repository | P0 |
| T1.1 | `.env` discovery up to the repository root | P0 |
| T1.2 | `--version` | P0 |
| T1.3 | `dbtruth doctor` | P0 |
| T1.4 | `dbtruth init` | P1 |
| T1.5 | README quick start and troubleshooting | P0 |
| T2.1 | Unbiased sampling without a catalog estimate | P0 |
| T2.2 | Weak-evidence note for small value ranges | P1 |
| T2.3 | Conditional relationships (polymorphic references) | P1 |
| T2.4 | Where the orphans fall | P1 |
| T3.1 | `context/snapshot.json` | P0 |
| T3.2 | `dbtruth check` | P0 |
| T3.3 | `check` reports: JSON and Markdown | P1 |
| T4.1 | GitHub Action | P1 |
| T5.1 | `dbtruth mcp` | P1 |
| T5.2 | Skill | P1 |
| T6.1 | Team section and waitlist in the README | P0 (text), HUMAN (price, form) |
| T6.2 | License check in the Action | P2 |
| T6.3 | Business setup | HUMAN |
| T7.1 | Releases 0.2.0, 0.3.0, 0.4.0 | with each phase |

Order for today: T0.1, T0.2, T1.2, T1.1, T1.3, T1.5, T2.1, T3.1, T3.2, then the
T6.1 text. Everything after that is P1 or later.

---

### Phase 0: foundations

#### T0.1 Verification harness and scoring script (P0)

**Why.** Section 4 needs a score that a script computes.

**Build.**

- `package.json` scripts as listed in 5.4. Split the test files into
  `test:unit` and `test:db` with explicit file lists; keep `npm test` running
  all of them.
- `scripts/pack-smoke.mjs` (expects `npm run build` to have run; `verify`
  orders it that way): run `npm pack`; create an empty temp directory;
  `npm init -y`; install the tarball; run `node_modules/.bin/dbtruth --help`
  (and `--version` once T1.2 exists); list the tarball and assert it contains
  `dist/cli.js`, `dist/prompts/contextualize.md`, `dist/prompts/write.md`,
  `README.md`, `LICENSE`; assert it contains no `test/`, `src/`, `.env` or
  `context/`. When `DATABASE_URL` is set, also run `dbtruth doctor` (after
  T1.3). Exit non-zero on the first failure, naming it.
- `acceptance/checks.json`: one entry per automated check:
  `{ "task": "T1.1", "id": "A1", "part": "acceptance", "cmd": "...",
  "expectExit": 0, "expectStdout": "regex", "expectStderr": "regex",
  "timeoutSeconds": 60 }`. Parts are `acceptance`, `tests`, `gates`, `docs`,
  `invariants`; the script gives each part its weight from 4.2 and splits it
  evenly over that part's checks, so no check carries a hand-picked weight.
- `acceptance/manual.json`: the manual items per task, each with `evidence`
  (empty until filled in; empty evidence scores zero).
- `scripts/acceptance.mjs`: runs the checks for `--task <id>` or all of them,
  applies the weights and the gate rule, prints one line per check (PASS or
  FAIL, with the first 20 lines of output on failure), the task score, and the
  overall score. Exit code 0 only at 100.
- `PROGRESS.md` with the format of 4.7.

**Edge cases.** A check that hangs is killed at its timeout and fails. A task
with no checks scores 0, not 100.

**Tests.** `test/acceptance.test.ts`: a temporary checks file with one passing
and one failing check gives the expected score and names the failing check; a
failing gate caps the score at 40; a timeout fails; an empty task scores 0.

**Acceptance.**
- A1 `npm run verify` exits 0 on `main`.
- A2 `npm run acceptance -- --task T0.1` prints 100.
- A3 The package smoke test proves the prompts are inside the tarball.
- A4 With a deliberately failing check added, the score is below 100 and the
  output names that check.

**Docs.** README "Development" section: the new scripts. `NOTES.md`: why the
score is computed.

#### T0.2 CI for this repository (P0)

**Why.** "Tested" has to mean tested on every Postgres the README promises.

**Build.** `.github/workflows/ci.yml`, on push and pull request:

- matrix: Postgres `12`, `14`, `16`, `18`; Node `20`, `22`;
- a Postgres service container (`postgres:<version>`, user, password and
  database `dbtruth`/`dbtruth`/`fixture`, port `54329:5432`, a `pg_isready`
  health check);
- steps: checkout; setup-node; `npm ci`; load every fixture file with `psql` in
  compose order (service containers cannot mount init scripts); `npm run verify`.

**Edge cases.** A test that fails only on Postgres 12 is a real finding: fix it
or raise the documented minimum version in README and NOTES, never skip it.

**Tests.** The workflow itself. Sabotage: on a branch, break one assertion and
confirm CI goes red; delete the branch.

**Acceptance.**
- A1 All eight matrix cells are green on `main`.
- A2 The sabotage branch is red (link recorded in PROGRESS.md).

**Docs.** README: a CI badge. NOTES: the version matrix and why.

---

### Phase 1: onboarding without friction

#### T1.1 `.env` discovery up to the repository root (P0)

**Why.** In a monorepo `.env` sits at the root while the command runs from a
package. Today `readDotEnv(opts.cwd)` reads only the current directory, and the
user sees "no database URL" with no idea why. A README note helps; the tool
finding the file helps more.

**Build.**

- `safety.ts`: keep `readDotEnv(dir)` exactly as it is (tests use it). Add
  `findDotEnv(start: string): { path?: string; values: Record<string, string>; searched: string[] }`:
  - Walk from `start` upward. Stop at the first directory that contains `.git`
    (a directory, or a file as in worktrees and submodules): that is the
    repository root, and it is still searched.
  - If no `.git` exists anywhere above `start`, search `start` only. This keeps
    the tool from picking up an unrelated `~/.env` or `/tmp/.env`.
  - The nearest `.env` wins. Files are never merged.
  - A `.env` that exists but cannot be read is recorded in `searched` with the
    error, and the search continues.
- `cli.ts`: new option `--env-file <path>`. When given, only that file is read;
  if it does not exist, exit 1 with `--env-file <path>: no such file`.
- Precedence stays: `--url`, then the process environment, then the `.env`
  file that was found.
- When the `.env` used is not in the current directory, print to stderr, before
  the disclosure line: `reading settings from ../../.env` (a path relative to
  the current directory; never a value).
- The "no database URL" error becomes several lines: which directories were
  searched and, one per line, the three ways to fix it (`.env`, `DATABASE_URL`
  in the environment, `--url`), plus `--env-file` for a file elsewhere.
- `model.ts` `KEY_HELP`: say that dbtruth looks for `.env` in this directory and
  its parents up to the repository root.

**Edge cases.** Nested `.env` in the package and another at the root: the
package's wins. `.git` as a file. Symlinked working directories (compare real
paths). Windows drive roots (loop until `dirname(x) === x`). A `.env` with CRLF
line endings, `export` prefixes and quotes (the parser handles them; add a test
anyway). An empty `DATABASE_URL=` in `.env` means unset, as today.

**Tests.**
- Unit, temp directories: root `.git` + root `.env`, start in `root/packages/api`
  → finds the root file; `.env` in both → nearest wins; no `.git` above →
  searches `start` only and ignores a `.env` in the parent; `.git` file is a
  boundary; unreadable `.env` recorded in `searched`; precedence (environment
  beats `.env`, `--url` beats both).
- Integration: `run()` with `cwd` = `root/packages/api` inside a temp repo whose
  root `.env` holds the fixture URL, `env: {}`, fake transport → exit 2, and the
  stderr line names `../../.env`.
- CLI black box: spawned from a nested directory with no `.env` anywhere →
  exit 1, stderr lists the searched directories and the three fixes.
- `--env-file` missing → exit 1 with the message above.

**Acceptance.**
- A1 From a nested package directory, a root `.env` is found and used.
- A2 Outside a git repository, only the current directory is searched.
- A3 The nearest `.env` wins over one further up.
- A4 With no URL anywhere, the error names the searched directories and the
  fixes, and exits 1.
- A5 `--env-file` works and fails clearly on a missing file.
- A6 No value from any `.env` is ever printed (canary value in a test `.env`).

**Docs.** README quick start: a "Monorepos" paragraph ("run it from anywhere
inside the repository; dbtruth looks for `.env` up to the repository root, or
pass `--env-file`"). `--help` text for `--env-file`. NOTES entry.

#### T1.2 `--version` (P0)

**Build.** In `main()`, `.version(<version>, "-v, --version")` with the version
read at runtime from `package.json` next to the installed code
(`new URL("../package.json", import.meta.url)` works from both `src/` under tsx
and `dist/`; verify both).

**Tests.** CLI black box: `--version` prints exactly the `package.json` version
and exits 0. The package smoke test runs the installed binary with `--version`.

**Acceptance.**
- A1 `npx dbtruth --version` from the installed tarball prints the version.
- A2 The same from source under tsx.

**Docs.** README commands list.

#### T1.3 `dbtruth doctor` (P0)

**Why.** Most first-run failures are setup, not the tool. One command should
say what is wrong and how to fix it, without spending a token.

**Build.** New subcommand `doctor [--url <url>] [--env-file <path>]`, logic in a
new module `doctor.ts` (imports `safety`, `model`, `config`; add it to the
structure map, and `cli.ts` may import it). It prints one line per check to
stderr, `ok` or `FAIL` with the fix, in this order:

1. Node version at least 20.
2. Where the settings came from (the `.env` path from T1.1, or "environment").
3. `DATABASE_URL` present. Never print it, not even the host.
4. Connection: on failure, one plain sentence per common cause: connection
   refused, host not found, authentication failed, database does not exist,
   SSL required, timeout. The password must never appear, even inside a driver
   error message.
5. Server version at least 12
   (`SELECT current_setting('server_version_num')::int`; the statement guard in
   `safety.ts` admits only SELECT and WITH, so `SHOW` would be refused).
6. Read-only proof, reported exactly as the full run reports it.
7. Readable relations: how many relations the role can `SELECT`
   (`has_table_privilege`) and how many it cannot, with "measurements on those
   will be skipped".
8. `ANTHROPIC_API_KEY` present, and `model.preflight()` passes (it sends only
   the model id and costs no tokens). A missing key is not a failure; it prints
   "a full run needs ANTHROPIC_API_KEY; check and mcp do not".

Exit 0 when checks 1 to 6 pass, 1 otherwise. Add a test hook so preflight can be
replaced in tests (the injected transport already skips it; tests need both a
passing and a failing preflight).

**Edge cases.** URL with special characters in the password. A server that
accepts the connection but refuses `SET`. The `reader` role (no CREATE): the
proof passes with no warning. Relations the role cannot read.

**Tests.** Integration against the fixture: all ok as `dbtruth` and as
`reader`; wrong password (password `canary-pii-pass`: assert it appears nowhere
in stdout or stderr); non-existent database; nothing listening on the port; no
URL; key absent; preflight failing with each explained API error. Unit: Node
version check with an injected version string. No model call (5.3).

**Acceptance.**
- A1 On the fixture, doctor exits 0 and prints every check as ok.
- A2 Each listed failure produces its specific sentence and exit 1.
- A3 The password never appears in any output.
- A4 No tokens are spent: no `messages` call happens, only the models endpoint.
- A5 It runs from the installed package (package smoke test).

**Docs.** README quick start: step 2 is `npx dbtruth doctor`. Troubleshooting
table (T1.5). NOTES entry.

#### T1.4 `dbtruth init` (P1)

**Build.** New subcommand `init`:

- Finds the repository root (the T1.1 rule); outside a repository, uses the
  current directory.
- If no `.env` exists there, writes one with commented placeholders for
  `DATABASE_URL`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. It never overwrites
  an existing `.env`; it says so and continues.
- If `.gitignore` does not ignore `.env`, it prints a warning with the exact
  line to add. It does not edit `.gitignore`.
- With `--skill` (after T5.2): copies the skill to `.claude/skills/dbtruth/SKILL.md`,
  never overwriting without `--force`.
- Prints the next steps: fill in `.env`, run `npx dbtruth doctor`, run
  `npx dbtruth`, add the one line to `CLAUDE.md`, and the `claude mcp add` line
  (after T5.1).

**Tests.** Temp repositories: fresh (writes `.env`); existing `.env` (untouched,
byte for byte); `.gitignore` without `.env` (warning, file untouched); outside a
repository (writes to the current directory); `--skill` twice (second refuses
without `--force`).

**Acceptance.**
- A1 `init` in a fresh repository creates `.env` and nothing else.
- A2 It never modifies an existing file.
- A3 The printed next steps are exactly the documented ones.

**Docs.** README quick start alternative: `npx dbtruth init`.

#### T1.5 README quick start and troubleshooting (P0)

**Build.** Rewrite the top of `README.md`:

1. Requirements (unchanged).
2. Quick start: put two settings in `.env` at the repository root (or run
   `npx dbtruth init`), run `npx dbtruth doctor`, run `npx dbtruth`.
3. Monorepos (T1.1).
4. Troubleshooting table: one row for every error the CLI can print, with its
   cause and fix: no database URL; could not connect (each doctor sentence);
   read-only warning; no API key; key rejected; model not found; rate limited;
   reply failed validation twice (where the raw reply is); tables skipped over
   budget (`--budget-seconds`); input trimmed to fit the model.
5. Commands: `dbtruth`, `doctor`, `init`, `check`, `mcp`, `--version`, with one
   line each (mark the ones not built yet as "coming in 0.x" until they ship).

**Tests.** A test in `test/readme.test.ts` that collects every string passed to
`opts.err`/`process.stderr` in `src/` that starts an error message and asserts
each appears in the troubleshooting table (so a new error without a row fails
the build). Keep the extraction simple: a list of error ids maintained in one
place is acceptable if the regex approach is brittle.

**Acceptance.**
- A1 Every CLI error message has a troubleshooting row (test).
- A2 Manual: a person who has never seen the tool can follow the quick start on
  the fixture in under five minutes (record the attempt in PROGRESS.md).

**Docs.** This task is docs.

---

### Phase 2: correctness, which is the product

#### T2.1 Unbiased sampling without a catalog estimate (P0)

**Why.** Defects 1 and 2 in section 1. Whenever the catalog has no estimate
(`reltuples` of `-1`, or `0` on Postgres 12 and 13), the tool takes the plain
`LIMIT` path and measures the oldest rows or the first
partition: exactly the bias the Reddit post described, reached through a
different door. Partitioned tables in production almost always have a parent
that autovacuum never analyzes, so this hits real users.

**Build.**

- `extract.ts`, `listRelations`: also read `pg_relation_size(c.oid)` for tables
  and materialized views and `current_setting('block_size')` once. For each
  partitioned parent, one more catalog statement over `pg_partition_tree(oid)`
  (Postgres 12+) returning, over leaf tables only (`isleaf` and relkind `r`):
  each leaf's `reltuples` and pages, so the rules below can tell leaves with a
  known estimate from leaves without one.
- New pure function `estimateRows(...)` (in `extract.ts`, unit-tested). An
  estimate is **unknown** when `reltuples` is `-1` (Postgres 14 and later, never
  analyzed) or when `reltuples` is `0` while the relation has pages on disk
  (Postgres 12 and 13 report `0` before the first `ANALYZE`, and any version
  does for a table analyzed while empty and loaded since). Rules, in order:
  1. A table or materialized view whose estimate is known: that value
     (unchanged behavior).
  2. A partitioned parent (always, whatever its own `reltuples` says) whose
     leaves all have a known estimate: the sum of the leaves' `reltuples`.
     Source `partitions`.
  3. A partitioned parent with some leaves whose estimate is unknown: the known
     leaves' sum, plus the unknown leaves' pages times the rows per page of the
     known leaves. With no known leaf at all, fall through to the pilot on the
     parent, whose pages are the sum of its leaves' pages (a partitioned parent
     has no storage of its own). Source `partitions`.
  4. Unknown estimate and more than zero pages: a **pilot sample**,
     `SELECT count(*) AS n FROM <relation> TABLESAMPLE SYSTEM (p) REPEATABLE (<sampleSeed>)`
     with `p = min(100, 100 * pilotPages / pages)`; rows per page
     `= n / (pages * p / 100)`; estimate `= rows per page * pages`. It goes
     through `db.query` (budgeted). Source `pilot`.
  5. Zero pages, or the pilot failed: `-1`, and the existing plain-path
     handling (including its treatment of a stale `0`) stays as the fallback.
  Views keep `-1` and the plain path.
- `schemas.ts` `Table`: optional `estimateSource: "catalog" | "partitions" | "pilot"`.
  `rowEstimate` keeps its meaning (`-1` unknown). Carry `estimateSource` into
  `TableFacts` (the `Pick` in `schemas.ts`) and set it in `assemble()` in
  `verdict.ts`, so `write.ts` can print
  "~300000 rows (estimated from a sample)" for `pilot`.
- `config.ts`: `pilotPages` (default 100, integer, minimum 1). Comment: too low
  and a table with uneven fill gives a noisy rows-per-page; too high and the
  pilot reads a large share of a mid-sized table. Add it to `overridable`.
- While in `listRelations`: also exclude `pg_temp_%` and `pg_toast_temp_%`
  schemas (temporary tables of other sessions are not the user's schema).

**Edge cases.** A partitioned table with zero partitions. Sub-partitioned tables
(`pg_partition_tree` covers every level; only leaves count). A leaf that is a
foreign table (relkind `f`: not a leaf table here; TABLESAMPLE on the parent may
fail, and the existing fallback to the plain form must still work). A table that
is huge but almost empty after a mass delete (pages high, rows low: the pilot
measures that correctly, which is the point). The pilot returning 0 rows on a
non-empty table (keep the existing "empty sample falls back" behavior). Budget
exhausted before the pilot (estimate stays `-1`, plain path, as today).

**Tests.** New fixture `test/fixtures/sampling.sql` creating database
`sampling`, loaded after the existing files:

- `fresh_big` with `autovacuum_enabled = false`, 300,000 rows inserted after
  the last `ANALYZE`, a `batch` column and a `status` column whose value
  `introduced_late` appears only in the last 5% of rows.
- `ev`, partitioned by year into three leaves (all with
  `autovacuum_enabled = false`), 300,000 rows, a `kind` column whose value
  `only_2026` exists only in the 2026 leaf; `ANALYZE` on the three leaves only.

Assertions:
- `extract()` on `sampling`: `fresh_big.rowEstimate` within 20% of 300,000 with
  source `pilot`; `ev.rowEstimate` within 20% with source `partitions`. These
  must hold on every Postgres in the CI matrix, which covers both the `-1` and
  the `0` form of an unknown estimate.
- The categorical `values` of `fresh_big.status` include `introduced_late`, and
  those of `ev.kind` include `only_2026`. Before the fix both are missing; that
  is the failing test to write first.
- Two runs give the same estimate and the same values (determinism).
- `sampleSource` for both tables is the `TABLESAMPLE` form.
- Unit tests for `estimateRows` covering every rule and edge case above.
- The existing fixture assertions (hit 0.88, 60 orphans, overlap 0.875, ...)
  are unchanged.

**Acceptance.**
- A1 A never-analyzed large table is sampled across its whole file.
- A2 A partitioned table whose parent was never analyzed is sampled across all
  partitions.
- A3 The estimate source is recorded and shown in the per-table file.
- A4 `pilotPages` is a validated tunable with its comment.
- A5 All existing tests pass unchanged.

**Docs.** NOTES section for the release, with the reproduction numbers from
section 1. README "How it works": one sentence on how size is estimated.

#### T2.2 Weak-evidence note for small value ranges (P1)

**Why.** Defect 3. A column with small integer values matches every dense key,
so the hit rate alone cannot tell a real inferred join from a coincidence. The
NOTES rejected two remedies with good reasons (a second sample does not help,
because the coincidence is in the data; a sweep over every compatible target
multiplies statements and reports joins nobody claimed). This task does
neither: it measures how many other keys the same values would fit, and says
so. The verdict does not change; the wording does.

**Build.**

- Applies only to relationships with basis `inferred`, verdict `confirmed`, and
  an integer-typed from-column. Declared foreign keys are enforced by Postgres
  and are skipped. Add `isIntegerType(type)` to `safety.ts`
  (`smallint`, `integer`, `bigint`; do not change `typeFamily`).
- Candidate keys, computed once per run and only when at least one claim
  qualifies: every other relation with a single-column integer primary key and
  a known `rowEstimate > 0`, capped at `weakEvidenceMaxCandidates`. For each:
  `SELECT min(pk) AS lo, max(pk) AS hi FROM <relation>` (an index lookup on the
  primary key; primary key values are visible by the existing rule). A key is
  **dense** when `rowEstimate >= denseKeyShare * (hi - lo + 1)`.
- Per qualifying claim, one statement that compares inside the database and
  returns a count only, never the from-column's own minimum or maximum (R3):
  ```sql
  SELECT count(*) AS also_fits
    FROM (VALUES ($1::numeric, $2::numeric), ($3::numeric, $4::numeric)) k(lo, hi),
         (SELECT min(col) AS lo, max(col) AS hi FROM <same sampled source>) f
   WHERE k.lo <= f.lo AND k.hi >= f.hi
  ```
  with the dense candidates' ranges as parameters (excluding the claimed
  target). The stored query text lists the candidate relation names in a
  comment so a human can rerun it (R7).
- Numbers added to the measurement: `alsoFits`, `candidates`.
- `write.ts` `tableFile`: for such a claim with `alsoFits > 0`:
  `confirmed, 100.0% of 1200 sampled rows match (inferred; the same values would
  also match 5 other keys, so the match alone does not prove this join)`.
- `prompts/write.md`: a relationship with `alsoFits > 0` is not stated as fact;
  it is listed as inferred with that reason.
- CLI summary: `3 confirmed (1 on weak evidence)`. Exit codes unchanged.
- `config.ts`: `denseKeyShare` (default 0.9, range 0 to 1; too low: sparse keys
  count as covering and flag real joins; too high: a key with a few deleted rows
  stops counting) and `weakEvidenceMaxCandidates` (default 50, integer, minimum
  0; 0 disables the check; too high: many small queries on huge schemas).

**Edge cases.** Budget exhausted: no `alsoFits`, and nothing is claimed either
way. A candidate with a null `min` (empty) is skipped. Negative ids. `bigint`
keys beyond 2^53: keep `lo` and `hi` as the strings node-postgres returns, pass
them back as `numeric` parameters, and compute the span for the density test in
SQL (`(max(pk) - min(pk) + 1)::float8`), never by subtracting in JavaScript.

**Tests.** Integration on `fixture` with a canned inferred claim
`order_items.quantity -> products.id`: verdict `confirmed`, `alsoFits = 5`
(customers, orders, order_items, vehicles, products_legacy; `events` has a
composite key and `cars` is empty). The stated `order_items.order_id -> orders.id`
gets no annotation. No number named `lo`, `hi`, `min` or `max` appears in any
measurement (R3). Canary. Unit tests for density and candidate selection.

**Acceptance.**
- A1 The fixture's quantity claim is annotated with `alsoFits = 5`.
- A2 Declared foreign keys are never annotated.
- A3 No minimum or maximum of a claimed column leaves the database.
- A4 The per-table file and the README never state an annotated claim as fact.

**Docs.** NOTES: why this is not a second sample and not a sweep. README "How it
works": one sentence.

#### T2.3 Conditional relationships for polymorphic references (P1)

**Why.** A column such as `commentable_id` points at different tables depending
on `commentable_type`. Measured unconditionally, the match rate splits across
targets and a consistent relationship falls under the 50% bound, or a
coincidence shows 100% (the first live run did the latter). NOTES lists the
conditional join claim as the allowed, name-free fix that was postponed; a
commenter on Reddit hit exactly this with Rails-style schemas.

**Build.**

- `schemas.ts` `RelationshipSchema`: optional
  `when: { column: string, equals: string }`: "from.column refers to to.table
  only where from[when.column] = when.equals". `relationshipId` appends
  `[column=value]` so each branch is its own claim.
- `prompts/contextualize.md`: replace the paragraph that sends polymorphic
  references to a suspicion of kind `other`. New rule: when a column's target
  depends on a categorical sibling column whose values are listed, propose one
  relationship per value with `when`; when the values are not visible, keep the
  old suspicion.
- `safety.ts` `querySampled`: accept bind parameters alongside the statement
  builder.
- `verify.ts` `measureRelationship`: when `when` is set, check that the column
  exists (else unverifiable), then filter the sampled source:
  `(SELECT * FROM <source> w WHERE w.<q(column)>::text = $1)`. The value is a
  bind parameter, never text in the SQL (R8). The stored query ends with a
  comment `-- $1 = '<value>'` so it can be rerun (R7); that comment is display
  only and is never executed.
- `write.ts`: the edge reads `comments.commentable_id -> photos.id when commentable_type = 'photo'`.
- `prompts/write.md`: how to present branches (per branch verdict, never merged).

**Edge cases.** A branch with no rows in the sample (`empty`). A discriminator
value containing quotes or SQL. A discriminator that is not text (compare as
text, as above). The model proposing a `when` on a relationship that is not
polymorphic (it is simply measured).

**Tests.** New fixture `test/fixtures/polymorph.sql`, database `polymorph`:
`posts` (ids 1 to 100), `photos` (ids 1 to 40), and
`comments(id integer primary key, commentable_type text, commentable_id integer)`
with ids 1 to 480: 300 `post` rows with `commentable_id = 1 + i % 100` (all
valid) and 180 `photo` rows with `commentable_id = 1 + i % 60`, so each photo id
from 1 to 60 appears exactly three times and ids 41 to 60 do not exist
(120 of 180 match, 66.7%). Canned claims:

- `comments.commentable_id -> posts.id when commentable_type = 'post'`: confirmed, 100%.
- `comments.commentable_id -> photos.id when commentable_type = 'photo'`: broken, 66.7%.
- The unconditional `comments.commentable_id -> posts.id`: 100% (the photo ids
  1 to 60 happen to exist in `posts`), which documents why the conditional form
  exists. Once T2.2 is in place this claim carries `alsoFits >= 1`, because
  `comments.id` (1 to 480, dense) covers the values 1 to 100.
- A claim whose `equals` is `x'; DROP TABLE posts; --`: `empty`, and `posts`
  still exists afterwards.
- The stored query contains `$1` and not the literal value outside the comment.

**Acceptance.**
- A1 Each branch gets its own verdict with the right numbers.
- A2 The discriminator value is always a bind parameter.
- A3 The per-table file shows each branch with its condition.
- A4 The NOTES "Known limits" entry about unconditional joins is updated.

**Docs.** NOTES, README "How it works", the prompt change recorded in NOTES.

#### T2.4 Where the orphans fall (P1)

**Why.** A commenter asked to separate genuinely optional references from a
real data problem. Nulls are already counted apart from orphans. What is still
missing is the shape of the orphans: values above the highest target key look
like another sequence or parents that were never loaded; values inside the key
range look like deleted parents. The fix for each is different.

**Build.**

- Only when the from-column and the target column are integer-typed and the
  target column leads the target's primary key (so the target's min and max are
  index lookups). In the keyed branch of the join statement add, computed in the
  database and returned as counts only (R3):
  `count(*) FILTER (WHERE <orphan> AND col > (SELECT max(to) FROM <target>)) AS orphans_above`
  and the same with `min` and `<` as `orphans_below`.
- Numbers: `orphansAbove`, `orphansBelow`. In-range orphans are
  `orphans - orphansAbove - orphansBelow`; do not store a third number.
- `write.ts` broken line, factual only: `60 orphans, all above the highest
  customers.id` or `12 orphans, all inside the customers.id range` or the split.
  Advice belongs to prompt B; add a line to `prompts/write.md` explaining what
  each shape usually means and that it is a hint, not a proven cause.

**Tests.** On `fixture`: `orders.customer_id -> customers.id` has
`orphansAbove = 60`, `orphansBelow = 0` (verified by hand for this plan). On
`polymorph`, add `accounts` with ids 1 to 50 except 10 to 19 (never inserted,
as if deleted) and `invoices` with 200 rows, `account_id = 1 + i % 50`: 40
orphans, all inside the range, so `orphansAbove = 0` and `orphansBelow = 0`.
Canary. Existing numbers unchanged.

**Acceptance.**
- A1 Both shapes are measured correctly on the fixtures.
- A2 Only counts leave the database.
- A3 The per-table file states the shape without claiming a cause.

**Docs.** NOTES entry; the README fixture output is regenerated at release.

---

### Phase 3: snapshot and `dbtruth check`, the core of the paid tier

#### T3.1 `context/snapshot.json` (P0)

**Why.** `check` needs to know what the context claimed and what was measured,
in a file that lives in git next to the markdown. Most of it already exists as
`Verified`; it has to be written down, stably.

**Build.**

- `schemas.ts`: `SnapshotSchema` (zod) and its type:

  ```json
  {
    "snapshot": 1,
    "tool": "dbtruth",
    "toolVersion": "0.3.0",
    "database": "fixture",
    "serverVersionNum": 160000,
    "measuredWith": {
      "sampleRows": 50000, "sampleOversample": 3, "sampleSeed": 1, "pilotPages": 100,
      "join": { "confirmed": 0.95, "broken": 0.5 }, "staleAfterDays": 90,
      "duplicateOverlap": 0.7, "categoricalMaxDistinct": 50,
      "categoricalMaxValueLength": 30, "denseKeyShare": 0.9
    },
    "schema": {
      "fingerprint": "sha256:<hex of the canonical schemaOnly() JSON>",
      "relations": [ { "name": "orders", "kind": "table", "columns": [["id", "integer"], ["customer_id", "integer"]] } ]
    },
    "claims": { "...": "exactly Verified.claims" },
    "verdicts": { "...": "exactly Verified.verdicts" }
  }
  ```

  Keys present only once their task has landed (for example `pilotPages` after
  T2.1) are optional in the schema.
- New module `snapshot.ts` (imports `schemas`, `config`; add to the structure
  map): `toSnapshot(verified, extract, cfg, meta)`, `serialize(snapshot)` and
  `parseSnapshot(text)`.
- **Stable output:** keys sorted at every level; relationships and suspicions
  sorted by claim id; relations sorted by name; two spaces of indentation;
  trailing newline. **No timestamp**, so a rerun on an unchanged database
  produces a byte-identical file and git shows only real changes.
- `cli.ts` adds `context/snapshot.json` (the serialized snapshot) to the files
  map it hands to `persist`, so `write.ts` does not need to import
  `snapshot.ts`. In `write.ts`, add `snapshot.json` to `previousOutputs` so it is
  replaced on every run. A failure to write it is reported like any other file.
- `cli.ts`: read `SELECT current_setting('server_version_num')::int` once
  through `db.catalog` (not `SHOW`, which the statement guard refuses).
- `schema.relations` lists every relation the catalog returned, including those
  skipped over budget or dropped to fit the model (marked `"examined": false`),
  and excludes partitions, which their parent stands for. Otherwise `check`
  would report a skipped relation as "not in the context".

**Edge cases.** Claim text containing unicode or newlines (JSON handles it).
A relation whose name needs quoting. A run where contextualize produced no
claims (the snapshot still has the schema, so `check` can detect staleness).

**Tests.** Offline full run on `fixture`: the snapshot exists and validates;
two runs whose canned claims come in different orders produce byte-identical
files; canary absent; `parseSnapshot` rejects wrong versions, missing fields and
files over the size limit (T3.2); the fingerprint changes when a column is
added in a throwaway copy of `fixture_template` and does not change otherwise.

**Acceptance.**
- A1 Every full run writes a valid snapshot.
- A2 The snapshot is byte-stable for the same database and claims.
- A3 It carries nothing that `Verified` does not already carry (canary).

**Docs.** README "Giving it to your agent": commit `context/snapshot.json` too.
NOTES entry.

#### T3.2 `dbtruth check` (P0)

**Why.** This is what a team pays for: every pull request re-measures what the
context says, with no model and no API key, and fails the build when the data
contradicts it.

**Build.**

- Subcommand `check [--snapshot <path>] [--fail-on regression|change|never] [--url] [--env-file]`.
  Default snapshot `context/snapshot.json` relative to the current directory.
- Flow: settings (T1.1) → read and validate the snapshot → `safety.connect` →
  catalog read of every relation (for staleness) → profile only the relations
  the claims name → `verify(db, cfg, extract, snapshot.claims)` → `assemble` →
  `diff(snapshot, fresh)` → report. Add `extractRelations(db, cfg, names, opts)`
  to `extract.ts` for the targeted profile, with `samples: false` (statistics
  and sizes, no value lists, no shown rows); T5.1 reuses it.
- **No model.** `check` never constructs the model and never imports
  `model.ts`; `structure.test.ts` pins that `check.ts` and `snapshot.ts` do not
  import it, and a test runs `check` with no key and a transport that throws.
- **Comparable measurements.** The measurement settings come from
  `snapshot.measuredWith`, not from the current defaults, so a changed default
  in a new release cannot flag a regression. Operational settings (budget,
  statement timeout) still come from config and flags. When `measuredWith`
  differs from the current defaults, print one note.
- **The snapshot is untrusted input** (a pull request can edit it; R8): at most
  10 MB; validated by the zod schema before use; the stored `measurement.query`
  strings are never executed. SQL is always rebuilt from the claims by
  `verify.ts`, where every table and column must exist in the fresh extract.
  A claim naming something that does not exist is reported as stale.
- New module `check.ts` (imports `schemas`, `config`, `extract`, `verify`,
  `verdict`, `snapshot`; never `model`): `remeasure(db, cfg, snapshot)` runs the
  flow above so both `cli.ts` and `mcp.ts` can use it, and `diff()` is a pure
  function that returns a `CheckReport`. Classification per claim id:

  | Old → new | Class | Fails with `regression` | Fails with `change` |
  |---|---|---|---|
  | relationship confirmed → broken | regression | yes | yes |
  | relationship confirmed or broken → rejected | regression | yes | yes |
  | suspicion rejected → confirmed (new problem) | regression | yes | yes |
  | claim names a table or column that no longer exists | stale | yes | yes |
  | relation in the database that the snapshot does not have | stale | yes | yes |
  | relationship broken → confirmed; suspicion confirmed → rejected | improved | no | yes |
  | same status, hit rate moved by at least `checkHitRateTolerance` | drift | no | yes |
  | measured before, unverifiable now (timeout, budget) | not measured | no | no |
  | anything → empty, or empty → anything | changed | no | yes |
  | same status, same band | unchanged | no | no |

  "not measured" never fails a build: a slow database must not block merges.
  It is always reported.
- Exit codes: 0 pass; 2 fails under `--fail-on`; 1 could not run (no snapshot,
  invalid snapshot, snapshot from a newer dbtruth, no database).
- Human report on stderr: one line per regression and stale item, then counts
  per class, then the fix: `run npx dbtruth and commit context/`.
- `config.ts`: `checkHitRateTolerance` (default 0.01, range 0 to 1). Comment: too
  low and normal growth flags drift on every pull request; too high and a slow
  decay goes unnoticed.

**Edge cases.** An empty snapshot (no claims): only staleness is checked. A
database renamed (the name differs from the snapshot: note, not a failure). A
column type change on a claimed column (the fingerprint differs; the claim is
re-measured; the text fallback handles type mismatches). Claims that were
`empty` because a table had no rows and now it has rows (changed).

**Tests.** Unit: `diff()` for every row of the table above, plus unknown
statuses and a snapshot with duplicate ids. Integration (each in its own
throwaway copy of `fixture_template`, dropped afterwards):

1. Unchanged database: full offline run, then `check` → exit 0, every status
   equal, every hit rate identical (`REPEATABLE` sampling).
2. Regression: drop the foreign key `order_items_order_id_fkey` and move every
   fifth `order_id` out of range → `order_items.order_id -> orders.id` goes
   confirmed → broken, exit 2, and the stderr line names the claim and both hit
   rates.
3. Stale: drop `cars` → stale claims, exit 2. Add a table → stale "not in the
   context", exit 2.
4. Improvement: insert the 60 missing customers (the ids the orphan orders
   point at; the orphan orders cannot be deleted because `order_items`
   references every order) → broken → confirmed, exit 0, reported.
5. `--fail-on never` → exit 0 with the regressions still reported;
   `--fail-on change` → drift and improvements fail.
6. No snapshot → exit 1 with `no context/snapshot.json: run npx dbtruth first`.
   Invalid JSON, wrong shape, `snapshot: 99`, 11 MB file → exit 1 with a
   specific message each.
7. Hostile snapshot: a claim whose table is `orders"; DROP TABLE customers; --`
   and a verdict whose query is `SELECT pg_sleep(60)` → the claim is stale, the
   run finishes in seconds, and `customers` still exists.
8. No API key and a throwing transport → still exit 0 on the unchanged copy.
9. Canary absent from every output; stdout clean without `--json`.
10. Runs as the `reader` role.
11. Time: `check` on `fixture` finishes in under 5 seconds.

**Acceptance.**
- A1 Unchanged database: exit 0 with identical numbers.
- A2 Every classification row behaves as the table says (unit and integration).
- A3 No model, no API key, no network (R9).
- A4 A hostile snapshot cannot run SQL or reach anything outside the claims.
- A5 Exit codes as specified.

**Docs.** README section "Keeping context true: dbtruth check" with the exit
codes and the table above in short form. NOTES entry, including why stored
queries are never executed.

#### T3.3 `check` reports: JSON and Markdown (P1)

**Build.**

- `--json`: the `CheckReport` on stdout (zod schema exported, `report: 1`
  version field). Nothing else on stdout.
- `--markdown <path>`: writes a pull request comment body to that path. It
  starts with the marker `<!-- dbtruth-check -->`, then one summary line
  (`dbtruth: 1 regression, 1 stale, 12 unchanged`), then a table of regressions
  and stale items (claim, before, after, hit rates), then a collapsed
  `<details>` block for drift and improvements, then the fix line. At most 50
  rows, then "and N more".
- Both formats contain only names, statuses, counts and rates (R3).

**Tests.** Snapshot tests of the Markdown for a fixed report; the JSON validates
against its schema; canary; row cap; the marker is the first line.

**Acceptance.**
- A1 `--json` output validates and stdout has nothing else.
- A2 The Markdown matches the documented structure and stays under the row cap.

**Docs.** README: both flags with an example comment.

---

### Phase 4: the GitHub Action

#### T4.1 GitHub Action (P1)

**Why.** Teams do not run a CLI by hand on every pull request. The Action is the
thing a team installs, sees in every pull request, and later pays for.

**Build.**

- A separate public repository `dbtruth-action`, because GitHub Marketplace
  expects one action per repository with `action.yml` at its root (confirm the
  current Marketplace requirements when publishing).
- `action.yml`, a composite action, every step `shell: bash`:
  - inputs: `database-url` (required), `working-directory` (default `.`),
    `fail-on` (`regression`), `comment` (`on-change`, or `always`, `never`),
    `dbtruth-version` (pinned to the release that ships `check`), `license-key`
    (empty; used from T6.2).
  - outputs: `result` (`pass`, `fail`, `error`, `skipped`), `regressions`,
    `stale`.
  - steps: set up Node (the current major of `actions/setup-node`, pinned by
    commit SHA like every third-party action); if `database-url` is empty, print
    a notice that the secret is not available (a pull request from a fork) and
    finish with `result=skipped` and exit 0; run
    `npx -y dbtruth@<version> check --fail-on <fail-on> --json --markdown "$RUNNER_TEMP/dbtruth.md" > "$RUNNER_TEMP/dbtruth.json"`
    with `set +e`, keeping the exit code; parse the JSON for the outputs; post
    or update the comment; exit with the kept code (2 becomes a failed job, 1
    becomes `error`).
  - comment script `scripts/comment.sh`: on `pull_request` events only; find an
    existing comment whose body starts with `<!-- dbtruth-check -->` through
    `gh api .../issues/<number>/comments --paginate`; update it with PATCH, or
    create one; `on-change` skips creating a comment when everything is
    unchanged but still updates an existing one to the all-clear text.
- Example workflow in the dbtruth README:

  ```yaml
  name: dbtruth
  on: pull_request
  permissions:
    contents: read
    pull-requests: write
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@<sha>
        - uses: FilipKalcic1/dbtruth-action@v1
          with:
            database-url: ${{ secrets.DBTRUTH_DATABASE_URL }}
  ```

- Security guidance in both READMEs, stated plainly: the secret should be a
  read-only role on a replica or staging database, never an owner role on
  production; use `pull_request`, never `pull_request_target` with a checkout of
  the pull request's code; forks get no secrets and are skipped by design.
- Main repository: `scripts/make-fixture-snapshot.mjs` runs `run()` on the
  fixture with the canned transport and writes `context/snapshot.json`, so the
  action's tests have a snapshot without a model.

**Edge cases.** `gh` missing on a self-hosted runner (fail with a clear
message, only when commenting). A comment longer than GitHub's limit (T3.3's
row cap keeps it short; assert the byte size). A workflow without
`pull-requests: write` (comment step prints the permission to add and does not
fail the job). `check` exit 1 (`error`: fail the job, comment says the check
could not run and why).

**Tests.** In `dbtruth-action`, `.github/workflows/test.yml` with a Postgres
service loading the fixture SQL vendored at the pinned dbtruth tag, and the
snapshot from `make-fixture-snapshot.mjs` committed under `test/`:

- pass: unchanged database → `result=pass`, exit 0;
- fail: apply `test/regress.sql` (the T3.2 regression) → `result=fail`, job step
  failed (checked with `continue-on-error` and an assertion step);
- skipped: empty `database-url` → `result=skipped`, exit 0;
- error: wrong password → `result=error`, and the password is absent from the
  log;
- `comment.sh` unit test with a fake `gh` on `PATH` that records calls: creates
  once, updates on the second run, never creates two.

Manual (record links in PROGRESS.md): on a real test pull request in the action
repository, push twice and confirm one comment that updates.

**Acceptance.**
- A1 The four automated scenarios pass in the action repository's CI.
- A2 One comment per pull request, updated in place.
- A3 Forks are skipped without failing.
- A4 The database password never appears in logs or comments.

**Docs.** Action README (inputs, outputs, permissions, security, example);
dbtruth README "CI" section; Marketplace listing text (HUMAN publishes).

---

### Phase 5: agent integration without an API key

#### T5.1 `dbtruth mcp` (P1)

**Why.** An agent inside Claude Code or Cursor can ask dbtruth to measure a join
before writing it. No model call happens on our side, so the user needs no
separate API key and pays nothing extra: the agent's own subscription does the
thinking, dbtruth does the measuring.

**Build.**

- Dependency: `@modelcontextprotocol/sdk`, pinned to an exact version (1.30.1
  was current on 2026-09-23; use the then-current stable). New module `mcp.ts`,
  the only importer of that SDK (R2, pinned in `structure.test.ts`).
- Subcommand `mcp [--url] [--env-file] [--project <dir>]`: stdio transport.
  Settings are discovered from `--project` or else the working directory the
  client starts the server in (T1.1). Server name `dbtruth`, version from
  `package.json`.
- stdout carries the MCP protocol and nothing else (R6): every log line goes to
  stderr; a test fails if any other byte reaches stdout.
- One database connection, opened on the first tool call that needs it, reused,
  closed on exit and on SIGINT and SIGTERM. Tool calls that touch the database
  run one at a time. Add `resetBudget(seconds)` to `Db` in `safety.ts` so each
  call gets its own budget (`mcpCallBudgetSeconds` in config, default 20; too low:
  measurements on big tables are skipped; too high: an agent waits on a slow
  call).
- Reuse `extractRelations` from T3.2 so each call profiles only the relations
  it names (a whole-database extract per call would be slow on large schemas).
- Tools (descriptions written for an agent, stating when to use each):
  - `context { table?: string }`: returns `context/README.md`, or
    `context/tables/<table>.md` (path through `confine()`), from disk, no
    database. If `context/` does not exist, says to run `npx dbtruth`.
  - `describe_table { table: string }`: key, foreign keys, size estimate and
    source, and per column: type, null rate, distinct count, and values only
    when the visibility rule allows (R3).
  - `measure_join { from_table, from_column, to_table, to_column, when_column?, when_equals? }`:
    builds a one-claim `Claims` object and runs the same `verify` and `decide`
    as a full run, with the same settings. Returns status, the numbers, the
    query, and one sentence: confirmed (an inner join keeps the sampled rows),
    broken (use LEFT JOIN or filter the orphans on purpose, with counts),
    rejected (not a relationship), empty or unverifiable (the reason).
  - `check {}`: runs T3.2 against `context/snapshot.json` and returns the
    report.
- Every input validated with zod; table and column names must exist in the
  catalog before any SQL is built (R8); unknown names return `isError` with the
  closest existing names (names are schema, not data).

**Edge cases.** Tool call before `.env` exists (clear error, server stays up).
Database unreachable (error per call; the server does not exit). The schema
changing during a session (catalog read on every call). Two tool calls at once
(serialized). Windows (`npx` launched through `cmd /c` by the client; document
it).

**Tests.** Spawn `tsx src/cli.ts mcp` and drive it with the SDK's `Client` and
`StdioClientTransport`:

- `listTools` returns exactly the four tools with their input schemas;
- `measure_join` for `orders.customer_id -> customers.id` on `fixture` returns
  broken with hit 0.88 and 60 orphans, the same numbers as a full run;
- unknown table or column → `isError`; in an in-process test of the exported
  tool handlers, a recording wrapper around the `Db` interface shows that no
  statement was issued (a spawned server cannot be given a test double);
- names containing quotes and semicolons → rejected by the catalog lookup;
- `when_equals` with SQL in it → bound parameter, `empty`;
- `describe_table customers` → `email` hidden, canary absent from every
  response of every tool;
- `context` before and after an offline full run;
- `check` → pass on the unchanged fixture;
- no `ANTHROPIC_API_KEY` in the environment; every stdout line parses as
  JSON-RPC; SIGTERM mid-call leaves no open connection (check
  `pg_stat_activity` for `application_name = 'dbtruth'`);
- the installed package starts `dbtruth mcp` (package smoke test).

**Acceptance.**
- A1 The four tools work against the fixture with the numbers of a full run.
- A2 No hidden value in any response (canary), no model call, no API key needed.
- A3 Untrusted input never becomes SQL text.
- A4 stdout is protocol only.

**Docs.** README "Use it from your agent":
`claude mcp add --transport stdio dbtruth -- npx -y dbtruth mcp` (all options go
before the server name; `--` separates the server's own command), a project
`.mcp.json` example, and a Cursor example. Verify the exact syntax against the
current Claude Code and Cursor documentation when writing it. NOTES entry.

#### T5.2 Skill (P1)

**Why.** The MCP server gives the agent tools; the skill tells it when to use
them. It is also how people discover dbtruth inside their agent.

**Build.**

- `skills/dbtruth/SKILL.md` in the repository, added to `files` in
  `package.json` and copied by the build. Draft text in Appendix D. Keep it under
  5,000 characters.
- `dbtruth init --skill` installs it to `.claude/skills/dbtruth/SKILL.md` (T1.4).
- Verify the current skill format (frontmatter fields, folder layout) against
  the official Claude Code documentation before release.

**Tests.** Frontmatter parses; `name` equals the folder name; description
present and under 1,024 characters; body under 5,000 characters; every tool
name the skill mentions exists in the MCP server's tool list (read from
`mcp.ts` or by listing tools), so the two cannot drift apart; the file is in the
tarball.

**Acceptance.**
- A1 The skill installs with `init --skill` and is in the package.
- A2 It names only tools that exist.
- A3 Manual: in Claude Code with the MCP server added, asking "write a query
  joining orders to customers" leads the agent to read context or call
  `measure_join` before answering (record the transcript excerpt).

**Docs.** README "Use it from your agent": the skill.

#### T5.3 Optional, only if offered: a Claude Code backend for the model calls (P2)

stepolan offered a `DBTRUTH_BACKEND=claude-code` transport that sends the two
model calls through `claude -p`, billed to the user's own Claude subscription.
`Transport` is already injectable, so it fits in `model.ts`. Accept it only as a
pull request, opt-in by environment variable, with a README note that it is for
personal, local use (his own caveat about Claude Code's usage terms), and with
tests using a fake `claude` binary on `PATH`.

---

### Phase 6: the paid tier

#### T6.1 Team section and waitlist in the README (P0 text; HUMAN price and form)

**Build.** A short README section after "CI": what the Team tier is (the Action
on private repositories, pull request comments, the regression gate), what stays
free forever (CLI, `check`, `doctor`, `init`, `mcp`, the skill, the Action on
public repositories), the promise that no database content ever passes through
a server of ours, `PRICE_TBD` as a placeholder, and a link placeholder
`WAITLIST_URL`.

**HUMAN.** Decide the price. Create the waitlist form (email only). Replace both
placeholders.

**Acceptance.**
- A1 The section exists with both placeholders, or with real values once the
  human provides them.
- A2 Nothing in the text promises a feature that is not built or planned here.

#### T6.2 License check in the Action (P2)

**Build.**

- Only when the repository is private (`github.event.repository.private`).
  Public repositories never need a key.
- `scripts/license.sh` in `dbtruth-action`: sends the `license-key` input and the
  repository id (nothing else, and never any database content) to the chosen
  provider's license validation endpoint with a 5-second timeout. HUMAN chooses
  the provider in T6.3; Lemon Squeezy and Polar both document license-key
  validation APIs, so verify the current API when implementing.
- Valid: continue. Invalid or expired: fail the job with one sentence and the
  purchase link. Timeout, network error or a 5xx answer: print a warning and
  continue. **Fail open**: an outage on our side must never block a customer's
  merge.
- The CLI, `check` and `mcp` never check a license (R9).

**Tests.** A small fake license server started inside the action's test
workflow: valid, invalid, expired, timeout, 500, and a public repository (no
call made).

**Acceptance.**
- A1 Every scenario behaves as described.
- A2 Only the key and the repository id are sent.

**Docs.** Action README "Private repositories". NOTES entry for the R9
exception.

#### T6.3 Business setup (HUMAN)

The agent prepares a checklist in `PROGRESS.md`; a person does these:

1. Choose a merchant of record that handles VAT for customers worldwide and
   issues license keys (for example Lemon Squeezy, Paddle or Polar; compare
   fees and license-key support at the time).
2. Register the business and the tax setup with an accountant (Croatia).
3. Create the product and the price; set the waitlist and purchase links.
4. Terms of service and a privacy page that says no data is collected.
5. Publish the Action on GitHub Marketplace; publish npm releases with 2FA.
6. A support email address.

---

### Phase 7: releases

#### T7.1 Releases 0.2.0, 0.3.0 and 0.4.0 (with each phase)

| Release | Contains |
|---|---|
| 0.2.0 | T1.1 to T1.5, T2.1 (and T2.2 to T2.4 if done) |
| 0.3.0 | T3.1 to T3.3; `dbtruth-action` v1 (T4.1) |
| 0.4.0 | T5.1, T5.2; T6.2 when the paid tier opens |

**Checklist for every release** (each step recorded in PROGRESS.md):

1. `npm run verify` green locally and on every CI matrix cell.
2. `npm run acceptance` prints 100 for every task in the release.
3. `npm pack --dry-run` lists `dist/`, `dist/prompts/`, `skills/` (from 0.4.0),
   `README.md`, `LICENSE`, and nothing from `src/`, `test/` or `context/`.
4. `CHANGELOG.md` entry (create the file at 0.2.0) and a `NOTES.md` section.
5. README fixture output regenerated from a live run (NOTES says the pasted
   output predates 0.1.8). Needs `ANTHROPIC_API_KEY`: HUMAN if the agent has
   none.
6. Version bump, tag `v<version>`, GitHub release notes.
7. `npm publish` (HUMAN, 2FA).
8. Smoke test of the published package in an empty directory:
   `npx -y dbtruth@<version> --version`, `doctor` against the fixture, and from
   0.3.0 `check` against the committed fixture snapshot.
9. Manual acceptance (section 5.5) recorded in NOTES.

---

## Appendix A: files this plan adds or changes

| File | Task |
|---|---|
| `package.json` (scripts, `files`, MCP SDK dependency) | T0.1, T5.1, T5.2 |
| `scripts/pack-smoke.mjs`, `scripts/acceptance.mjs`, `acceptance/checks.json`, `acceptance/manual.json`, `PROGRESS.md` | T0.1 |
| `.github/workflows/ci.yml` | T0.2 |
| `src/safety.ts` (`findDotEnv`, `isIntegerType`, `querySampled` parameters, `resetBudget`) | T1.1, T2.2, T2.3, T5.1 |
| `src/cli.ts` (`--env-file`, `--version`, subcommands, summary line) | T1.1 to T1.4, T2.2, T3.1, T3.2, T5.1 |
| `src/doctor.ts` | T1.3 |
| `src/extract.ts` (`estimateRows`, partition catalog read, `extractRelations`) | T2.1, T3.2 |
| `src/verify.ts` (conditional joins, weak evidence, orphan shape) | T2.2 to T2.4 |
| `src/verdict.ts` (`assemble()` carries `estimateSource`; verdict rules unchanged) | T2.1 |
| `src/schemas.ts` (`estimateSource`, `when`, `SnapshotSchema`, `CheckReport`) | T2.1, T2.3, T3.1, T3.3 |
| `src/config.ts` (new tunables, Appendix C) | T2.1, T2.2, T3.2, T5.1 |
| `src/write.ts` (per-table wording, `snapshot.json` in `previousOutputs`) | T2.1 to T2.4, T3.1 |
| `src/prompts/contextualize.md`, `src/prompts/write.md` | T2.2 to T2.4 |
| `src/snapshot.ts`, `src/check.ts` | T3.1, T3.2 |
| `src/mcp.ts` | T5.1 |
| `skills/dbtruth/SKILL.md` | T5.2 |
| `test/fixtures/sampling.sql`, `test/fixtures/polymorph.sql`, `fixture_template` in init | T2.1, T2.3, T3.2 |
| `docker-compose.yml` (new init files) | T2.1, T2.3, T3.2 |
| `test/*.test.ts` (new files per task, `structure.test.ts` map) | every task |
| `README.md`, `NOTES.md`, `CHANGELOG.md` | every task |
| `scripts/make-fixture-snapshot.mjs` | T4.1 |
| repository `dbtruth-action` | T4.1, T6.2 |

## Appendix B: `structure.test.ts` dependency map after this plan

```
cli.ts         config, safety, extract, contextualize, verify, verdict, write,
               schemas, model, doctor, snapshot, check, mcp
config.ts      (none)
safety.ts      (none)                      only importer of pg
model.ts       config                      only importer of @anthropic-ai/sdk
extract.ts     safety, config, schemas
contextualize.ts model, schemas
verify.ts      safety, schemas, config
verdict.ts     config, schemas
write.ts       model, schemas
schemas.ts     (none)
doctor.ts      safety, model, config
snapshot.ts    schemas, config
check.ts       schemas, config, extract, verify, verdict, snapshot
mcp.ts         config, safety, extract, verify, verdict, schemas, snapshot,
               check, write                only importer of @modelcontextprotocol/sdk
```

Add two assertions: `check.ts`, `snapshot.ts` and `mcp.ts` never import
`model`; only `mcp.ts` imports the MCP SDK. (`write.ts` imports `model` for types
only, which TypeScript erases, so `mcp.ts` importing `confine` from `write.ts`
loads nothing from the Anthropic SDK at runtime.)

## Appendix C: new tunables in `config.ts`

Each needs its comment, a range in `overridable`, a `DBTRUTH_*` variable and a
flag (R5).

| Name | Default | Range | Task |
|---|---|---|---|
| `pilotPages` | 100 | integer, at least 1 | T2.1 |
| `denseKeyShare` | 0.9 | 0 to 1 | T2.2 |
| `weakEvidenceMaxCandidates` | 50 | integer, at least 0 (0 disables) | T2.2 |
| `checkHitRateTolerance` | 0.01 | 0 to 1 | T3.2 |
| `mcpCallBudgetSeconds` | 20 | above 0 | T5.1 |

## Appendix D: draft of `skills/dbtruth/SKILL.md`

```markdown
---
name: dbtruth
description: Use before writing, reviewing or debugging SQL against this project's Postgres database. Reads context that was measured against the real data, and measures a join before you rely on it.
---

# Verified database context (dbtruth)

This project keeps measured facts about its Postgres database in `context/`,
and the dbtruth MCP server measures more on demand. Anything marked confirmed
was checked against the data. Anything marked (inferred) was not.

## Before writing SQL

1. Read `context/README.md` once per task. Broken relationships come first
   because they matter most.
2. For every table the query touches, read `context/tables/<table>.md`, or call
   the `context` tool with the table name.
3. Before joining on columns that those files do not list as confirmed, call
   `measure_join`. Use `describe_table` for columns, keys and allowed values.

## Acting on what you find

- broken: do not use an inner join without a reason. Use LEFT JOIN, or filter
  the orphans on purpose, and tell the user how many rows are affected.
- rejected: the columns do not relate; find the right key.
- inferred, empty or unverifiable: never present it as fact; say it is
  unverified.
- inconsistent values such as `shipped` and `SHIPPED`: compare with
  `lower(btrim(column))`, or use a view that already normalizes.
- dead tables: do not read current data from them.

## Keeping it current

If the `check` tool reports stale or regressed items, tell the user to run
`npx dbtruth` and commit `context/`. Never edit files in `context/` by hand.

## Never

- Never run `npx dbtruth --reveal`: it sends real column values to a model.
  Only the user decides that.
- Never print connection strings or other secrets.
```

## Appendix E: commands and exit codes after this plan

```
npx dbtruth [--url] [--env-file] [--no-samples] [--reveal <t.c>] [--json] [--model-effort <level>] [tunables]
npx dbtruth doctor [--url] [--env-file]
npx dbtruth init [--skill] [--force]
npx dbtruth check [--snapshot <path>] [--fail-on regression|change|never] [--json] [--markdown <path>] [--url] [--env-file]
npx dbtruth mcp [--url] [--env-file] [--project <dir>]
npx dbtruth --version
npx dbtruth --help
```

| Command | 0 | 1 | 2 |
|---|---|---|---|
| `dbtruth` | nothing an agent must know | could not run | findings (broken join, confirmed suspicion) |
| `doctor` | ready | something to fix | not used |
| `init` | done | could not write | not used |
| `check` | passes under `--fail-on` | could not run | fails under `--fail-on` |
| `mcp` | clean shutdown | could not start | not used |
