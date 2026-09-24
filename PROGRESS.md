# PROGRESS

Every iteration of every task in `BUILD_PLAN.md`, with its score and the cause
of each lost point, in the format of section 4.7 of the plan.

## T0.1 Verification harness and scoring script
### Iteration 1: 83/100
- Tests first: `test/acceptance.test.ts` did not load, because
  `scripts/acceptance.mjs` did not exist. Against a stub whose `score()`
  returned 100 for anything and which printed nothing, all eleven tests failed
  on their own assertions: no PASS or FAIL line in the output, `100 !== 40`
  for a failing gate, `100 !== 0` for a task with no checks, no `test:unit`
  script to read.
- `npm run verify` exits 0: 80 tests, 78 pass, the 2 live tests skipped, and
  the package smoke test passes. `npm run test:unit` passes its 60 tests with
  the fixture container stopped. Every command and file check of T0.1 passes.
- Checked by hand: a hanging check (a shell, a node, and a node it started)
  is killed at 1 s with nothing left running, on Windows and under Linux in
  `node:22-alpine`. The smoke test fails naming the cause for a tarball
  without `dist/prompts` and for an installed binary that crashes or prints
  nothing.
- Lost A2 (-12.5): no evidence. Blocked on the sabotage record: the evidence
  is the line `T0.1: 100/100` from a real run, and no run can print it while
  the sabotage item is open. Next, once the sabotage is recorded: fill A2 in
  the two steps NOTES.md describes under 0.2.0.
- Lost Tests (-4): no sabotage record; the sabotage check is done by a later
  stage.
- 83.5 floored to 83.
- Seen once, before any change: one failure in the database test files that
  did not recur in nine further runs. Its output was not kept, so which test
  it was is unknown.
### Iteration 2: 67/100
- Fixed after review, each in `scripts/acceptance.mjs` unless named:
  - The sabotage record is the condition of the tests part, not one share of
    it (4.2, 4.5). Iteration 1's 83 counted it as a share; by the plan that
    run scored 67.
  - A manual item in gates or invariants is refused; evidence could pass the
    gate.
  - Parts are added as one exact fraction: thirds added as floats gave 79 for
    an exact 80.
  - Runs are shared per command and timeout, not per command, so no check is
    judged on a run killed at another check's limit.
  - At the timeout the output is closed after the kill, and a failed kill is
    named in the reason. A node started detached by a node that had exited
    kept the run waiting its full 60 s, and under Linux the kill's ESRCH was
    thrown out of the timer.
  - Any error reading `checks.json` or `manual.json` names the file; a bad
    regex printed only the regex.
  - `lf()` removed: the m flag already matches `$` before `\r\n`, and the
    test that claimed to cover it passed without it.
  - `acceptance/checks.json`: A3 reads the smoke test's line from the verify
    run, so a run packs and installs the tarball once, not twice; the canary
    invariant runs all of `test/integration.test.ts`, not one test of it;
    the README is checked for each new script after `## Development`.
  - `scripts/pack-smoke.mjs` matches the forbidden names in every path
    segment. A `dist/.env` and a `dist/test/x.js` placed by hand fail it
    (`contains dist/.env`), which the prefix match let through.
- Each new test was run with its change undone and failed: 100 instead of 80
  ("section 4.5: no record, no test points"), 79 instead of 80 ("20/3 + 10/3
  is a whole 10"), one run instead of two for two timeouts, a gate item
  scored instead of refused, a regex error without its file, "the sleeping
  node, two levels down, was killed with the shell" with `/T` removed, and
  60 s for the escape test without closing the output.
- `npm run verify` exits 0: 82 tests, 80 pass, the 2 live tests skipped, and
  the package smoke test passes. `npm run test:unit` passes its 62 tests.
  Both hang shapes behave the same under Linux (`node:22-alpine` with
  `--init`; the escape reason there is `kill ESRCH`). Without an init the
  killed node stays a zombie and the pid check reads it as alive, as the
  test's comment says.
- Lost A2 (-12.5): no evidence; blocked on the sabotage record, as in
  iteration 1.
- Lost Tests (-20): no sabotage record; the sabotage check is done by a later
  stage.
- 67.5 floored to 67.
- Sabotage: removed the gate rule from `score()` (`return Math.floor(num /
  den)`); "a failing gate or invariant caps the score at 40" failed with "85
  without the cap ... 85 !== 40". Restored.
- Sabotage: at the timeout the timer marked the check timed out and returned
  before the kill; "a process the kill cannot reach does not keep the run past
  the timeout" failed with "took 60.4s: the run waited for the process that
  outlived the command". "a check that hangs is killed with its whole process
  tree at its timeout, and fails" stayed green: its sleeper ended on its own
  after 60 s, before the pid check. It now asserts that the run ends within
  20 s, and under the same sabotage failed with "took 60.4s: the hanging
  command was waited out, not killed at its timeout". Restored.
- Sabotage: a part with no checks earned its whole weight instead of nothing;
  "a task with no checks scores 0, not 100" failed with "100 !== 0", and five
  other tests with it. Restored.
- Sabotage: the tests part earned its points without the sabotage record
  (`const points = weight`); "without a written sabotage record the tests part
  earns nothing, and the record is not a share of it" failed with "section
  4.5: no record, no test points", the run printing `T9.1: 100/100`. Restored.
- Sabotage: inverted the exit check in `judge()` (`r.code ===
  entry.expectExit`); "one passing and one failing check: the score is below
  100 and the output names the failing check" failed with "The input did not
  match the regular expression /^PASS T9\.1 A1 acceptance$/m", the run
  printing `FAIL T9.1 A1 acceptance: exit 0, expected 0`. Restored.
- Each file was restored from a copy kept outside the repository and matched
  it byte for byte (`cmp`); `git diff HEAD` shows nothing for it before or
  after, because it is untracked.
### Iteration 3: 87/100
- Scored with iteration 2's sabotage record in `acceptance/manual.json`. Every
  check and item passes except A2.
- Lost A2 (-12.5): `FAIL T0.1 A2 acceptance: no evidence for: npm run
  acceptance -- --task T0.1 prints 100. ...`. Cause: A2's evidence stays
  empty until everything else passes (NOTES.md, 0.2.0), and this is the first
  run in which everything else did. Next: step one of the fill, with this
  run's result as the evidence.
- 87.5 floored to 87.
### Iteration 4: 100/100
- A2 filled in the two steps of NOTES.md, 0.2.0. With the evidence "the run
  printed T0.1: 87/100, every check and item passing but this one", the next
  run printed `T0.1: 100/100` and exited 0, and the evidence is now that line.
  Nothing else changed.
- `npm run verify` exits 0: 82 tests, 80 pass, the 2 live tests skipped, and
  the package smoke test passes. `npm run acceptance -- --task T0.1` then
  printed `T0.1: 100/100` with the final evidence, all 20 lines PASS, exit 0.
- Sabotage: iteration 2's five cover this code, because `scripts/acceptance.mjs`
  and `test/acceptance.test.ts` have not changed since. One more sabotage, a
  `judge()` that passes a manual item whatever its evidence (A2's 100 depends
  on empty evidence failing), was not run: this session was not allowed to
  make the edit.
- Commit: `T0.1: Verification harness and scoring script (score 100)`,
  3e910f0, made by the lead after rerunning the score (100/100).

## T0.2 CI for this repository
### Iteration 1
- `.github/workflows/ci.yml`: Postgres 12, 14, 16, 18 by Node 20, 22, a
  service container per cell on port 54329, fixtures loaded with `psql` in the
  order `docker-compose.yml` lists them, then `npm run verify`. Actions pinned
  by commit (checkout v7.0.1, setup-node v7.0.0).
- `test/ci.test.ts` (in `test:unit`): the matrix starts at the README's minimum
  Postgres and Node, and every fixture file is mounted in `docker-compose.yml`,
  where CI reads the load order.
- Sabotage: dropped "12" from the Postgres matrix; "CI runs the oldest Postgres
  and Node the README promises, and the newest" failed with "Expected values to
  be strictly deep-equal". Removed the scale.sql mount from docker-compose.yml;
  "every fixture file is an init script of docker-compose.yml, which CI loads
  in the same order" failed ("a fixture file that is not mounted is loaded
  neither by docker compose nor by CI"). Both files restored from copies; `git
  diff` showed nothing for docker-compose.yml.
- A1 and A2 need GitHub: the branch is pushed so CI runs; A1 is earned only on
  `main`, after a merge.
### Iteration 2: 100/100
- A1: https://github.com/FilipKalcic1/dbtruth/actions/runs/35908505808, all
  eight cells green on `main` after PR #3 merged; 82 tests pass and the 2 live
  tests are skipped in each.
- A2: https://github.com/FilipKalcic1/dbtruth/actions/runs/35907874085, branch
  `ci-sabotage` with one assertion in `test/config.test.ts` changed from "low"
  to "high": red in all eight cells, each on "effort follows schema size ...",
  expected 'high', actual 'low'. The branch is deleted, locally and on GitHub.
- CI found a flaky test at once. The pull request run of the same commit
  (https://github.com/FilipKalcic1/dbtruth/actions/runs/35908401679) failed
  one cell, Postgres 14 and Node 22, on T0.1's "a check that hangs is killed
  with its whole process tree at its timeout, and fails": "Missing expected
  exception: the sleeping node, two levels down, was killed with the shell".
  Cause: under Linux a killed process stays a zombie until its new parent
  reaps it, and the test asked once, right after the run returned. It now
  waits up to 5 s for the process to be gone; a sleeper that was not killed
  lives 60 s, so the test still tells the two apart.


## T1.2 `--version`
### Iteration 1: 80/100
- Tests first: `test/cli.test.ts` (new, in `test:unit`) failed with
  "--version: error: unknown option '--version'" and `'' !== '0.1.8\n'`:
  commander had no version option, so it refused the flag, printed nothing on
  stdout and exited 1. The package smoke test, with its new `--version` step,
  failed after the `--help` line with `pack-smoke: FAIL Command failed:
  "node_modules\.bin\dbtruth" --version` and `error: unknown option
  '--version'`.
- `main()` reads the version from the `package.json` one directory above the
  running file and passes it to `.version(version, "-v, --version")`. Both
  paths checked by hand as well: `node dist/cli.js --version` run from
  another directory printed `0.1.8` and a newline and exited 0, and
  `npx --no-install dbtruth --version` in a scratch project with the packed
  tarball installed printed `0.1.8` and exited 0.
- `npm run verify` exits 0: 85 tests, 83 pass, the 2 live tests skipped, and
  the smoke test prints `pack-smoke: the installed dbtruth --version prints
  0.1.8, the version in package.json`. `npm run acceptance` over every task:
  T0.1 still 100/100, T0.2 still 50/100 (its CI links), T1.2 80/100 with every
  check passing.
- Lost Tests (-20): no sabotage record; the sabotage check is done by a later
  stage.
### Iteration 2: 80/100
- Fixed after review:
  - The task's Docs item is the README commands list, and the README had
    none: the line went into the Quick start paragraph, and the docs check
    matched it anywhere in the file. A `## Commands` section after Quick start
    now lists `npx dbtruth` and `npx dbtruth --version`, one line each, for
    T1.5 to extend, and the check wants the line under that heading. Against
    iteration 1's README it fails.
  - `test/cli.test.ts` states its time limit (plan 5.3, item 5): each run is
    killed at 20 s and fails with `spawnSync ... ETIMEDOUT`, where a hang
    would have blocked `test:unit` with no message. That message was checked
    on a node that sleeps past the limit.
  - `test/cli.test.ts` runs the CLI with `DATABASE_URL` empty. A flag that
    fell through to a full run would have used the developer's settings and
    reached the model API and a database from `test:unit`. It now stops
    where the CLI run with no flag stops: nothing on stdout, `no database
    URL: ...` on stderr, exit 1.
  - NOTES.md: the smoke test sentence names `node_modules/.bin/dbtruth`, which
    is what `npx dbtruth` runs, instead of reading as a third thing the smoke
    test does.
- Not taken: emptying `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` as well.
  `run()` resolves the database URL before it creates the model client, so an
  empty `DATABASE_URL` stops a run before any network, as "the CLI exits 1
  when no URL is configured" already relies on.
- `npm run verify` exits 0: 85 tests, 83 pass, the 2 live tests skipped, and
  the smoke test prints `pack-smoke: the installed dbtruth --version prints
  0.1.8, the version in package.json`. `npm run acceptance -- --task T1.2`
  prints `T1.2: 80/100`, every check passing.
- Lost Tests (-20): `FAIL T1.2 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Sabotage: removed `.version(version, "-v, --version")` from `main()`;
  "--version prints the version in package.json and nothing else, and exits
  0" failed with "--version: error: unknown option '--version'" and `'' !==
  '0.1.8\n'`. Restored.
- Sabotage: read `package.json` from the working directory
  (`readFileSync("package.json", "utf8")`) instead of next to the code; the
  same test failed with "--version: ... Error: ENOENT: no such file or
  directory, open '...\dbtruth-cli-mLnGpK\package.json'", and, built, the
  package smoke test failed with "pack-smoke: FAIL the installed dbtruth
  --version printed "1.0.0\n", not 0.1.8", the version of the project
  `npm init -y` made. Restored, and `dist/` rebuilt.
- Sabotage: `.version(version)`, commander's default `-V, --version`; the same
  test failed with "-v: error: unknown option '-v'" and `'' !== '0.1.8\n'`.
  Restored.
- `src/cli.ts` was restored each time from a copy kept outside the
  repository, matched it byte for byte (`cmp`), and `git diff HEAD --
  src/cli.ts` printed the same diff as before the first sabotage.

## T1.1 `.env` discovery up to the repository root
### Iteration 1: 80/100
- Tests first, against a stub `findDotEnv` that kept 0.1.8's behaviour (the
  start directory only):
  - `test/safety.test.ts`: "from a nested package, the .env at the repository
    root is found" got `{ values: {}, searched: [<api>] }`; the `.git` file
    test got `searched` of `[<api>]` instead of up to `sub`; the unreadable
    `.env` test got `path` undefined, because the stub stopped at the
    directory named `.env`; the symlink test got `path` undefined, reading
    the link only. "the nearest .env wins", "outside a repository only the
    start directory is searched" and the CRLF, `export` and quotes test
    passed, because 0.1.8 already reads the start directory only and its
    parser already handles those forms.
  - `test/cli.test.ts`: with no URL anywhere the CLI printed the one line of
    0.1.8, `no database URL: set DATABASE_URL, put it in .env, or pass
    --url`, not the directories and the fixes; the canary test's first line
    was that error, not `reading settings from ../../.env`.
  - `test/integration.test.ts`: from `packages/api` with the fixture URL in
    the root `.env`, `run()` returned 1 (no URL found), not 2; with
    `envFile` it returned 1 as well, the option being unknown. The
    precedence test passed: its winning sources are the environment and
    `--url`, and the stub never read the root `.env` that should lose.
  - The spawned `--env-file nope.env` exited 9, not 1, with `node.exe:
    nope.env: not found` on stderr. Cause: Node reads `--env-file` wherever
    it stands on its command line, the script's arguments included, and
    stops before any dbtruth code runs. Checked on Windows Node 22.18 and in
    `node:20-alpine`, `node:22-alpine` and `node:24-alpine` (20.20.2, 22.23.2,
    24.21.0), and `npx --version --env-file nope.env` exits 9 the same way.
    A file that exists is passed through, and none of them loads it into
    the environment. Written into NOTES.md, 0.2.0; the plan's exit 1 and
    `--env-file <path>: no such file` are now tested on `run()`, and the
    command's exit 9 is pinned by its own test. The flag name is a question
    for the maintainer.
  - "from a symlinked directory, the settings file is named by a path that
    opens it from there" was written after the implementation, when it
    turned out that Windows resolves `..` against the path as written.
    Relative to the real working directory instead, it fails on Windows with
    `actual: ''`: the path shown, `../../.env`, does not open the file from
    the junction.
- Built: `findDotEnv(start)` and `readEnvFile(path)` in `safety.ts`, the line
  parser moved into `readEnvFile` and `readDotEnv` reading through it;
  `--env-file <path>`, the `reading settings from` line and the multi-line
  "no database URL" error in `cli.ts`; `KEY_HELP` in `model.ts`. `run()`
  keeps the discovery result as `settings`.
- `npm run verify` exits 0: 100 tests, 98 pass, the 2 live tests skipped, and
  the package smoke test passes. The three changed test files also pass under
  Linux, in `node:20-alpine` and `node:22-alpine` against the fixture
  database on the host (Node 20.20.2 and 22.23.2): 31 pass, the 2 live tests
  skipped.
- `npm run acceptance -- --task T1.1` prints `T1.1: 80/100`, every check
  passing. `npm run acceptance` over every task: T0.1, T0.2 and T1.2 still
  100/100.
- Lost Tests (-20): `FAIL T1.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
### Iteration 2: 63/100
- Fixed after review:
  - A5 was counted as passing on a test that pins the opposite of what it
    asks. Its check needed "as a command, a missing --env-file is refused by
    Node before dbtruth starts", which asserts exit 9 and Node's line; its
    two other tests call `run()`, which no command with a missing file
    reaches. The check is now the command itself, `node --import tsx
    src/cli.ts --env-file nope.env`, expecting exit 1 and `--env-file
    nope.env: no such file`, and it fails until the question below is
    answered. The `env-file-missing-command` check is gone; its test stays in
    the suite, which `npm run verify` runs, as a pin of Node's behaviour. The
    file that exists is still tested by `env-file-only` through `run()` and
    by the canary test through the command.
  - Iteration 1 said Node does not load an existing `--env-file` into the
    environment. It sets no variable from it, but it applies the file's
    `NODE_OPTIONS` to the dbtruth process: on Node 22.18 a file holding
    `NODE_OPTIONS=--require ./side.cjs` ran `side.cjs` before the script,
    and one holding `NODE_OPTIONS=--inspect=127.0.0.1:0` printed `Debugger
    listening on ws://127.0.0.1:51283/...`. A `NODE_OPTIONS` already in the
    environment wins over the file's. NOTES.md corrected; the new test "as a
    command, Node applies the NODE_OPTIONS of the file --env-file names
    before dbtruth starts" pins it, and `cli()` in `test/cli.test.ts` now
    clears `NODE_OPTIONS` as it clears `DATABASE_URL`, so a developer's own
    cannot hide the file's.
  - A6 was counted as passing on a reading NOTES.md chose, "nothing secret
    and nothing dbtruth does not use", where section 0 says to ask. It is now
    a manual item with empty evidence, and the NOTES.md entry states the
    question instead of the reading. Its sentence that `doctor` replaces the
    driver's connect errors is corrected: T1.3 changes only `doctor`'s own
    report.
  - The "no database URL" error listed the directories searched only when no
    `.env` was found. From `packages/api`, with a directory named `.env`
    there and a root `.env` without the URL, it named `../../.env` and
    dropped `packages/api (EISDIR: ...)`, the one entry that says why the
    package's file was passed over. It now always lists `searched`, one
    `  searched <dir>` line each; with `--env-file` the list is empty. With no
    file found, the fix line reads `in a .env in one of those directories`
    instead of offering the repository and non-repository cases in prose.
    The A4 test gained the found-without-URL case.
  - From a junction to `packages/api` holding its own `.env`, the CLI printed
    `reading settings from ../../rv-repo-.../packages/api/.env`: whether the
    file was in the working directory was judged on a real path made
    relative to the path as given. It is now judged on real paths,
    `realpathSync(dirname(settings.path)) !== realpathSync(opts.cwd)`, which
    covers `--env-file` too; the path shown is still relative to the working
    directory as given. The symlink test gained the case through `run()` with
    the link as `cwd`, so Linux, where `process.cwd()` is already real,
    checks it as well.
  - "the nearest .env wins" passed against 0.1.8's start-only stub, because
    the winning file sat in the start directory. It now starts in
    `packages/api/src`, with a `.env` in `packages/api` and one at the root,
    and expects `packages/api`'s file and `searched` of `[src, api]`.
  - The settings path is no longer rewritten to forward slashes, the only
    such rewrite in `src/`: on Windows it read `../../.env` beside the native
    `C:\...` directories of the same error. The tests build the expected path
    with `join`.
  - NOTES.md: the sentence that `run()` keeps the discovery result for
    `doctor` is gone; nothing is kept or passed on.
- Not taken:
  - A line, on a run that goes ahead with a `.env` further up, for a nearer
    one that could not be read. The plan lists `searched` in the "no database
    URL" error only, and the file read is named before anything is sent. A
    directory named `.env` is often a Python virtualenv, so the line would
    print on every run from such a package, and keeping the failures apart
    from `searched` would change the signature the plan gives `findDotEnv`.
    Written into NOTES.md as not done.
  - Connection errors told by their code in `safety.connect`, which would
    close the connect path of A6: that is T1.3's design, and whether A6 asks
    for it is the second question below.
  - A reviewer's aside that `--` does not stop Node reading the flag: on Node
    22.18, `node a.js -- --env-file s.env` handed `['--', '--env-file',
    's.env']` to the script and applied nothing.
- Each changed test was run against the code it guards, undone, and failed:
  the A4 test with the three `searched` lines missing from `actual` (`file ?
  [] :` put back); the symlink test with `actual: 'reading settings from
  ..\..\dbtruth-repo-fdaC37\packages\api\.env'` (the relative-path judgement
  put back), and under Linux in `node:22-alpine` with `'reading settings
  from ../../dbtruth-repo-LgNppf/packages/api/.env'`; "the nearest .env
  wins" with `actual: { values: {}, searched: [<src>] }` (`findDotEnv`
  searching the start directory only). Each file was restored from a copy
  kept outside the repository and matched it byte for byte (`cmp`).
- `npm run verify` exits 0: 101 tests, 99 pass, the 2 live tests skipped, and
  the package smoke test passes. The three changed test files pass under
  Linux in `node:20-alpine` (20.20.2) and `node:22-alpine` (22.23.2) against
  the fixture database on the host: 32 pass, the 2 live tests skipped.
- `npm run acceptance -- --task T1.1` prints `T1.1: 63/100`. `npm run
  acceptance` over every task: T0.1, T0.2 and T1.2 still 100/100.
- BLOCKED A5 (-8.3): `FAIL T1.1 A5 acceptance: exit 9, expected 1`, with
  `node: nope.env: not found`. Cause: Node takes `--env-file` from the
  script's arguments (exit 9 on Node 20.20.2, 22.18, 22.23.2 and 24.21.0, and
  through `npx`) and applies the named file's `NODE_OPTIONS` to the dbtruth
  process. The plan does not decide this. Question for the maintainer: may
  the option be renamed, for every command that takes it (T1.1, `doctor` in
  T1.3, `check` in T3.2, `mcp` in T5.1, Appendix E), to a name Node does not
  claim, such as `--settings <path>`? Or does `--env-file` stay, with Node's
  exit 9 and its own line on a missing file, outside the 0, 1 and 2 of
  Appendix E, and a settings file's `NODE_OPTIONS` able to run code or open
  a debugger port before dbtruth starts (R9)? Next: the answer.
- BLOCKED A6 (-8.3): `FAIL T1.1 A6 acceptance: no evidence for: No value
  from any .env is ever printed. ...`. Cause: A6 needs a reading the plan
  does not give. Read literally, it also forbids the model id in the
  disclosure line and the database name in the summary, both printed by
  design as in 0.1.8. And with a canary URL, `run()` fails on connect with
  `could not connect to the database: password authentication failed for
  user "canary-pii"`, `database "canary-pii" does not exist` or `getaddrinfo
  ENOTFOUND canary-pii.invalid`, the driver's message naming the user, the
  database or the host, never the password. Question for the maintainer:
  which printed values does A6 forbid? If the parts of the URL a failed
  connection names count, `safety.connect` would report failures by their
  code (28P01, 3D000, ENOTFOUND, ECONNREFUSED and the rest) in plain
  sentences, for the full run as well as `doctor`, which pulls that part of
  T1.3 forward, and a canary test would reach connect through `run()`.
  Next: the answer.
- Lost Tests (-20): `FAIL T1.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- 63.3 floored to 63.
- Sabotage: `findDotEnv` stopped after the start directory (`dir === from`
  for `dir === root`); "from a nested package, the .env at the repository
  root is found" failed with "Expected values to be strictly deep-equal":
  `values: {}` and `searched` of `[<api>]`, where the root `.env` and the two
  directories above `api` were expected. Eight other tests failed with it,
  among them the integration test from `packages/api` with "the fixture's
  broken join, so the URL came from the root .env" (1, expected 2).
  Restored.
- Sabotage: outside a repository `repositoryRoot` returned the filesystem
  root instead of `undefined`, so the walk went up anyway; "outside a
  repository only the start directory is searched, and a .env above it is
  ignored" failed with "Expected values to be strictly deep-equal": the
  parent's `.env` and `values: { DATABASE_URL: 'postgres://parent' }`, where
  `{ values: {}, searched: [<child>] }` was expected. Restored.
- Sabotage: only a `.git` directory marked the root (`statSync(...)
  ?.isDirectory()` for `existsSync`); "a .git file, as in a worktree or a
  submodule, marks the repository root" failed with "the outer repository's
  .env is not read": `values: { DATABASE_URL: 'postgres://outer' }`, found
  one directory above `sub`. Restored.
- Sabotage: only the `.env` at the repository root counted (`existsSync(path)
  && dir === root`); "the nearest .env wins over one further up, and the two
  are never merged" failed with "Expected values to be strictly deep-equal":
  `DATABASE_URL: 'postgres://root'` and `ANTHROPIC_MODEL: 'from-root'`, where
  `postgres://api` alone was expected. The unreadable `.env`, A4 and
  symlink tests failed with it. Restored.
- Sabotage: an unreadable `.env` ended the search (a `return` after its
  `searched` entry); "a .env that exists but cannot be read is listed with
  its error, and the search goes on" failed with "Expected values to be
  strictly deep-equal": `values: {}` and `searched` ending at `<api> (EISDIR:
  ...)`, where the root `.env` was expected. The A4 test failed with it.
  Restored.
- Sabotage: the `.env` found beat the environment (`{ ...opts.env,
  ...settings.values }`); "precedence stays: the environment beats the .env
  found, and --url beats both; an empty variable still means unset" failed
  with "could not connect to the database: connect ECONNREFUSED ::1:1;
  connect ECONNREFUSED 127.0.0.1:1", the URL of the `.env` that must lose.
  The canary test failed with it: the file's key replaced the empty one, and
  the spawned CLI printed "the Anthropic API rejected the key" instead of "no
  API key found". Restored.
- Sabotage: the `reading settings from` line printed only for a file in the
  working directory (`===` for `!==`); "from a nested package, the root .env
  is used and named on stderr before the disclosure line, never its values"
  failed with "relative to the working directory": the first line was
  `Sending to claude-sonnet-5 ...`, where `reading settings from ..\..\.env`
  was expected. Four other tests failed with it. Restored.
- Sabotage: removed the `--env-file` existence check from `run()`;
  "--env-file names a file that does not exist: exit 1 and one line that
  says so" failed with "ENOENT: no such file or directory, open
  '...\packages\api\nope.env'", thrown from `run()` instead of the one line
  and exit 1. Restored.
- Sabotage: `--env-file` was merged over the `.env` found (`{
  ...findDotEnv(opts.cwd).values, ...readEnvFile(envFile) }`); "--env-file
  reads that file only, relative to the working directory" failed with "nor
  is any other setting of the root .env". The canary test failed with it:
  the root `.env`'s URL was used, and the run stopped at "no API key found"
  instead of "no database URL". Restored.
- Sabotage: the `reading settings from` line also printed the file's values;
  "no value from a .env is printed, on the error paths either" failed with
  "Expected values to be strictly equal": `'reading settings from
  ..\..\.env: postgres://canary-pii:canary-pii@localhost:1/canary-pii
  sk-canary-pii'`. Four other tests failed with it, the integration test from
  `packages/api` among them. Restored.
- `src/safety.ts` (the first five) and `src/cli.ts` (the last five) were
  restored each time from a copy kept outside the repository, matched it
  byte for byte (`cmp`), and `git diff HEAD` printed the same diff as before
  the first sabotage. Every sabotage failed at least one of the task's tests,
  so no test was strengthened.
### Iteration 3: 83/100
- `npm run acceptance -- --task T1.1` printed `T1.1: 83/100` before any
  change: A5 and A6 fail, every other check passes. The Tests part lost in
  iterations 1 and 2 is earned by the sabotage record of iteration 2.
- BLOCKED A5 (-8.3): `FAIL T1.1 A5 acceptance: exit 9, expected 1`, with
  `node: nope.env: not found`. No dbtruth code is involved: a script that
  only prints its arguments, run as `node argv.js --env-file nope.env` or
  with `--env-file=nope.env`, exits 9 with the same line, and `npx --version
  --env-file nope.env` exits 9 before npx looks for any package. Cause, in
  Node's source: `Dotenv::GetDataFromArgs` in `src/node_dotenv.cc` looks
  through every argument for `--env-file`, `--env-file=`,
  `--env-file-if-exists` and `--env-file-if-exists=`, and stops at `--`
  only, never at the script; the same in v22.18.0 and on the main branch
  today. A `--` hands the flag to the script (`node -- argv.js --env-file
  nope.env` and `node argv.js -- --env-file nope.env` both exit 0), but
  neither the check's command nor `npx dbtruth` has one, and npx stops on
  its own argument list first. The question of iteration 2 stands: rename
  the option, for every command that takes it, to a name Node does not look
  for, such as `--settings <path>`, or keep `--env-file` with Node's exit 9.
  Next: the answer.
- BLOCKED A6 (-8.3): `FAIL T1.1 A6 acceptance: no evidence for: No value
  from any .env is ever printed. ...`. New information for the question,
  from `run()` with `canary-pii` in a `.env` on 21 failure paths, checked by
  hand. Printed on none: the password, whether the URL is malformed (a bad
  `%`, a space, a `#`, a port out of range, a broken IPv6 host; the driver
  redacts its input and says `Invalid URL`) or rejected by the server; and
  the key, whether nothing answers or it holds a letter a header cannot
  carry. Printed: the user, the database and the host in the driver's
  messages; the URL's `options` value, repeated by the server (`invalid
  command-line argument for server process: canary-pii`); the path of a
  missing `sslcert`, `sslkey` or `sslrootcert` file, thrown by `new
  pg.Client` before the "could not connect" wrapper; a rejected `DBTRUTH_*`
  value; the model id. T1.3 draws a line for `doctor` only: never the URL,
  "not even the host", and never the password, "even inside a driver error
  message". If A6 means the secrets, it holds now, and the evidence would be
  the canary tests and "a connection failure surfaces as one error that
  never contains the password"; if it means every value, the list above is
  the work, most of it the connection sentences of T1.3. Next: the answer.
- NOTES.md, 0.2.0: the Node entry names the cause in Node's source and that
  its main branch keeps it; the A6 entry adds the `options` value and the
  certificate paths to what a failed connection prints. No code changed, so
  there was nothing new to sabotage.
- Not taken:
  - A test that a wrong password in a `.env` stays unprinted when the server
    rejects it. The password on the connect path is held by "a connection
    failure surfaces as one error that never contains the password", and the
    `url` that reaches `connect` is the same whether it came from `--url` or
    a `.env`. The server asks for a password only over the container's port
    mapping (its `pg_hba.conf` trusts 127.0.0.1 and ::1), so the test would
    pass or fail by how the database is reached. T1.3 tests a wrong password
    for `doctor`.
  - A key holding such a letter is reported as "no API key found ...
    (Cannot convert argument to a ByteString ...)", though the key was
    found. No part of the key is printed, and the sentence is 0.1.8's
    fallback in `explainApiFailure`; `doctor` (T1.3) checks the key.
- `npm run verify` exits 0: 101 tests, 99 pass, the 2 live tests skipped, and
  the package smoke test passes. The docs checks of every task that read
  NOTES.md, README.md or CHANGELOG.md still match.
- `npm run acceptance -- --task T1.1` prints `T1.1: 83/100`, A5 and A6
  failing as above, every other check passing. 83.3 floored to 83.
### Iteration 4: 100/100
- Decided by the lead, on the questions of iterations 2 and 3:
  - A5, decided by the lead: the option is renamed from `--env-file` to
    `--dotenv <path>` everywhere: the commander option, `RunOptions.dotenv`,
    the line `--dotenv <path>: no such file`, the `--help` text and the last
    fix of the "no database URL" error in `src/cli.ts`, and the tests,
    `acceptance/checks.json`, README.md, NOTES.md and CHANGELOG.md. The
    reason: Node claims `--env-file` from any position on its command line,
    so a dbtruth option of that name can never behave as the plan describes.
    Reproduced again on Node 22.18 with a script that prints its arguments:
    `node argv.mjs --env-file nope.env` exits 9 with `node.exe: nope.env:
    not found` before the script runs, and `node argv.mjs --dotenv x.env`
    reaches it untouched. NOTES.md, 0.2.0 records the difference under
    section 0, item 5, and that T1.3, T3.2, T5.1 and Appendix E take
    `--dotenv` too. A5 is a command check again, on "--dotenv reads the file
    it names, and a missing one exits 1 with one line that says so", which
    runs the real CLI: the URL only the named file holds takes the run to
    the empty-key stop, and `--dotenv nope.env` exits 1 with exactly that
    line. The two tests that pinned Node's own reading of `--env-file` are
    gone, and with them the clearing of `NODE_OPTIONS` in `cli()` that one
    of them needed; the `run()` test of a missing file is replaced by the
    command.
  - One detail of the lead's evidence did not reproduce: after the script
    name, on Node 22.18, a file that exists does not reach `process.env`.
    With `FOO=from-file` and `NODE_OPTIONS=--require ./side.cjs` in it,
    `node argv.mjs --env-file y.env` ran `side.cjs` and printed `FOO` as
    null; `node --env-file y.env argv.mjs` did both. NOTES.md says what was
    seen.
  - A6, decided by the lead: nothing read from a settings file is printed
    except the model id and the database name as the server reports it;
    credentials, the host, the user, the key and every other value never.
    The manual A6 item is removed from `acceptance/manual.json`. A6, the
    `canary` tests check and the `canary-dotenv` invariant now read "no value
    from a .env reaches stdout or stderr on any path that reads one, the
    errors included" in `test/integration.test.ts`: `canary-pii` in a
    `.env`'s password, key and `SESSION_SECRET`, through a full offline run
    from `packages/api` past an unreadable nearer `.env`, the "no database
    URL" error with the root `.env` found (its URL hidden by an empty
    variable) and from a nested repository with none found, `--dotenv`
    without the URL, missing and unreadable, and a connection refused with
    the canary as the password. Each run is checked for the path it took,
    then every stdout and stderr line for the canary. It replaces the canary
    test of `test/cli.test.ts`. NOTES.md states the limit T1.3 removes: a
    failed connection can print the user, the database or the host from the
    driver's message, and the lead has decided that T1.3's step 4 covers the
    full run as well as `doctor`.
  - The empty evidence rule stays, decided by the lead: no manual item was
    filled. T1.1 has no manual A-item left; its one manual item is the
    sabotage record.
- The review findings left open or partly addressed:
  - A nearer `.env` that could not be read was named only inside the "no
    database URL" error, so a run that went ahead with a file further up did
    not say why. Taken: `run()` prints `could not read <path> (<error>)`, one
    line per such file, relative to the working directory like the settings
    line, before `reading settings from`, on every run; the directories
    searched in the "no database URL" error no longer repeat the error.
    `findDotEnv`'s `searched` became `{ dir, error? }[]` so `cli.ts` can tell
    the entries apart and word them; the plan gives strings, and NOTES.md
    says so. The A4 test's second case expects the line, and the A6 test
    expects it first on the full run.
  - Still fixed from iteration 2, checked again: the "no database URL" error
    lists the directories searched when a `.env` was found (the A4 test's
    second case); the A3 test starts in `packages/api/src`, below a `.env` in
    `packages/api` and one at the root; the fix line names the file found or
    "a .env in one of those directories"; NOTES.md makes no claim that
    `run()` keeps the discovery result; "not in the current directory" is
    decided on real paths (the symlink test, through `run()` with the
    junction as `cwd`).
  - Path spelling, partly taken: NOTES.md now states the rule. Every path
    found on disk (the settings file, a file that could not be read, the
    directories searched) is printed as Node's `path` spells it on that
    system. Not taken: respelling `files written: N under ./context/` and
    `could not write context/...` with backslashes on Windows. Those are the
    names of dbtruth's own output, written the same on every system, in the
    README and in the files' links; they are not paths the CLI found, and
    both lines are 0.1.8's, outside T1.1.
- Each changed test was run against the code it guards, undone, and failed:
  with the `could not read` line never printed, the A4 test failed with
  `- 'could not read .env (EISDIR: illegal operation on a directory,
  read)'` missing from `actual`, and the A6 test with the same line
  missing and `Sending to claude-sonnet-5 ...` in second place; with the URL
  appended to the connection error in `run()`, the A6 test failed with
  "refused printed a value from a .env" and `actual: 'Error: could not
  connect to the database: connect ECONNREFUSED ::1:1; connect ECONNREFUSED
  127.0.0.1:1 (postgres://dbtruth:canary-pii@localhost:1/fixture)'`.
  `src/cli.ts` was restored from a copy each time and matched it (`cmp`).
- Open for the lead, no point depends on it: the A6 decision names two
  values that may be printed, and 0.1.8 prints more of its own settings,
  which a `.env` can hold as well: the effort and the sample rows shown in
  the disclosure line, the output token limit in the error that hits it,
  and a rejected `DBTRUTH_*` value or effort in the error that rejects it
  (`DBTRUTH_SAMPLE_ROWS=abc` gives `DBTRUTH_SAMPLE_ROWS / --sample-rows:
  "abc" is not a number`). None is a credential, a host, a user or a key.
  They are left as in 0.1.8. Question: may they stay, or should the errors
  in `resolveConfig` stop quoting the value? The disclosure line cannot
  leave them out without no longer saying what is sent.
- `npm run verify` exits 0: 99 tests, 97 pass, the 2 live tests skipped, and
  the package smoke test passes. The four tests removed from
  `test/cli.test.ts` and the two added explain the drop from 101. The three
  changed test files pass under Linux in `node:22-alpine` (22.23.2) and
  `node:20-alpine` (20.20.2) against the fixture database on the host: 30
  pass, the 2 live tests skipped.
- `npm run acceptance -- --task T1.1` prints `T1.1: 100/100`, every check and
  item passing. `npm run acceptance` over every task: T0.1, T0.2 and T1.2
  still 100/100.
- No point lost. The tests part is earned with iteration 2's sabotage record,
  which covers `findDotEnv` and `run()` as they were before this iteration;
  it is redone by the next stage for what changed (the rename, the `could
  not read` line, the `searched` entries), and is left in place until then.
- Sabotage: removed the `--dotenv` existence check from `run()`; "--dotenv
  reads the file it names, and a missing one exits 1 with one line that says
  so" failed with "Expected values to be strictly equal": the command
  printed `dbtruth: ENOENT: no such file or directory, open
  '...\packages\api\nope.env'` where `--dotenv nope.env: no such file` was
  expected. The A6 test failed with it: `namedMissing` threw ENOENT instead
  of returning 1. Restored.
- Sabotage: `--dotenv` was merged over the `.env` found (`{
  ...findDotEnv(opts.cwd).values, ...readEnvFile(dotenv) }`); "--dotenv reads
  that file only, relative to the working directory" failed with "nor is any
  other setting of the root .env": the root `.env`'s `ANTHROPIC_MODEL`
  reached the disclosure line. The A6 test failed with it: `--dotenv
  ../../no-url.env` took the root `.env`'s URL and returned 2, not 1.
  Restored.
- Sabotage: the "no database URL" error also printed each setting of the
  file found, `  ../../.env sets KEY=value`, after the fixes; "no value from a
  .env reaches stdout or stderr on any path that reads one, the errors
  included" failed with "urlHidden printed a value from a .env": `actual: '
  ..\..\.env sets ANTHROPIC_API_KEY=sk-canary-pii'`. The A4 test failed with
  it, on the extra `ANTHROPIC_MODEL=from-root` line. Restored.
- Sabotage: the `could not read <path> (<error>)` line was never printed
  (its line in `run()` removed); "with no database URL anywhere, the error
  lists the directories searched and one fix per line, and exits 1" failed
  with "Expected values to be strictly deep-equal": `'could not read .env
  (EISDIR: illegal operation on a directory, read)'` missing before
  `reading settings from ..\..\.env`. The A6 test failed with it, `Sending
  to claude-sonnet-5 ...` second where the line was expected first.
  Restored.
- Sabotage: `findDotEnv` kept an unreadable `.env`'s directory in `searched`
  without its error (`searched.push({ dir })` in the `catch`); "a .env that
  exists but cannot be read is listed with its error, and the search goes
  on" failed with "Expected values to be strictly deep-equal": `error:
  'EISDIR: illegal operation on a directory, read'` missing from the
  `packages/api` entry. The A4 and A6 tests failed with it, the `could not
  read` line missing. Restored.
- Sabotage: the walk looked for a `.env` only in the start directory and at
  the repository root (`(dir === from || dir === root) && existsSync(path)`);
  "the nearest .env wins over one further up, and the two are never merged"
  failed with "Expected values to be strictly deep-equal": from
  `packages/api/src` it returned the root `.env`, `DATABASE_URL:
  'postgres://root'` and `ANTHROPIC_MODEL: 'from-root'`, where
  `packages/api/.env` with `postgres://api` alone was expected. No other
  test failed. Restored.
- `src/cli.ts` (the first four) and `src/safety.ts` (the last two) were
  restored each time from a copy kept outside the repository, matched it
  byte for byte (`cmp`), and `git diff HEAD -- <file>` printed the same diff
  as before the sabotage; after the last, `git diff HEAD` over the whole
  tree matched the one saved before the first. Every sabotage failed at
  least one of the task's tests, so no test was strengthened.
- After the record, `npm run verify` failed once, on "300 tables: the budget
  is respected and output still renders" in `test/scale.test.ts` with "some
  measurements ran out of budget", and exited 0 on the rerun: 99 tests, 97
  pass, the 2 live tests skipped, and the package smoke test passes. T1.1
  does not touch that test. Run alone it failed 1 time in 6, then passed 12
  of 12 on the working tree and 12 of 12 on a `git archive` of HEAD: its
  0.3 s budget counts query time only, so whether a measurement runs out
  depends on how fast the database answers. Left as it is, outside T1.1.
- `npm run acceptance -- --task T1.1` prints `T1.1: 100/100`, every check and
  item passing.
### Iteration 5: 100/100 (the lead)
- A directory named `.env` counted as a `.env` that cannot be read, so a
  project with a Python virtualenv of that name would print `could not read
  .env (EISDIR ...)` on every run. It is not a settings file: `findDotEnv`
  now takes only a regular file and passes a directory over without a word
  (new test "a directory named .env, such as a Python virtualenv, is passed
  over without a word", check `venv-dir`). The three tests that used a
  directory as their unreadable `.env` now use a real one, from
  `test/unreadable.ts`: `chmod 000` on Linux, an ACL denying everyone the
  right to read its data on Windows, and an assertion that it cannot be read,
  so a run as root fails loudly instead of passing on nothing. They pass on
  Windows and as a non-root user in `node:22-alpine`.
- The three NOTES entries of T1.1 are shortened, the facts unchanged.
- Sabotage: `findDotEnv` back to `existsSync(path)`; "a directory named .env,
  such as a Python virtualenv, is passed over without a word" failed (not ok
  14). Restored; `git diff` unchanged.

## T1.3 `dbtruth doctor`
### Iteration 1: 80/100
- Tests first, against a stub `doctor` in `src/doctor.ts` that only printed
  what `connect()` throws, with no `doctor` command in `cli.ts` yet:
  - `test/doctor.test.ts` (new, in `test:db`): all nine tests failed. The
    in-process ones got at most one line where eight were expected; the
    connection test's first case got `FAIL could not connect to the database:
    connect ECONNREFUSED ::1:1; connect ECONNREFUSED 127.0.0.1:1`, not its
    sentence; the two command tests got `error: too many arguments. Expected
    0 arguments but got 1: doctor.` and exit 1.
  - What 0.1.8's `connect()` says for each cause, run by hand with the canary
    in the URL: `password authentication failed for user "canary-pii"`,
    `database "canary-pii" does not exist`, `getaddrinfo ENOTFOUND
    canary-pii.invalid`, the driver's words naming the user, the database and
    the host. A server that accepts and never answers was still waited on
    after 3 s: no limit but the system's TCP timeout. A server that refuses
    `SET` let `unrecognized configuration parameter "canary-pii"` escape raw,
    without "could not connect", and left the client open: when the test's
    fake closed the socket, the test runner reported "generated asynchronous
    activity after the test ended ... Connection terminated unexpectedly".
  - `test/integration.test.ts`: the T1.1 canary test, its failing URLs now
    with the canary in the user, the host and the database too, failed on
    `Error: could not connect to the database: connect ECONNREFUSED ::1:1;
    connect ECONNREFUSED 127.0.0.1:1`, the driver's text where the sentence
    was expected.
  - The package smoke step was written before the command existed, but first
    run after it.
- Built: `src/doctor.ts`, eight checks, one line each on stderr, returning
  whether the setup is ready, which `main()` turns into exit 0 or 1; the
  `doctor` subcommand in `cli.ts` with its own `--url` and `--dotenv`
  (`enablePositionalOptions`), the full run moved into the program's action
  unchanged; `readSettings` in `safety.ts`, the settings step moved out of
  `run()`, called by both commands; `connect()` bounded by
  `statementTimeoutSeconds`, one sentence per cause the plan lists and the
  code alone for anything else, and the client closed with one sentence when
  the session setup is refused; the `WARNING: ` mark moved to `run()`.
  `test/fixtures/roles.sql` is mounted after the other init files, and the
  fixture was reloaded.
- Checked by hand with the built `dist/cli.js` from a temporary directory: the
  fixture as `dbtruth` (eight `ok` lines, exit 0) and as `partial` (`ok 2
  relations readable, 9 not: measurements on those will be skipped`); a host
  that drops packets, `10.255.255.1` with a 1 s limit, gave the timeout
  sentence, which read "within 1 seconds" and now reads "within 1 s";
  `dbtruth` alone and `dbtruth foo` print what they printed before; `doctor
  --json` is refused as an unknown option. A URL without a password, and
  `sslmode=require` against the fixture, which has no SSL, give the bare
  `could not connect to the database`: the driver gives them no code.
  Written into NOTES.md as not done.
- The SSL-required reply the test's fake sends is Postgres's own: captured
  from throwaway `postgres:16` and `postgres:18` containers whose
  `pg_hba.conf` held `hostssl` lines only (28000, routine
  `ClientAuthentication`, message ending in `no encryption`); on 16, with SSL
  turned on, the same client connected with `sslmode=no-verify`.
- `npm run verify` exits 0: 109 tests, 107 pass, the 2 live tests skipped, and
  the smoke test prints `pack-smoke: the installed dbtruth doctor prints 8
  checks, every one ok`.
- Under Linux as a non-root user, in `node:22-alpine` (22.23.2) and
  `node:20-alpine` (20.20.2) against the fixture on the host, the doctor,
  integration, safety, cli and structure test files: 45 tests, 43 pass, the 2
  live tests skipped. Against fixtures loaded from the same init files on
  `postgres:18` and on `postgres:12-alpine` (md5 passwords), the doctor and
  integration test files pass, and on 12 the safety tests too.
- `npm run acceptance -- --task T1.3` prints `T1.3: 80/100`, every check
  passing. `npm run acceptance` over every task: T0.1, T0.2, T1.1 and T1.2
  still 100/100.
- Lost Tests (-20): `FAIL T1.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
### Iteration 2: 80/100
- Four reviews, 21 findings. Each was checked against the code and the plan
  first; five were reproduced by hand from an empty directory before any
  change:
  - `doctor --dotenv .` printed `ok Node ...`, then `dbtruth: EISDIR: illegal
    operation on a directory, read`, exit 1, and no key check.
  - `dbtruth --url postgres://nobody:pw@localhost:1/none doctor`, with
    `DATABASE_URL` holding the fixture, printed eight `ok` lines and exited
    0: an option before the name went to the program and was dropped.
  - `DBTRUTH_STATEMENT_TIMEOUT_SECONDS=abc` printed `ok settings from the
    environment` and then `dbtruth: DBTRUTH_STATEMENT_TIMEOUT_SECONDS /
    --statement-timeout-seconds: "abc" is not a number`.
  - `doctor --url '...?sslmode=require'` printed pg-connection-string's
    nine-line `SECURITY WARNING` before its own line.
  - On a fake server that says it is version 9 and refuses any statement
    naming `relispartition`, as 9.x does: `ok connected to fake`, then
    `could not read the catalog: column c.relispartition does not exist`
    thrown, with no version line.
- Fixed:
  - Checks 5 and 7 are two statements. The version is read on its own, and
    the relations are counted only once it has passed. The old-server test's
    fake is now that version-9 server.
  - The doctor action reads the program's options under its own: `--url`
    and `--dotenv` on either side of the name, doctor's winning, and the
    tunable flags, through the loop the full run used, now `overrides()`
    for both actions. Commander's `optsWithGlobals()` lets the program's
    value win (`--url A doctor --url B` gave A), so it was not used.
  - `readSettings` returns the line for a `--dotenv` file that is missing or
    cannot be read, and doctor prints it after `FAIL`. Check 2 resolves the
    tunables too, so a value the full run would refuse is a `FAIL` line and
    not a crash. The full run prints `--dotenv .: could not read it (EISDIR:
    ...)` and exits 1, where it threw; T1.1's `/EISDIR/` assertion holds.
  - The SSL advice is `sslmode=verify-full`: pg treats `require` as that
    anyway and warns about it. The timeout reads `within 0.5s`, as the CLI's
    other durations do. The session-setup failure drops its `could not
    connect to the database: ` prefix, since the server did accept the
    connection.
  - Check 3 moved into `doctor()` beside check 2, and its line names
    `--dotenv <path>` as well. `checkDatabase(url, cfg, err)` is now checks 4
    to 7, the ones that hold the connection. The preflight is called bound
    (`deps.preflight?.() ?? createModel(...).preflight()`).
  - `DESCRIBED_RELATIONS` in the SQL helpers of `safety.ts` is the relation
    condition `listRelations` and check 7 share, so the comment that claimed
    they matched is gone.
  - Wording: the header of `doctor.ts` (the NOTES sentence, and the unreadable
    `.env` line); the doc of `readSettings`, whose callback is `warn`, as in
    `SafetyOptions`; the reason in `pack-smoke.mjs` for running without a key.
  - Tests: the key check also covers a 400, a 500 and an API address where
    nothing listens (`FAIL could not reach the Anthropic API: Connection
    error.`). The fake API's error text is no longer the canary, since a 400
    and a 500 are told in the API's own words; the key `sk-canary-pii` still
    is. The command test covers the wrong password `canary-pii-pass` at the
    process level, `--url` before the name, and a tunable before the name.
    A new test covers the settings failures. The Node check with injected
    versions moved to `test/cli.test.ts`, which `test:unit` runs; the fixture
    assertion that an old Node alone fails stays in `test/doctor.test.ts`.
  - `acceptance/checks.json`: the renamed tests; `node-version` spans both
    files; A2 also requires the old-server test; a `settings-fail` check.
  - NOTES.md records all of the above, and how R9 is read: doctor's one API
    request is the full run's first one, sent only with a key, and check 8
    of the plan asks for it. Read strictly, R9 forbids it, and then this is
    the section 0.6 conflict for the maintainer to decide.
- Rejected:
  - A sentence for TLS certificate failures (`DEPTH_ZERO_SELF_SIGNED_CERT`,
    `SELF_SIGNED_CERT_IN_CHAIN` and others). A local TLS server shows the
    error reaching pg as a bare `Error` with an OpenSSL code and nothing
    else, so the sentence would need a hand-kept list of codes, and the plan
    does not list this cause. The code is printed. Recorded in NOTES as not
    done, with `sslrootcert` and `no-verify` left for T1.5's troubleshooting
    table.
  - Decoupling the connect limit from `statementTimeoutSeconds`. Both fixes
    offered add a number the plan does not ask for: a tunable, or a floor.
    The config comment already says a too-low value makes a server
    unreachable. Twenty connects to the fixture took 24 ms median and 51 ms
    at most, setup included, so the 0.2 s safety test has room. The trade-off
    is now written into NOTES.
  - Printing a `FAIL` line when a catalog read in checks 5 or 7 fails,
    instead of throwing. Only a statement timeout shorter than a trivial
    catalog query can cause it, and then exit 1 is right: the full run's
    `listRelations` would fail the same way. `main()` prints the message.
- Sabotage of the fixes (the task's own sabotage check is still to come),
  each file restored byte for byte, checked with `cmp`:
  - The version gate removed: the old-server test failed with `Error: could
    not read the catalog: column c.relispartition does not exist`.
  - The doctor action reading only its own options: the command test failed
    with `--url postgres://canary-pii:... doctor`, `actual: 0, expected: 1`.
  - `readSettings` rethrowing an unreadable file: the settings test failed
    with `Error: EISDIR: illegal operation on a directory, read`.
  - The tunables resolved after `ok settings`, outside the check: the
    settings test failed with `Error: DBTRUTH_STATEMENT_TIMEOUT_SECONDS /
    --statement-timeout-seconds: "abc" is not a number`.
  - The SSL advice back to `sslmode=require`: the connection-failure test
    failed.
- `npm run verify` exits 0: 111 tests, 109 pass, the 2 live tests skipped,
  and `pack-smoke: the installed dbtruth doctor prints 8 checks, every one
  ok`.
- `npm run acceptance -- --task T1.3` prints `T1.3: 80/100`, with every
  automated check passing. `npm run acceptance`: T0.1, T0.2, T1.1 and T1.2
  are still 100/100.
- Lost Tests (-20): `FAIL T1.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: `acceptance/manual.json` has no
  evidence for T1.3's sabotage item. The sabotages above cover only this
  iteration's fixes, not the core of the task, so they are not entered as
  that evidence; the sabotage check is done by a later stage.
- The sabotage check of the task. Each file was copied outside the
  repository first; `test/doctor.test.ts` and `test/cli.test.ts` (and
  `test/integration.test.ts` for `safety.ts`) were run under each sabotage.
- Sabotage: `connect()` threw the driver's message again (`could not connect
  to the database: ${errorMessage(e)}` in place of `connectFailure(...)`);
  "each connection failure has its own sentence and leaves the setup not
  ready, and nothing from the URL is printed" failed with "connection
  refused": `FAIL could not connect to the database: connect ECONNREFUSED
  ::1:1; connect ECONNREFUSED 127.0.0.1:1` where the sentence was expected.
  The command test and the T1.1 canary test in `test/integration.test.ts`
  failed with it. Restored.
- Sabotage: `checkDatabase` returned `true` in place of `db.readOnlyProven`,
  so an accepted write no longer left the setup not ready. Every test stayed
  green: the one server that accepted the write also said it was Postgres 9,
  and the version gate returned first. Strengthened "a server that accepts a
  write in a read-only session fails the proof in the words of the full run,
  and one older than 12 fails too": a second fake, at Postgres 16, accepts
  the write and passes every other check (`ok Postgres 16`, `ok 0 relations
  readable, 0 not`), and the setup must not be ready. Repeated; the test
  failed with "an accepted write leaves the setup not ready even when every
  other check passes": `true !== false`. Restored.
- Sabotage: the doctor command exited 0 whatever the checks found (`code =
  ready ? EXIT_OK : EXIT_OK` in `cli.ts`); "as a command, doctor exits 1 when
  a check from 1 to 6 fails, takes --url and --dotenv on either side of its
  name, and prints nothing on stdout" failed with "doctor --url
  postgres://canary-pii:canary-pii-pass@localhost:1/canary-pii": `0 !== 1`.
  Restored.
- Sabotage: `connect()` left the client open when the server refused the
  session setup (`await client.end()` removed); "a server that accepts the
  connection but refuses SET gets one sentence, and dbtruth closes the
  connection" failed with "Expected values to be strictly equal": `'left
  open'` where `'closed'` was expected. Restored.
- Sabotage: the Node check took only versions above 20 (`>` for `>=`);
  "doctor's Node check reads the version it is given: below 20 fails, 20 and
  later pass" failed with "Expected values to be strictly equal": `'FAIL Node
  v20.0.0: dbtruth needs Node 20 or newer'` where `'ok Node v20.0.0'` was
  expected. Restored.
- Sabotage: check 7 counted every relation as readable (`count(*) AS
  readable`, without `has_table_privilege`); "a role that can read some
  relations is told how many it cannot, and its password, which a URL must
  escape, is never printed" failed with "the relations and how many of
  them": `'ok 11 relations readable, 9 not: ...'` where `'ok 2 relations
  readable, 9 not: ...'` was expected. Restored.
- `src/safety.ts` (the first and fourth), `src/doctor.ts` (the second, fifth
  and sixth) and `src/cli.ts` (the third) were restored each time from the
  copy and matched it byte for byte (`cmp`); `git diff HEAD --
  src/safety.ts` and `-- src/cli.ts` printed the same diff as before, and
  `git status` was unchanged (`src/doctor.ts` is untracked). The one change
  left is the strengthened test.
- After the record, `npm run verify` exits 0: 111 tests, 109 pass, the 2
  live tests skipped, and `pack-smoke: the installed dbtruth doctor prints 8
  checks, every one ok`. `npm run acceptance -- --task T1.3` prints `T1.3:
  100/100`, every check and item passing.
### Iteration 3: 100/100 (the lead)
- The two NOTES entries of T1.3 are shortened to half, the facts unchanged.
  Doctor's API check is recorded as within R9 rather than as an open
  question: it is the full run's own first request, and the plan's check 8
  asks for it.

## T1.5 README quick start and troubleshooting
### Iteration 1: 55/100
- Tests first: `test/readme.test.ts` (new, in `test:unit`) failed against the
  README of T1.3 with `no troubleshooting row for ": no such column, nothing
  revealed"`: the README had no troubleshooting section, and the first message
  the test found, `--reveal`'s, had no row. Before any row was written, the 51
  pieces the test collects were printed and compared with an inventory of
  `src/` made by hand: every error was there, from all five ways a message
  reaches the user, and nothing that is not an error. The test's reasoning,
  and why it reads the source rather than a list, is in NOTES.md, 0.2.0.
- Built: the top of README.md in the plan's order: requirements (unchanged);
  two settings in `.env` at the repository root, `npx dbtruth doctor`, `npx
  dbtruth`, with `init` named only as coming in 0.2.0; the Monorepos paragraph
  of T1.1; a troubleshooting table of 32 rows covering every message, near
  ones sharing a row where the fix is the same, plus commander's errors, which
  a newcomer who types `npx dbtruth init` gets today; and the one commands
  list, `init`, `check` and `mcp` marked with the release T7.1 gives them. The
  sections below are unchanged.
- Found while checking the quick start against the parser, before the
  walkthrough: the example's `ANTHROPIC_MODEL=claude-sonnet-5     # optional;
  this is the default`, copied as shown, set the model id to the rest of the
  line (`readEnvFile` printed `{"ANTHROPIC_MODEL":"claude-sonnet-5     #
  optional; this is the default"}`), and a key check would then fail with
  `model "..." does not exist`. The example now holds the two settings only.
- Rows checked by running them, not only by reading the code: a `#` in the
  password gives `could not connect to the database (ERR_INVALID_URL)`, an `@`
  gives the authentication sentence, a missing `sslrootcert` file `(ENOENT)`,
  a URL without a password and `sslmode=require` or `no-verify` against the
  fixture the bare sentence; a fake server with a self-signed certificate
  gives `(DEPTH_ZERO_SELF_SIGNED_CERT)` under `verify-full` and is passed with
  `sslrootcert=<its certificate>` or `sslmode=no-verify`; a key with a curly
  quote gives `no API key found ... (Cannot convert argument to a ByteString
  ...)`; `dbtruth init`, `check` and `mcp` give `error: too many arguments.
  Expected 0 arguments but got 1: init.` and the rest.
- A new error without a row fails the test: a scratch file in `src/` printing
  `could not frobnicate the widget` through `err(` failed it with `no
  troubleshooting row for "could not frobnicate"`; the file was removed. This
  is a check of the test, not the sabotage record.
- A2 walkthrough, made by the implementing agent, which wrote this README and
  knows the code; not a fresh reader, not a person. `npm pack` of the working
  copy (`dbtruth-0.1.8.tgz`: the version is bumped at release) into a scratch
  directory; an empty project with `git init` and `npm init -y`; the tarball
  installed, in place of what `npx` fetches from npm; then only the quick
  start's steps: `.env` at the root with the fixture's `DATABASE_URL` and no
  key line, since this machine has no `ANTHROPIC_API_KEY`; `.gitignore`
  listing `.env`; `npx dbtruth doctor`, eight `ok` lines, exit 0; `npx
  dbtruth`, which stopped at the key check with `dbtruth: no API key found.
  ...` and exit 1. The full run was not reached, for want of a key. `npx
  dbtruth doctor` from `packages/api` printed `ok settings from ..\..\.env`.
  Time from `git init` to the last line: 21.4 s, 7 s of it the install.
  Reading time was not measured: an agent's says nothing of a person's.
  Friction, and what became of it:
  - The example's comment on the model's line: fixed in the README (above).
  - The old quick start put `.env` in the directory you run from, and did not
    say to keep it out of git: fixed.
  - Doctor's last line, `ok no API key: a full run needs ANTHROPIC_API_KEY;
    check and mcp do not`, names two commands that do not exist yet: the
    commands list now marks them as coming; the line is T1.3's, in the plan's
    words, and is unchanged.
  - Without a key, doctor passes and the run stops at the key. That is as the
    doctor paragraph says; a person with a key does not meet it.
  - The "no API key found" line ends with the SDK's long sentence in
    parentheses; its first sentence says what to do, and the row explains the
    rest. Unchanged (0.1.8's wording).
  - Not seen, because the package was installed first: `npx` asking to
    install dbtruth, and, until 0.2.0 is on npm, `npx dbtruth doctor` running
    0.1.8, which has no `doctor`. The commander row covers the second.
- `npm run verify` exits 0: 112 tests, 110 pass, the 2 live tests skipped, and
  the package smoke test passes.
- `npm run acceptance -- --task T1.5` prints `T1.5: 55/100`, every check
  passing. `npm run acceptance` over every task: T0.1, T0.2, T1.1, T1.2 and
  T1.3 still 100/100.
- BLOCKED A2 (-25): `FAIL T1.5 A2 acceptance: no evidence for: A person who
  has never seen the tool follows the README's quick start ...`. Cause: the
  lead asks for a fresh reader, an agent that knows nothing of this
  repository; this session has no tool to start one (no subagent tool, and no
  `claude` CLI on this machine), and the sessions `ListAgents` shows are the
  user's own interactive sessions, which were not used. The walkthrough above
  is the implementing agent's, so its evidence is left empty rather than
  passed off as A2. Question for the lead: start a fresh agent with only the
  README's quick start, the fixture's URL and a tarball from `npm pack`, as the
  walkthrough above set it up, or accept that walkthrough as A2's evidence, or
  leave A2 for a person.
- Lost Tests (-20): `FAIL T1.5 sabotage tests: no evidence for: Sabotage check
  (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage check is
  done by a later stage.
### Iteration 2: 55/100
- Thirteen review findings, each checked against the code and the plan first.
- Fixed, the test: with the rows for `could not read <path> (<error>)` and
  `could not connect to the database (<code>)` deleted from a copy of the
  README, `test/readme.test.ts` still printed `ok 1`. Cause: it looked for
  each piece between placeholders anywhere in the section, and those two
  messages' only pieces, "could not read" and "could not connect to the
  database", stand in other rows. Now each message must match a whole code
  span in the table's first column, a placeholder standing for any value,
  from the span's start (a cause at its end only; the read-only warning after
  `WARNING: `). That closed the first; the second stayed green because
  `connectFailure`'s fallback nested a template in its message, so the
  literal stopped at the start of every connection row. It is now two
  returns with the same output, and a new test in `doctor.test.ts` runs both
  (`#` in the password, `sslmode=require` against the fixture). Checked on
  copies: deleting each row in turn fails the test, commander's row aside;
  removing each span of a row that has several fails it, commander's three
  aside; rewording the `.env` warning to `could not read ${p}, skipped:
  ${error}` fails it with `no troubleshooting row for ...`, and so does a new
  `err("could not start the server")`. The five ways are written once
  (`WAYS`).
- Fixed, `process.stderr`, which the plan names: `main`'s last line was the
  one line written there directly; it now goes through `err`. A direct write
  added later is not read, and NOTES says so.
- Fixed, the README: the troubleshooting intro said doctor prints the
  setup's errors after `FAIL `, though a failed catalog read and a lost
  connection escape it and print after `dbtruth: `, and that a line after
  `dbtruth: ` not in the table is the system's, though the summary starts
  `dbtruth: <database>`; it now says only what holds. The trimmed-input row
  shows its three notes whole, where it had cut two of them, and says in the
  cause column where they are printed, as the skipped row now does too. Four
  rows no longer repeat defaults of `src/config.ts` that nothing keeps in
  step (the timeout, the output ceiling, the budget share, the input
  ceiling); they name the tunable. The read-only session row ended "It needs
  Postgres 12 or newer", which no upgrade fixes; it now says to point it at
  Postgres itself. The `could not write` row named a file held open on
  Windows, which never gives that message: `persist` removes the last run's
  files first, outside its per-file `try`. A PowerShell handle without delete
  sharing made Node's `rmSync(p, { force: true })` throw `EBUSY: resource
  busy or locked, unlink '...'`; with delete sharing the file was removed and
  written again without error; in `node:22-alpine`, offline, a directory
  without write permission gave `EACCES: permission denied, unlink '...'`.
  The row now names a directory that cannot be written or a full disk, and a
  new row gives the `EBUSY` and `EACCES` lines: the run stops after the model
  calls, with the files removed before it gone. Changing `persist` is a
  change of behaviour, left out of this task and named in NOTES.
- Fixed, NOTES: "Five rows were checked" listed four cases in two rows; it
  now lists what was run, as iteration 1 records it.
- Rejected: dropping `verify: `, `write: ` and `tokens: ` from `REPORT`. True
  that the two-word filter drops those lines anyway, but `REPORT` names what
  a run that goes well prints, and with them gone a progress line that gains
  a word would fail the build as an error without a row.
- Rejected: only naming the fragment gap in NOTES' "Not done", which one
  review proposed as cheaper than a fix. The gap is closed instead; NOTES
  names what whole matching still lets through (a message cut short by a
  nested template, a known start followed by a value).
- `npm run verify` exits 0: 113 tests, 111 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T1.5`
  prints `T1.5: 55/100`, every check passing but the two below.
- BLOCKED A2 (-25): `FAIL T1.5 A2 acceptance: no evidence for: A person who
  has never seen the tool follows the README's quick start ...`. Cause and
  question unchanged from iteration 1: no fresh reader has followed the quick
  start, and the implementing agent's walkthrough is not passed off as one.
- Lost Tests (-20): `FAIL T1.5 sabotage tests: no evidence for: Sabotage check
  (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage check is
  done by a later stage. The doctor test above was broken once to see it
  fail (the code dropped from the fallback: `+ 'FAIL could not connect to the
  database' - 'FAIL could not connect to the database (ERR_INVALID_URL)'`,
  then restored), which is a check of that test, not the record.
- The sabotage check of the task. `README.md`, `src/safety.ts`,
  `src/extract.ts` and `test/readme.test.ts` were copied outside the
  repository first; `test/readme.test.ts` was run under each sabotage, and
  `test/doctor.test.ts` as well under the one in `src/safety.ts`.
- Sabotage: the row for `could not read <path> (<error>)`, an unreadable
  `.env` on the way up, deleted from the troubleshooting table, its words
  still in the `--dotenv` and catalog rows; "every error the CLI can print has
  a row in the README's troubleshooting table" failed with "no troubleshooting
  row for "could not read ${relative(cwd, join(dir, ".env"))} (${error})"".
  Restored.
- Sabotage: the quick start's `.env` example given back its third line,
  `ANTHROPIC_MODEL=claude-sonnet-5     # optional; this is the default`; "the
  quick start's .env, copied as shown, is read as its two settings, each value
  alone" failed with "ANTHROPIC_MODEL is read as "claude-sonnet-5     #
  optional; this is the default"". Restored.
- Sabotage: `connectFailure` in `src/safety.ts` left the code out of its
  fallback (`if (code) return "could not connect to the database"`), so the
  table's `(<code>)` row no longer held; "a connection failure without a
  sentence of its own is named by its code, or by nothing" failed with
  "Expected values to be strictly equal": `'FAIL could not connect to the
  database'` where `'FAIL could not connect to the database
  (ERR_INVALID_URL)'` was expected. Restored.
- Sabotage: the trimmed-input row cut back to its first note, `sample rows
  dropped to fit the model's input limit`, as it was before iteration 2. Every
  test stayed green: `fitToContext` hands its notes to the CLI as `reduced:`,
  which the test did not read, so `UNSEEN` held only the words the three notes
  share, and a note reworded in `src/extract.ts` passed too. Strengthened
  "every error the CLI can print has a row in the README's troubleshooting
  table": `reduced` is a sixth way, read like the other five (the pattern
  takes a `:` after the name), and its entry in `UNSEEN` is gone. Run over
  `src/`, the new pattern takes those three notes and nothing else the old one
  did not. Repeated; the test failed with "no troubleshooting row for "sample
  rows and value lists dropped to fit the model's input limit"". Restored.
  With the README whole, `tables dropped` reworded to `whole tables dropped`
  in `src/extract.ts` now fails it too, with "no troubleshooting row for
  "sample rows, value lists and ${dropped} whole tables dropped to fit the
  model's input limit""; restored. NOTES.md now says six ways, and why.
- `README.md` (the first, second and fourth), `src/safety.ts` (the third) and
  `src/extract.ts` were restored each time from the copy and matched it byte
  for byte (`cmp`), and `git diff HEAD -- <file>` printed the same diff as
  before (none for `src/extract.ts`). The changes left are the strengthened
  test and its NOTES sentences.
- After the record, `npm run verify` exits 0: 114 tests, 112 pass, the 2 live
  tests skipped, and the package smoke test passes. `npm run acceptance --
  --task T1.5` prints `T1.5: 75/100`, every check and item passing but A2.
- BLOCKED A2 (-25): `FAIL T1.5 A2 acceptance: no evidence for: A person who
  has never seen the tool follows the README's quick start ...`. Cause and
  question unchanged from iteration 1.
### Iteration 3: 75/100
- The lead ran A2's walkthrough: a fresh agent that knew nothing of this
  repository followed only the quick start, against the fixture, in an empty
  git repository with the packed package installed and no API key. It reached
  a passing `npx dbtruth doctor` in 33 s of wall clock, about 3 minutes for a
  person reading, from the root and from `packages/api`; the full run stopped
  at the key, as expected. Its friction, decided by the lead, and what
  changed:
  - 1, decided by the lead: doctor's line for a missing key named `check` and
    `mcp`, which do not exist yet; the newcomer ran `npx dbtruth check` and
    got commander's `too many arguments`. The line names only `doctor` now.
    NOTES.md, 0.2.0 says that T3.2 and T5.1 add `check` and `mcp` to it when
    they ship.
  - 2, decided by the lead: a missing key printed `ok no API key ...`, so
    every line said ok and the next command failed, while the quick start
    promised "ok, or FAIL with what to fix". Lines that only inform have a
    marker of their own, `note`: `note no API key: a full run needs
    ANTHROPIC_API_KEY; doctor does not`, and `note 2 relations readable, 9
    not: measurements on those will be skipped` for a role that cannot read
    every relation, the other finding doctor only informs of, which the
    README's doctor paragraph already named with the key; `ok 11 relations
    readable, 0 not` is unchanged. A key the API rejects is still `FAIL`,
    and doctor still exits 1 only when one of checks 1 to 6 fails. The quick
    start's comment for `doctor` now says what `ok`, `FAIL` and `note` mean
    and when it exits 1, and the doctor paragraph says which findings are
    notes. NOTES.md records the third marker beside the plan's "ok or FAIL",
    and why. Changed with it, and named there: `NO_KEY` and the partial
    role's relations line in `test/doctor.test.ts`; `scripts/pack-smoke.mjs`,
    which runs the installed `doctor` without a key, takes `ok` and `note`
    lines and prints `pack-smoke: the installed dbtruth doctor prints 8
    checks, none failing`, the line T1.3's A5 check in
    `acceptance/checks.json` now reads; `test/readme.test.ts` counts `note `
    lines with `ok ` lines as not errors. CHANGELOG.md names the marker.
  - 3, decided by the lead: the full run's no-key error ended with the SDK's
    sentence in parentheses. Found in `@anthropic-ai/sdk` 0.123.0, with a
    script against the installed SDK: with no key, `validateHeaders` throws
    a plain `Error` (`Could not resolve authentication method. ...`); a key
    with a curly quote makes Node's `Headers` throw a `TypeError` (`Cannot
    convert argument to a ByteString ...`) while the SDK builds the header,
    before that check. Also found: an error while a reply streams in is the
    SDK's own `AnthropicError`, not an `APIError`, and reaches the same
    fallback: a local server that ended the event stream at once gave
    `request ended without sending any chunks`, one that cut it after its
    first event `terminated`. `explainApiFailure` decides by class: the
    plain `Error` gets "no API key found." and `KEY_HELP` alone; a
    `TypeError` or an `AnthropicError` keeps its words, as in 0.1.8. The
    troubleshooting row shows both messages, without and with the detail,
    and says what each means, a reply that broke off among them. Tests: the
    CLI test for a missing key in
    `test/integration.test.ts` still matches "no API key found" and
    "ANTHROPIC_API_KEY" and now fails if `Could not resolve authentication
    method` is printed; a new test in `test/cli.test.ts` runs a `.env` whose
    key holds a curly quote and expects `(Cannot convert argument to a
    ByteString` and no canary; a new test in `test/model.test.ts` ends a
    streamed reply before its first event and expects the SDK's words.
    `cli()` in `test/cli.test.ts` now leaves the key out of the environment
    instead of setting it empty, since an empty variable hides the file's
    key; no other test's `.env` holds one. Each of the three was checked to
    fail with its branch broken (the detail always kept; the `TypeError`
    dropped from the condition; the `AnthropicError` dropped), and
    `src/model.ts` was restored byte for byte (`cmp`); this is a check of
    the tests, not the sabotage record. Question for the lead: a reply that
    broke off still starts "no API key found", as in 0.1.8; it needs a
    sentence of its own and a row, a change beyond this decision, named in
    NOTES.md as not done.
  - 4, decided by the lead: `persist` joins `context/` to the working
    directory (`src/write.ts`), so from `packages/api` it lands in
    `packages/api/context/`. The Monorepos paragraph now says `context/` is
    written in the directory you run from, wherever the `.env` was found,
    and to run dbtruth from the directory whose `context/` the agent should
    read, usually the repository root, and commit that one. The
    nested-package test in `test/integration.test.ts` now checks that
    `packages/api/context/README.md` exists and the root has no `context/`.
  - 5, decided by the lead: the quick start's parenthetical is now its own
    sentence, "If the project is not a git repository, put the file in the
    directory you run dbtruth from."; the troubleshooting introduction says
    in order what the first column holds, where most messages appear in a
    full run and with what exit code, what `doctor` prints, and where a
    message not in the table comes from.
  - 6, considered, not a defect, decided by the lead: the newcomer saw 0.1.8
    in `package.json` while the README says a dbtruth older than 0.2.0 has no
    `doctor`. This unreleased build still carries 0.1.8; 0.2.0 is the version
    it ships as. Left as it is.
  - 7, decided by the lead: A2 is filled by the lead after a second
    walkthrough on the fixed README. Its evidence in `acceptance/manual.json`
    is left empty, and it is not counted as a point to earn.
- Review findings left open or partly addressed: none beyond the decisions.
- The sabotage record in `acceptance/manual.json` is left as it was; the next
  stage redoes it for what changed.
- `npm run verify` exits 0: 116 tests, 114 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T1.5`
  prints `T1.5: 75/100`, every check and item passing but A2. `npm run
  acceptance` over every task: T0.1, T0.2, T1.1, T1.2 and T1.3 still 100/100.
- Lost A2 (-25): `FAIL T1.5 A2 acceptance: no evidence for: A person who has
  never seen the tool follows the README's quick start ...`. Cause: filled by
  the lead after a second walkthrough on the fixed README (decision 7); not
  a point for this iteration to earn. No other point is lost.
- The sabotage check of what changed since iteration 2. `src/doctor.ts` and
  `src/model.ts` were copied outside the repository first; `readme`, `doctor`,
  `cli`, `integration` and `model` in `test/` were run under each sabotage.
- Sabotage: doctor's line for a missing key marked `ok` again (`ok no API key:
  a full run needs ANTHROPIC_API_KEY; doctor does not`); "as a command, the
  key check asks the API for the model and nothing else, and each API error it
  explains has its sentence" failed with "Expected values to be strictly
  equal": `'ok no API key: ...'` where `'note no API key: ...'` was expected.
  Four other tests in `test/doctor.test.ts` failed with it, "with no database
  URL doctor says where to set it, runs no database check, and still checks
  the key" among them. Restored.
- Sabotage: the key's line named `check` and `mcp` again (`note no API key: a
  full run needs ANTHROPIC_API_KEY; check and mcp do not`); "as a command, the
  key check asks the API for the model and nothing else, and each API error it
  explains has its sentence" failed with "Expected values to be strictly
  equal": `'... check and mcp do not'` where `'... doctor does not'` was
  expected. The same four others failed with it. Restored.
- Sabotage: `explainApiFailure` gave a missing key the SDK's words again, its
  last return ending `(${e instanceof Error ? e.message : String(e)})` as in
  0.1.8; "the CLI exits 1 with a clear message when no API key can be
  resolved, before touching the database" failed with "the SDK's own
  sentence, which names ways to sign in dbtruth does not use", the line
  ending `(Could not resolve authentication method. Expected one of apiKey,
  authToken, credentials, config, or profile to be set. ...)`. Restored.
- `src/doctor.ts` (the first two) and `src/model.ts` (the third) were
  restored each time from the copy and matched it byte for byte (`cmp`), and
  `git diff HEAD -- <file>` printed the same diff as before. Every sabotage
  failed at least one test, so no test was strengthened. The sabotage item in
  `acceptance/manual.json` now points at this record and iteration 2's.
- After the record, `npm run verify` exits 0: 116 tests, 114 pass, the 2 live
  tests skipped, and the package smoke test prints `pack-smoke: the installed
  dbtruth doctor prints 8 checks, none failing`. `npm run acceptance --
  --task T1.5` prints `T1.5: 75/100`, every check and item passing but A2.
- Lost A2 (-25): `FAIL T1.5 A2 acceptance: no evidence for: A person who has
  never seen the tool follows the README's quick start ...`. Cause unchanged:
  filled by the lead after a second walkthrough (decision 7).
### Iteration 4: 100/100 (the lead)
- A2, first walkthrough (07:35), before iteration 3: a fresh agent that knew
  nothing of the repository followed only the README, in an empty git
  repository with the packed package installed, against the fixture, with no
  API key. It is an agent standing in for a newcomer, not a person. A passing
  `npx dbtruth doctor` after 33 s, about 3 minutes for a person reading, from
  the root and from `packages/api`. Friction: `doctor` named `check` and `mcp`,
  which do not exist yet; a missing key printed `ok`; the no-key error ended in
  the SDK's sentence; the README did not say where `context/` lands from a
  package; two sentences read hard. Fixed in iteration 3.
- `explainApiFailure` told every failure outside the API as "no API key found",
  which iteration 3 left for a reply that broke off. Now each class says what
  happened: a plain `Error` "no API key found." only; a `TypeError` "could not
  send a request to the Anthropic API: <reason>" (a key a header cannot carry,
  or a bad `ANTHROPIC_BASE_URL`); the SDK's `AnthropicError` "the Anthropic
  API's reply broke off: <reason>. Run again." Three troubleshooting rows.
  Sabotage: the `AnthropicError` branch disabled; "a reply that breaks off says
  so, with the SDK's words, the only clue to what happened" failed (not ok 4).
  The `TypeError` branch disabled; "a key that is set but cannot be sent, such
  as one with a curly quote pasted into it, is named with the reason" failed
  (not ok 5). Both restored byte for byte.
- A2, second walkthrough (08:20), on the fixed README, by another fresh agent:
  a passing `doctor` after 31 s, 4 to 5 minutes estimated for a person, every
  line and message as the README says. Two small gaps, fixed: what to do with
  the key line without a key, and a `.gitignore` the project may not have. The
  version it saw, 0.1.8, against "older than 0.2.0 has no `doctor`", is this
  unreleased build's number, not a defect (iteration 3). A person should
  repeat the walkthrough before release.

## T2.1 Unbiased sampling without a catalog estimate
### Iteration 1: 80/100
- Fixture first: `test/fixtures/sampling.sql`, database `sampling`, mounted as
  `50-sampling.sql` after the existing files. Before relying on it, it was
  loaded into throwaway `postgres:12-alpine` and `postgres:18` containers:
  `ev`'s parent reads `reltuples` 0 on 12 and -1 on 18, `fresh_big` 0 and -1,
  each with `relpages` 0 over 1,637 pages by `pg_relation_size`, and the
  leaves 100,000 each. On both, `SELECT * FROM fresh_big LIMIT 50000` held
  batches 1 to 5 and no `introduced_late`, `SELECT * FROM ev LIMIT 50000` the
  dates 2024-01-01 to 2024-12-30 and no `only_2026`, and `TABLESAMPLE SYSTEM
  (16.67) REPEATABLE (1)` found all 30 batches and both values. Also checked
  by hand on both: `pg_relation_size` is 0 for a view and a partitioned table;
  `pg_partition_tree` lists every level of a two-level tree, the partitioned
  table itself included, and a `file_fdw` partition as relkind `f`;
  `TABLESAMPLE` on a parent with that foreign leaf works (the leaf is read
  whole); another session's temporary table sits in `pg_temp_N`, where
  `pg_is_other_temp_schema` is true.
- Tests first, against a stub `estimateRows` that kept 0.1.8's behaviour (the
  catalog's number, whatever it is):
  - `test/sampling.test.ts` (new, in `test:db`): "a never-analyzed large table
    is sized by a pilot sample and sampled across its whole file" failed with
    `status ["active","closed","paused"]: the value of the last 5% of rows`;
    "a partitioned table whose parent was never analyzed ..." with `kind
    ["buy","click","view"]: the value only the 2026 leaf holds`. Those are the
    first assertions of each, the bias itself; the source and the estimate
    come after. The per-table file test failed on `undefined` for `'pilot'`;
    the temporary-table test with `pg_temp_3.scratch` listed beside `ev` and
    `fresh_big`. The fixture precondition and "two runs give the same
    estimates and the same values" passed: the fixture is what it should be,
    and 0.1.8's plain path is deterministic too.
  - `test/extract.test.ts`: the five rule tests failed on the missing source
    or the missing pilot (`{ rowEstimate: -1, asked: [] }` for `{ rowEstimate:
    50000, estimateSource: 'pilot', asked: [ 10 ] }`); the four tests through
    `extract()` with a fake `Db` on `7000` for `60000`, `1` statement for 2,
    and so on. `test/config.test.ts`, `write.test.ts`, `verdict.test.ts`:
    `pilotPages` undefined, no `(estimated from a sample)`, no source in
    `assemble()`. Every existing test passed.
  - Numbers of 0.1.8 on the fixture, for NOTES: both tables sized -1 and
    sampled with the plain form; `ev.happened_on` years 2024 to 2024.
- Built: `estimateRows` in `extract.ts`, the plan's five rules in order, with
  the pilot statement handed in by `extract()`; pages and each partitioned
  table's leaves in `listRelations`; `estimateSource` on `Table` and
  `TableFacts`, set in `assemble()` and printed by `write.ts`; `profile()`
  dropping the source wherever the scan decides the size; `pilotPages` in
  `config.ts`; `pg_is_other_temp_schema` in `DESCRIBED_RELATIONS`.
- Found on the way, each with a test written first:
  - `deadTableQuery` labelled a count taken from the estimate
    `pg_class.reltuples`, which a pilot or the partitions may now have stood
    in for; "a dead-table count taken from the row estimate says so ..."
    failed with `'-- from the schema: pg_class.reltuples for fresh_big; ...'`
    before the label became `-- from the extract: the row estimate of
    fresh_big; ...`.
- Written after the implementation: "a partitioned table is not one of its
  own leaves: the fixture's events, analyzed whole, is the sum of its
  partitions". Nothing tested the SQL's leaf filter: `ev`'s parent is never
  analyzed, so counting it among its leaves adds nothing. With the filter
  removed (`WHERE true`) the test failed with `actual: 600` for 300; restored
  and matched byte for byte (`cmp`). A check of the test, not the sabotage
  record. With it, `t.isleaf` came out of the SQL: beside `relkind = 'r'` it
  says the same thing, only a partitioned table having partitions, and no
  test could tell the two apart.
- The same tests pass on Postgres 12 and 18 as on 16, against throwaway
  containers loaded with every fixture file in compose order, as CI loads
  them: `sampling`, `extract`, `integration`, `doctor`, `safety` and `scale`,
  63 tests, 61 pass, the 2 live tests skipped, on each. The estimates are the
  same on all three: `fresh_big` 279,812 from a pilot (6.7% low; the pilot at
  6.1% of 1,637 pages counted 17,093 rows), `ev` 300,000 from its leaves.
- `acceptance/checks.json`: A5's first pattern put `^# fail 0$` after the
  lookaheads, so they looked ahead from the end of the run and failed on a
  green suite. It is a lookahead now, and was checked on a saved `verify`
  output: true for the run, false with `# fail 1`, false with one of the named
  tests failing.
- `npm run verify` exits 0: 136 tests, 134 pass, the 2 live tests skipped, and
  the package smoke test passes. `npm run acceptance -- --task T2.1` prints
  `T2.1: 80/100`, every check passing. `npm run acceptance` over every task:
  T0.1, T0.2, T1.1, T1.2, T1.3 and T1.5 still 100/100.
- Existing tests: `git diff --numstat -- test/` shows only added lines in the
  four existing test files, besides the import line of
  `test/extract.test.ts`.
- Lost Tests (-20): `FAIL T2.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead, no point depends on either:
  - Rule 3 names the source `partitions` and sends a partitioned table with
    no known leaf to the pilot. Its source is `pilot` here, since the number
    came from a sample and the per-table file says so; `partitions` is the
    other reading.
  - `pg_relation_size` takes the lock a `SELECT` takes, so a table under an
    exclusive lock holds the relation listing until the statement timeout,
    and the run stops with `could not list relations`. Tables a view reads
    already did, through `pg_get_viewdef`. A lock timeout would be a new
    number; left as is, and named in NOTES.
### Iteration 2: 80/100
- Seventeen review findings, each checked against the code and the plan
  first. Tests were written or changed before each fix, and the four new ones
  failed on iteration 1's code for the reason they name.
- Fixed, a foreign partition (major): the listing kept only `relkind = 'r'`
  leaves, so a parent with a foreign partition and no known local leaf was
  piloted, and Postgres reads a foreign partition whole under `TABLESAMPLE`
  instead of failing, as the plan expected. New fixture relation `mixed`: a
  `file_fdw` partition over `seq 1 1000` and a local one of 59,000 rows never
  analyzed. Iteration 1 sized it 64,237 from a pilot that counted 24,518 rows
  on 38% of the local pages, the 1,000 remote ones among them. A tree with a
  foreign table now gets no leaves, and the parent is sized and sampled as in
  0.1.8. "a partitioned table with a foreign partition is sized and sampled
  as before 0.2.0 ..." failed with `actual: 'pilot'`, `expected: undefined`.
  The mocked test that claimed a foreign leaf makes `TABLESAMPLE` fail is
  retitled to what it tests, a refused sampled form.
- Fixed, the listing's locks: `pg_relation_size` ran on every relation, so a
  table under another session's `ACCESS EXCLUSIVE` lock held the listing
  until the statement timeout. It now runs only for a table or materialized
  view with no estimate; others take `relpages`, from the same `ANALYZE` as
  `reltuples`. Found on the way: `pg_partition_tree` locks every partition it
  lists (not the root), so a locked partition still holds the listing; named
  in NOTES as not done. New fixture table `analyzed`. "the listing opens no
  file the catalog has sized ..." (`LOCK TABLE ONLY ev, analyzed`) failed
  with `could not list relations: canceling statement due to statement
  timeout`.
- Fixed, sub-partitions without a test (major): new fixture table `nested`,
  two levels deep. "a sub-partitioned table is the sum of its leaves at every
  level ..." asserts 200,000 rows, source `partitions`, and `only_deep`, found
  only in a second-level leaf. It passed on iteration 1's code, which already
  counted every level; filtering the leaves to `t.level = 1` makes it fail
  with `actual: 100000`, `expected: 200000`.
- Fixed, this session's own temporary schema: `n.oid <> pg_my_temp_schema()`
  beside `pg_is_other_temp_schema`, so it matches the plan's rule, which
  leaves out every temporary schema. The temp-table test now also runs the
  condition in the session that made the table, and failed with `actual: 1`.
- Fixed, R7: the dead-table label names where the estimate came from, as it
  did before T2.1 for the catalog: `pg_class.reltuples`, the leaf partitions'
  `pg_class.reltuples`, or a pilot sample, or says there is none. The test,
  which had set a source the label ignored, pins all four. It failed with
  `'-- from the extract: the row estimate of big; ...'`.
- Fixed, `profile()`: the one decision, whether the estimate stands, is named
  once (`stands`), and gives both the estimate and its source. NOTES now
  gives the rule as the code has it: a source stays with a random sample, a
  plain scan that filled up under the estimate, or statistics that could not
  be taken.
- Fixed, the pilot formula: `n * 100 / percent`, with the pages that
  cancelled removed, and a comment that says why. Same numbers.
- Fixed, the checks: A4 is now a check of `src/config.ts` that needs the
  comment, `pilotPages: 100,` and its `overridable` range, and it absorbs the
  docs-part `config-comment` check, which the plan's Docs item does not name.
  The `notes` check needs the reproduction numbers (`LIMIT 50000` covering
  2024 only, 1,664 pages, ids 1 to 50,000 of 300,000). Both were run against
  copies with the comment, the range or a number removed, and failed on each.
  New checks: `sub-partitions`, `listing-lock` and `foreign-partition`.
  `sampled-form-refused` replaces `foreign-leaf-fallback`.
- Fixed, wording: README and CHANGELOG say the size is scaled up from a count
  over a few pages, not the count itself. The CHANGELOG sentence no longer
  has an unclear "it". The `extract.ts` header paragraph is wrapped to the
  header's width, and "the leaf partitions'" now ends on its noun. The NOTES
  lock paragraph is rewritten around what was fixed and what was not.
  `pilots` and its regex lookup are gone from the count-drops-source test.
- Rejected, the A5 check comparing test files with 3169a2e: the check would
  judge history, not a run. It would fail T2.1 the first time a later task
  changes an existing test, which section 4.4 allows when an A-item changes
  the behavior, and a release needs every task at 100. Pinning three
  assertion lines by regex repeats the tests' numbers in a second place and
  still leaves the rest unguarded. "Unchanged" is kept by 4.4 and by the diff
  record: `git diff --numstat 3169a2e -- test/*.test.ts` still shows only
  added lines in the files that existed, besides the import line of
  `test/extract.test.ts`.
- Rejected, the dead-table test setting a source the label never read: after
  the R7 fix the label reads it, and the test pins every source.
- Checks of the new tests, not the sabotage record, each file restored and
  compared with `cmp`: the foreign check made to match nothing failed the
  `mixed` test (`'pilot'`); the listing's `reltuples <= 0` removed, and
  separately its `relkind IN ('r', 'm')`, each failed the lock test with
  `could not list relations`; `pg_my_temp_schema()` removed failed the
  temp-table test; `estimateSource` kept whatever `stands` says failed "a
  size the plain scan counted ..." and "a pilot that finds no rows ...";
  `stands` without `n >= sampleRows` failed "the row estimate after the
  scan" (`60000` for `0`); the pilot scaled the wrong way failed the rule
  tests.
- The database tests (`sampling`, `extract`, `integration`, `doctor`,
  `safety`, `scale`: 67 tests, 65 pass, the 2 live tests skipped) pass on
  Postgres 12 (`12-alpine`) and 18, in throwaway containers loaded with every
  fixture file in compose order, as they do on 16. All three give the same
  sizes: `analyzed` 1,000, `ev` 300,000 and `nested` 200,000 from their
  leaves, `fresh_big` 279,812 from a pilot, `mixed` -1.
- `npm run verify` exits 0: 139 tests, 137 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.1`
  prints `T2.1: 80/100`, every check passing.
- Lost Tests (-20): `FAIL T2.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead, no point depends on it: rule 3 names the source
  `partitions` and sends a partitioned table with no known leaf to the pilot,
  whose source is `pilot` here (iteration 1).
- The sabotage check of the task. `src/extract.ts`, `src/write.ts` and
  `src/safety.ts` were copied outside the repository first; the task's test
  files (`sampling`, `extract`, `config`, `write`, `verdict`: 54 tests, all
  passing before) were run under each sabotage.
- Sabotage: `estimateRows` returned `-1` before the pilot (`return {
  rowEstimate: -1 }` ahead of rule 4); "a never-analyzed large table is
  sized by a pilot sample and sampled across its whole file" failed with
  "status ["active","closed","paused"]: the value of the last 5% of rows",
  and "a relation without an estimate is sized by a pilot over about
  pilotPages pages ..." with "never analyzed, Postgres 14 and later": `{
  rowEstimate: -1, asked: [] }` where `{ rowEstimate: 50000, estimateSource:
  'pilot', asked: [ 10 ] }` was expected; 8 tests failed. Restored.
- Sabotage: `listRelations` no longer handed on a partitioned table's leaves
  (the `leaves` line removed), `estimateRows` untouched; "a partitioned table
  whose parent was never analyzed is sized by its leaves and sampled across
  all partitions" failed with "kind ["buy","click","view"]: the value only
  the 2026 leaf holds", and "a sub-partitioned table is the sum of its leaves
  at every level ..." with "nested_1, and nested_2a and nested_2b one level
  further down": `-1 !== 200000`; 6 tests failed, while the rule tests of
  `estimateRows`, which hand the leaves in, stayed green. Restored.
- Sabotage: `isUnknown` took only `-1` as unknown (`s.estimate < 0`, without
  the Postgres 12 and 13 form, `0` over pages on disk). The fixture tests
  stay green on Postgres 16, which reports `-1`; "a relation without an
  estimate is sized by a pilot over about pilotPages pages ..." failed with
  "never analyzed on 12 and 13, or analyzed empty and loaded since": `{
  rowEstimate: 0, estimateSource: 'catalog', asked: [] }` where `{
  rowEstimate: 50000, estimateSource: 'pilot', asked: [ 10 ] }` was
  expected, and "leaves without an estimate take the known leaves' rows per
  page ..." with "0 over pages on disk is unknown too": `100000` for
  `150000`. Restored.
- Sabotage: the listing read pages from `c.relpages` alone, without
  `pg_relation_size` for a table with no estimate; "a never-analyzed large
  table is sized by a pilot sample and sampled across its whole file" failed
  with "status ["active","closed","paused"]: the value of the last 5% of
  rows", and "the per-table file says when a size was estimated from a
  sample, and only then" with `undefined` where `'pilot'` was expected. The
  unit tests, which hand pages in, stayed green. Restored.
- Sabotage: `tableFile` inverted its condition (`t.estimateSource !==
  "pilot"`); "a size estimated from a sample says so; one from the catalog,
  from the partitions or counted does not" failed with `'# fresh_big\n\ntable,
  ~279815 rows, primary key: none\n'` where the line with `(estimated from a
  sample)` was expected, and "the per-table file says when a size was
  estimated from a sample, and only then" with "The input did not match the
  regular expression /\ntable, ~279812 rows \(estimated from a sample\),
  primary key: none\n/". Two existing tests of `test/write.test.ts` failed
  with it, on `~500 rows (estimated from a sample)` for a size with no
  source. Restored.
- Sabotage: `DESCRIBED_RELATIONS` lost its temporary-schema condition (`AND
  NOT pg_is_other_temp_schema(n.oid) AND n.oid <> pg_my_temp_schema()`); "a
  temporary table is not the user's schema: neither the extract nor doctor
  lists another session's, nor the listing its own session's" failed with
  "Expected values to be strictly deep-equal": `'pg_temp_3.scratch'` listed
  after `'nested'`. Restored.
- Sabotage: the pilot statement lost `REPEATABLE (${cfg.sampleSeed})`; "two
  runs give the same estimates and the same values" failed with "fresh_big:
  the pilot reads the same pages every run": `305481 !== 316612`. The catch
  rests on two unseeded pilots counting different rows, so the test was run
  three more times under the sabotage and failed each time (`327351 !==
  312209`, `330379 !== 335978`, `327809 !== 268615`). Restored.
- Sabotage: `estimateRows` trusted a partitioned table's own `reltuples`
  before its leaves (`if (!isUnknown(rel)) return { rowEstimate:
  rel.estimate, estimateSource: "catalog" }` ahead of the leaves); "a
  partitioned table is not one of its own leaves: the fixture's events,
  analyzed whole, is the sum of its partitions" failed with "Expected values
  to be strictly equal": `'catalog'` where `'partitions'` was expected, and
  "a partitioned table whose leaves all have an estimate is their sum,
  whatever its own reltuples says" with "never analyzed, Postgres 12 and
  13": `{ rowEstimate: 0, estimateSource: 'catalog' }` where `{ rowEstimate:
  300000, estimateSource: 'partitions' }` was expected. Restored.
- `src/extract.ts` (the first to fourth, seventh and eighth), `src/write.ts`
  (the fifth) and `src/safety.ts` (the sixth) were restored each time from
  the copy and matched it byte for byte (`cmp`), and `git diff HEAD --
  <file>` printed the same diff as before. No sabotage left every test green,
  so no test was changed.
- After the record, `npm run verify` exits 0: 139 tests, 137 pass, the 2
  live tests skipped, and the package smoke test passes. `npm run acceptance
  -- --task T2.1` prints `T2.1: 100/100`, every check and item passing.

## T3.1 `context/snapshot.json`
### Iteration 1: 80/100
- Read first: the design brief for T3.1 and T3.2, with the lead's decisions in
  its section 12, and `git show HEAD:src/extract.ts` for T2.1's names as
  committed: `Size { estimate, pages }`, `leaves`, `estimateRows(rel,
  pilotPages, pilot)`. The brief's section 1 used the same names; the code was
  followed where it spoke of T2.1 as planned.
- Tests first, run against HEAD's source:
  - `test/snapshot.test.ts` (new, in `test:unit`) and the five database tests
    appended to `test/integration.test.ts` failed to load, `Cannot find module
    .../src/snapshot.js`; `test/extract.test.ts` and `test/sampling.test.ts`,
    whose five call sites now read the catalog first, on `does not provide an
    export named 'readCatalog'`.
  - "a dead-table age that is not a finite number is left out" got `{ exact:
    1, count: 120, ageDays: -Infinity }`; "the dead-table age is counted in
    whole days by the statement ..." the statement with `EXTRACT(...) /
    86400.0` and no `floor`; "a file of the last run that cannot be removed
    is reported ..." threw `SystemError [ERR_FS_EISDIR]: Path is a directory:
    rm returned EISDIR (is a directory) ...\context\tables\held.md`; "the last
    run's snapshot is cleared with its other files ..." found it still there;
    "fixture_template is created last ..." `'sampling.sql'` for
    `'template.sql'`. The structure test passed: `snapshot.ts` did not exist.
  - To see each snapshot test fail on its own assertion, they were then run
    against the real declarations in `schemas.ts` and a stub `snapshot.ts`
    that wrote plain `JSON.stringify` in the order it was given, with no
    marking, no fingerprint and no validation, beside the refactored
    `extract.ts` and a `cli.ts` that wrote no snapshot. "serialize writes
    sorted keys ..." got the one-line JSON with the keys in the order they
    were built; "claims and relations are ordered by code units ..." `['b',
    'ä', 'B', 'a', 'Z']` for `['B', 'Z', 'a', 'b', 'ä']`; "the fingerprint is
    sha256 of the schema only" `''`; "toSnapshot lists every catalog relation
    ..." `['orders', undefined]` first where `['audit', false]` was expected;
    "parseSnapshot refuses ..." threw `Unterminated string in JSON at position
    25`; "readSnapshot refuses ..." threw `ENOENT`; "a claim stated twice ..."
    two claims, `inferred` and `stated`. "claim text with newlines ..." passed:
    plain JSON round-trips text. The three full-run tests failed on `ENOENT
    ... context\snapshot.json`, the two on copies on `fixture_template does
    not exist: recreate the fixture databases with docker compose down -v &&
    docker compose up -d --wait`, and once the template was loaded, the
    fingerprint test on `Expected "actual" to be strictly unequal to: ''`.
  - "readCatalog reads three catalog statements and nothing inside the
    budget" and "extract profiles only the relations of the catalog it is
    given" failed only on the missing export, and passed with the refactor
    before anything else was built: they pin a move of code that changes
    nothing it does. Every existing extract and sampling test passed on it
    too, so no test depends on the row estimate now coming after the keys
    inside a `Table`.
- Built, as the brief and its section 12 say: `CatalogRelation`,
  `schemaOnly` (moved), `SNAPSHOT_FORMAT` and `SnapshotSchema` in
  `schemas.ts`; `readCatalog` and `extract(db, cfg, catalog, opts)` in
  `extract.ts`, and `ORDER BY conrelid, conname` in `listKeys`; `snapshot.ts`
  (`measuredWith`, `schemaOf`, `toSnapshot`, `serialize`, `parseSnapshot`,
  `readSnapshot`); `SNAPSHOT_FILE` in `write.ts`, cleared with the last run's
  files, and a stale file that cannot be removed reported in `failed`;
  `VERSION` at module scope in `cli.ts`, the server version read once after
  the catalog, the snapshot added to the files `persist` writes; in
  `verify.ts` the age floored to whole days in SQL and kept only when finite;
  `test/fixtures/template.sql`, mounted last as `90-template.sql`, and
  `test/copies.ts`. The fixture databases were reloaded with `docker compose
  down -v && docker compose up -d --wait`; `fixture_template` is there, a
  template that takes no connections.
- Docs: README (the quick start names the snapshot; "Giving it to your
  agent": commit `context/snapshot.json`; "What it does not do": the history
  line; rows for the seven snapshot sentences; the `could not write` row
  takes the failed removal, and the row for the system's `EBUSY` and `EACCES`
  is gone; Development: `fixture_template` and reloading the databases),
  NOTES (the T3.1 entry, and T1.5's not-done item on `persist` marked done
  here), CHANGELOG. No option was added, so `--help` is unchanged.
- Checks of the new tests, not the sabotage record: with `ORDER BY conrelid,
  conname` removed from `listKeys`, "the fingerprint changes when a column is
  added in a copy of fixture_template, and not otherwise" failed on Postgres
  16, twice, with "a key dropped and added again under its name is the same
  key" (`sha256:0497...` for `sha256:743c...`); `src/extract.ts` restored
  from a copy and matched with `cmp`. The brief expected this test might stay
  green; on 16 it does not.
- One assertion of mine was wrong at first: with `--model-max-input-tokens
  500` two relations fit, not one. The test now reads how many were sent
  from the disclosure line and expects exactly those to be examined.
- Sizes, for the 10 MB limit's comment and README row: the fixture's
  snapshot is 6,027 bytes; the `scale` database's, 300 tables of five
  columns and no claims, 145,203 bytes.
- The database tests (`doctor`, `integration`, `safety`, `sampling`,
  `scale`: 58 tests, 56 pass, the 2 live tests skipped) pass on Postgres 12
  (`12-alpine`, 12.22) and 18 (18.6), in throwaway containers loaded with
  every fixture file in compose order, the template last, as on 16. No copy
  was left on either.
- Existing tests: `git diff -U0 -- test/*.test.ts` removes only the import
  lines, the five `extract` call sites (`sized` and `tablesOf` in
  `extract.test.ts`, three in `sampling.test.ts`), `fakeModel`'s signature
  and reply line in `integration.test.ts`, which now takes the claims to
  reply with and defaults to the old ones, and `cli.ts`'s line of the
  structure map; everything else is added.
- `npm run verify` exits 0: 159 tests, 157 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.1`
  prints `T3.1: 80/100`, every check passing. `npm run acceptance` over every
  task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.5 and T2.1 still 100/100.
- `acceptance/manual.json` has the T3.1 sabotage item with empty evidence, as
  every task has; before it was added the script printed 100/100 for a task
  with no record.
- Lost Tests (-20): `FAIL T3.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead, no point depends on either:
  - T7.1 puts T3.1 in 0.3.0, while NOTES and CHANGELOG have one open heading,
    0.2.0 (unreleased), where the entries went. If 0.2.0 is cut before T3.1,
    they move to a 0.3.0 heading.
  - README's "Output on the fixture" is a pasted live run that wrote thirteen
    files; a run now writes fourteen. It is regenerated at release (T7.1,
    step 5), which needs an API key.
### Iteration 2: 80/100
- Sixteen review findings, each checked against the code and the plan
  first. Tests were written or changed before each fix, and each new or
  changed one failed on iteration 1's code for the reason it names.
- Fixed, the order of copies decided the snapshot (bugs): `claimsSchema`
  kept the first of two copies of a relationship with one basis, and
  extended the first suspicion's detail with each later one not already
  inside it, so a reply that gave a claim twice in other words wrote other
  bytes in another order, against A2. Of two copies with one basis, the one
  whose JSON sorts first is kept; details are each kept once and joined in
  code-unit order. The byte-identical test now gives a relationship and a
  suspicion twice; on iteration 1's code it failed with the reversed run
  keeping `"reason": "orders belong to customers"` where the first kept
  `"name"`. New unit test "copies of one claim come to the same claim
  whatever order the reply gives them in" failed with the two parses
  unequal. A detail inside another (`empty`, `empty beside vehicles`) is now
  kept, a change for model replies too; the existing `a; b` test is
  unchanged and passes.
- Fixed, the merge took quadratic time (bugs): details are gathered in a set
  and joined once. "forty thousand copies of one suspicion parse in under
  two seconds" failed with `22424 ms` and now takes about 400.
- Fixed, a stale file reported twice (quality, major): `persist` removes only
  what this run does not write again; a file it writes again is replaced by
  the write. New test "a file this run writes again is replaced, not removed
  first, so one that cannot be is reported once" failed with `[
  'context\tables\orders.md', 'context/tables/orders.md' ]`. A writable
  file in a directory this user cannot write is now replaced and not reported
  as not removed. A read-only file in a writable directory, which the old
  removal got past, is now reported as not written. README row, NOTES and
  CHANGELOG say so; the snapshot test, whose "leaves none" no longer holds, is
  retitled "the last run's snapshot is cleared like its other files, and
  only the one at the top of context/".
- Fixed, `measuredWith` took any number (rules, major): `parseSnapshot` puts
  the settings through `resolveConfig` as flags, so each range in
  `overridable` and the order of the join bands are checked by the code that
  checks them for flags, and a failure reads `<file> is not a dbtruth
  snapshot: measuredWith: <the flag's sentence>`. The reviewer's call as
  written would refuse a snapshot from `--sample-rows 10`, since the default
  `sampleRowsShown` of 15 would exceed it; `sampleRowsShown` goes in as 0,
  which the snapshot does not record and `check` does not use. Three
  refusals and that acceptance were added to "parseSnapshot refuses ...",
  which failed with the parsed object where the sentence was expected. The
  README row has the new form, as `readme.test.ts` required.
  `sampleOversample` and `sampleSeed` have no range (T2.1): named in NOTES.
- Fixed, the dead-table age rounded down (rules): `ceil`, not `floor`. For a
  whole `staleAfterDays` the rounded age is over it exactly when the age is,
  so the verdict boundary stays where it was, and floor had moved it by up
  to a day, which section 4.4 does not allow without an A-item. The query
  test failed on the `floor(` statement. NOTES and CHANGELOG say the
  boundary did not move; a fraction in the setting now counts as the whole
  days below it (90.5 acts as 90).
- Fixed, `serverVersionNum` and `toolVersion` untested (plan): "every full
  run writes ..." compares them with `current_setting('server_version_num')`
  read on a connection of its own and with `package.json`. With
  `serverVersionNum = 0` in `cli.ts` it failed with `actual: 0, expected:
  160015`; `cli.ts` restored and matched with `cmp`.
- Fixed, no reader-role run (plan, section 5.3 item 4): the same test runs a
  fifth time as `reader`, asserts no `WARNING:` line, and compares its
  fingerprint and relations with the full run's. It passed at once: the
  behaviour was right and is now pinned.
- Fixed, the fitted run's check (quality): it compares the names of the
  relations the model was sent, read from the request as the whole-loop test
  does, with those not marked, instead of a count parsed from the disclosure
  line. Not `--json` as proposed: `Verified.tables` is what `toSnapshot`
  itself reads, and the request is a source of its own.
- Fixed, T3.1 under 0.2.0 (plan): T7.1 puts T3.1 in 0.3.0, so CHANGELOG and
  NOTES have a `0.3.0 (unreleased)` heading with the T3.1 entries under it,
  and the `changelog` and `notes` checks are anchored to it, the changelog
  one between it and 0.2.0. The CHANGELOG entry no longer says "coming in
  0.3.0" inside 0.3.0.
- Fixed, smaller: the `measuredWith` function is gone,
  `SnapshotSchema.shape.measuredWith.parse(cfg)` keeps the settings the
  schema lists (the unit test that pins them is unchanged and passes);
  `RelationKind` and `Verdict` are inferred from zod schemas that
  `SnapshotSchema` uses, so their literals are written once; README says the
  snapshot is for `check` to measure again, not read back, and not "on every
  pull request", which is the Action's; NOTES no longer cites a design brief
  that is not in the repository.
- Partly taken, the 10 MB limit outside `config.ts` (rules): kept a
  constant. The plan sets 10 MB in T3.2 and lists no tunable for it in
  Appendix C, and a config number the plan does not ask for is against the
  lead's bar. The reason is now the real one, in the source and in NOTES
  under R5's wording: the file is written on one machine and read on
  another. The write-time warning is not added: it would still leave no way
  to check such a snapshot. Open for the lead.
- Rejected, the `staleAfterDays` comment (quality): with `ceil` the comment,
  "older than this many days is dead", is true again for a whole number of
  days; the fraction is in NOTES.
- Rejected, `SET search_path = public` in `connect` (bugs, major): the
  finding is right that `format_type` and `pg_get_viewdef` follow the
  session's path, so another role's path writes another fingerprint. The fix
  would make things worse. On a scratch database on the fixture server
  (dropped after) with `citext` in schema `extensions`, as Supabase installs
  it, the path `"$user", public, extensions` gave type `citext` and 1 match
  for `posts.author = users.email`; `public` alone gave
  `extensions.citext`, which `typeFamily` does not take for text, so a
  `citext` key column would be shown to the model (R3), and 0 matches, a
  false broken relationship. Named in NOTES' not done, for T3.2.
- `npm run verify` exits 0: 162 tests, 160 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.1`
  prints `T3.1: 80/100`, every check passing, with the new checks
  `rewritten-once`, `claims-any-order` and `merge-linear`, and
  `test/schemas.test.ts` added to the T3.1 command.
  `npm run acceptance` over every task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.5
  and T2.1 still 100/100.
- Lost Tests (-20): `FAIL T3.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage. The two breakages above check the new
  assertions; they are not that record.
- Open for the lead, no point depends on any:
  - Whether the 10 MB limit should become a tunable, which Appendix C does
    not list; a schema of some twenty thousand relations writes a snapshot
    `check` will refuse.
  - The session's `search_path` in the fingerprint (above), for T3.2.
  - Seen on the way, outside T3.1: `typeFamily` takes `extensions.citext`
    for "other", so on a role whose path lacks the extension's schema a
    `citext` key column is shown to the model today.
  - README's "Output on the fixture" still shows thirteen files written
    (iteration 1); it is regenerated at release, which needs an API key.
- The sabotage check of the task. `src/snapshot.ts`, `src/cli.ts`,
  `src/write.ts`, `src/schemas.ts` and `src/verify.ts` were copied outside
  the repository first; the task's test command (`snapshot`, `schemas`,
  `extract`, `verify`, `write`, `ci`, `sampling`, `integration`: 82 tests,
  80 passing and the 2 live tests skipped before) was run under each
  sabotage.
- Sabotage: `canonical` kept each object's keys in the order they were built
  (`Object.keys(object)` without `.sort()`); "serialize writes sorted keys
  at every level, two-space indent and a final newline" failed with
  "Expected values to be strictly equal": `"verdicts"` first where
  `"claims"` was expected, and "claims and relations are ordered by code
  units, whatever their order" with "the same claims and relations in
  reverse give the same bytes"; 4 tests failed, "two runs whose claims come
  in different orders write byte-identical snapshots" among them. Restored.
- Sabotage: `toSnapshot` marked no relation as not examined (the relations
  written as `schemaOf` gives them); "toSnapshot lists every catalog
  relation, marks those not examined, and carries no categorical value"
  failed with "skipped over budget or dropped to fit the model: in the
  catalog, not in Verified": `['audit', undefined]` where `['audit',
  false]` was expected, and "every full run writes context/snapshot.json,
  and it validates" with "every relation listed, with its columns, and none
  examined". Restored.
- Sabotage: `run` built the snapshot and handed `persist` only the model's
  files (`persist(opts.cwd, files)`); "every full run writes
  context/snapshot.json, and it validates" failed with "no
  context/snapshot.json: run npx dbtruth first", as did "a relation whose
  name needs quoting is listed as the catalog names it", and the
  byte-identical and canary runs with `ENOENT ... context\snapshot.json`; 4
  tests failed. Restored.
- Sabotage: `previousOutputs` no longer listed `snapshot.json`; "the last
  run's snapshot is cleared like its other files, and only the one at the
  top of context/" failed, but with "The expression evaluated to a falsy
  value" and, through tsx's source map, the text of another test: nothing
  said what was wrong. Its first assertion had no message, unlike the one
  beside it; it now has one, "the last run's snapshot does not survive a
  run that writes none", and the repeated sabotage failed the test with
  exactly that. Restored.
- Sabotage: `parseSnapshot` returned before holding `measuredWith` to the
  flags' ranges (`return parsed.data;` ahead of `resolveConfig`);
  "parseSnapshot refuses what is not a snapshot, each with its own
  sentence" failed with the parsed snapshot where "context/snapshot.json is
  not a dbtruth snapshot: measuredWith: DBTRUTH_SAMPLE_ROWS / --sample-rows:
  0 is below the minimum 1" was expected. Restored.
- Sabotage: `readSnapshot` lost its size check; "readSnapshot refuses a
  missing file, a directory and a file over 10 MB before parsing" failed
  with the parsed snapshot where "context\large.json is larger than 10 MB,
  the most dbtruth reads" was expected. Restored.
- Sabotage: `toSnapshot` also wrote `Verified.tables` (`tables:
  verified.tables` after the verdicts); "toSnapshot lists every catalog
  relation, marks those not examined, and carries no categorical value"
  failed with "The input was expected to not match the regular expression
  /canary-pii/", and "the snapshot carries only what Verified carries, and
  no hidden value, even with --reveal" with `'tables'` among the top-level
  keys; 3 tests failed. Restored.
- Sabotage: `claimsSchema` kept the first of two copies of a relationship
  with one basis again (HEAD's `prev.basis === "inferred" && named.basis ===
  "stated"`); "copies of one claim come to the same claim whatever order the
  reply gives them in" failed with "Expected values to be strictly
  deep-equal": `reason: 'orders belong to customers'` where `'named like
  it'` was expected, and "two runs whose claims come in different orders
  write byte-identical snapshots" with the reversed run keeping `"reason":
  "orders belong to customers"` where the first kept `"reason": "name"`.
  Restored.
- Sabotage: the dead-table age went back to a fraction of days (HEAD's
  `EXTRACT(...) / 86400.0`, without `ceil`); "the dead-table age is counted
  in whole days by the statement, so the number kept is the number it
  reruns to" failed with "Expected values to be strictly equal": the
  statement without `ceil(` where the one with it was expected, and "two
  runs whose claims come in different orders write byte-identical
  snapshots" with the two files unequal from the verdicts on. Restored.
- Sabotage: the fingerprint was taken over the relation names alone
  (`JSON.stringify(sorted.map((r) => r.name))`); "the fingerprint is sha256
  of the schema only" failed with "a column added", and "the fingerprint
  changes when a column is added in a copy of fixture_template, and not
  otherwise" with "Expected "actual" to be strictly unequal to:
  'sha256:e1e5...'". Restored.
- `src/snapshot.ts` (the first, second, fifth to seventh and tenth),
  `src/cli.ts` (the third), `src/write.ts` (the fourth), `src/schemas.ts`
  (the eighth) and `src/verify.ts` (the ninth) were restored each time from
  the copy and matched it byte for byte (`cmp`); for the four tracked files
  `git diff HEAD -- <file>` printed the same diff as before, and
  `src/snapshot.ts`, untracked, has none. No copy of `fixture_template` was
  left. No sabotage left every test green; the one test change is the
  message above, in `test/write.test.ts`.
- After the record, `npm run verify` exits 0: 162 tests, 160 pass, the 2
  live tests skipped, and the package smoke test passes. `npm run acceptance
  -- --task T3.1` prints `T3.1: 100/100`, every check and item passing.

## T3.2 `dbtruth check`
### Iteration 1: 80/100
- Read first: sections 0 to 5 and T3.2 of the plan, the design brief for T3.1
  and T3.2 with the lead's decisions in its section 12, and how T3.1 landed
  (`snapshot.ts`, `readCatalog` and `extract(db, cfg, catalog, opts)`,
  `cli.ts`, `test/copies.ts`, its NOTES entry and both iterations above).
  Where T3.1 differs from the brief the code was followed: the settings a
  snapshot records are `SnapshotSchema.shape.measuredWith.parse(cfg)`, not a
  `measuredWith` function, and `parseSnapshot` already holds them to the
  flags' ranges.
- Found in the working copy: an earlier attempt at this task that had left no
  entry here: `src/check.ts`, `test/check.test.ts`, `test/remeasure.test.ts`,
  `test/canned.ts`, and changes to `cli.ts`, `config.ts`, `doctor.ts`,
  `schemas.ts`, five test files, the docs and `acceptance/`. It was read line
  by line against the brief, section 12 and the code, run, and kept where it
  held; what changed is listed below. Its tests had no recorded first
  failure, so they were run first here, against the code before it, in a copy
  of the tree outside the repository (sources from `git show HEAD:`, the new
  tests beside them).
- Tests first:
  - On HEAD's sources, T3.1 as committed: `check.test.ts` and
    `remeasure.test.ts` failed to load, `Cannot find module .../src/check.js`;
    the tolerance test got `undefined` for `0.01`; the five doctor tests that
    pin the key line got `note no API key: a full run needs ANTHROPIC_API_KEY;
    doctor does not`; "check.ts and snapshot.ts never import model" failed on
    `ENOENT ... src\check.ts`.
  - On a stub `check.ts` that trusts the snapshot (no statement, every claim
    unchanged, no relation, never failing, the count line alone), with the
    real `cli.ts`, `config.ts` and `schemas.ts`: 24 of the 29 tests in the two
    new files failed on their own assertions. The table and the matrix on
    "relationship confirmed → broken", `['unchanged']` for `['regression']`;
    drift `['unchanged']` for `['drift']`; stale `[['unchanged', undefined]]`
    for `[['stale', 'customers']]`; the relations test `[]`; the empty
    snapshot `check shop: 0 unchanged` for `check shop: no claims`; the notes
    test no setting and no schema change; `fails` false under `regression` for
    a regression; `reportLines` the count line alone. On the database the
    regression, the dropped table and the new table exited 0 for 2; improved,
    drift, the filled table, the settings, the other database, the retyped
    column and the empty snapshot printed the count line alone where their
    lines were expected; the budget test found 0 `not measured` lines for 11;
    the hostile test `[]` for its two stale claims; "check profiles only the
    relations its claims name" saw no statement at all; the canary test
    exited 0 for 2. "an unchanged database passes ..." passed its first half,
    since a stub that trusts the snapshot hands its numbers back, and failed
    on the sampled half, which expects the note that `sampleRows` 100 differs
    from this run's.
  - Passed on the stub, as they should: "a snapshot with duplicate claim ids
    gives one item per id" (`claimsSchema` merges them, T3.1); "a snapshot
    that cannot be used exits 1 ..." and the exit-1 test, which judge
    `runCheck`'s order and `readSnapshot`'s sentences, real in that run;
    "check sends nothing to the Anthropic API ..." and "check runs as the
    reader role ...", guards a stub cannot break; the tolerance and structure
    tests.
- Changed in this iteration:
  - A test "check takes its options after its name, and the program's before
    it", spawned: the program's `--url` with `--snapshot elsewhere.json` after
    the name prints `no elsewhere.json: run npx dbtruth first`; `check
    --dotenv ci.env`, with no `DATABASE_URL` in the environment, gets the URL
    from the file and stops at the missing snapshot; `--check-hit-rate-tolerance
    2` after the name is refused with its range sentence. The exit-1 test also
    runs `check` with no database URL, which A5 lists. On HEAD's `cli.ts` the
    two failed with `error: unknown option '--fail-on'` and `error: unknown
    option '--snapshot'`.
  - `CheckClass`'s comment in `schemas.ts` cited `BUILD_PLAN.md`, which no
    other source comment does; it names `check.ts`. `remeasure` and `fails`
    got the one-line comments every other export has.
  - README and CHANGELOG said stderr gets a line per claim that moved; a
    relation added or dropped gets one too. NOTES names `--dotenv` for the
    plan's `--env-file` and `verdicts()` for the plan's `assemble`.
  - `acceptance/checks.json`: the renamed exit-1 test in `A5` and `exit-1`,
    and an `options` check.
- As built (the brief, sections 1, 2, 4 to 9, with the lead's decisions):
  `setup()` in `cli.ts`, the full run's first step moved as it was and shared
  with `runCheck`; `runCheck` reads the settings, then the snapshot, before
  anything connects, then connects with the read-only proof; the `check`
  subcommand with `--snapshot`, `--fail-on` (choices, default `regression`),
  `--url`, `--dotenv` and a flag per tunable, merged over the program's
  options as `doctor` does; `checkHitRateTolerance` (0.01, 0 to 1, its
  variable and flag) in `config.ts`; `check.ts` with `remeasure`, `diff`,
  `fails` and `reportLines`, importing `type Db` from `safety` (section 12);
  `CheckReport` as TypeScript types in `schemas.ts`; doctor's key line; the
  canned claims in `test/canned.ts`; `copyOfFixture` returning the copy's
  name.
- Docs: README (the section "Keeping context true: dbtruth check" with the
  exit codes and the classes in short form, the Commands list without
  "coming" for `check`, the `--fail-on` choices row with commander's real
  text, the no-key row naming `check`, the "not built yet" row without
  `check`, the snapshot rows without "coming"), NOTES (the T3.2 entry under
  0.3.0), CHANGELOG, and `--help` (`check [options]` with its own options;
  `--check-hit-rate-tolerance` on both).
- Postgres 12 (12.22) and 18 (18.6), in the containers on 54312 and 54318
  loaded with every fixture file and the template: `check`, `remeasure`,
  `integration` and `doctor`, 59 tests, 57 pass and the 2 live tests
  skipped, on each. No copy was left on any of the three servers.
- Time, on `fixture` itself after an offline full run (a script in the
  scratchpad, not a test): `runCheck` in process 86 to 98 ms over three runs,
  and `tsx src/cli.ts check --url <fixture>` 1,157 to 1,197 ms, exit 0,
  stdout empty, `check fixture: 12 unchanged`; the test on a copy asserts
  under 5 s. NOTES gives both numbers.
- `npm run verify` exits 0: 194 tests, 192 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.2`
  prints `T3.2: 80/100`, every check passing. `npm run acceptance` over
  every task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.5, T2.1 and T3.1 still
  100/100, after doctor's key line and T1.5's commands check changed.
- Lost Tests (-20): `FAIL T3.2 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- No failure outside this task was seen: the full suite passed three times
  (`verify`, and inside each acceptance run), `remeasure.test.ts` six times
  on Postgres 16 and once each on 12 and 18. Nothing to add on the rare
  flake.
- Open for the lead, no point depends on either:
  - README's "Output on the fixture" is still the pasted live run of
    iteration 1 of T3.1, with thirteen files; it is regenerated at release,
    which needs an API key.
  - The check's own lines print claim ids and relation names as the
    snapshot and the catalog spell them; a name holding a newline could forge
    a line. Named in NOTES as not done; T3.3's Markdown must escape them.
### Iteration 2: 80/100
- Four reviews (plan, rules, quality, bugs) gave fourteen findings. Each was
  checked against the code, the plan and a run before anything changed; all
  fourteen held, three of them only in part (below).
- Fixed, in `src/`:
  - A claim the full run could not measure (past the statement timeout, over
    budget) whose table or column was then dropped came out `unchanged`, since
    stale needed a measured claim. Now `diff` marks it stale unless the
    snapshot's schema lacked one of its names too and the snapshot could not
    measure it, a table the model invented; `classify` returns stale on any
    missing name it is handed. The hostile claims, marked confirmed on names
    no schema had, stay stale.
  - A move of exactly `checkHitRateTolerance` could be `unchanged`: 410/500 -
    405/500 is 0.009999999999999898 in doubles. The comparison allows
    `Number.EPSILON`, with a comment saying why.
  - `sampleOversample` in a snapshot was any number, and at 0 every sample was
    `LIMIT 0`, every sampled claim empty and the check passing. The schema
    holds it to at least 1. Not by `overridable` rows, which would add two
    flags the plan does not ask for (T2.1 left both without one); not the
    seed, which `REPEATABLE` takes as any finite number (`REPEATABLE
    (1e+300)` runs on the fixture), so `.int()` would refuse nothing harmful.
  - `CHECK_CLASSES` in `schemas.ts` is the one list of classes, in report
    order, and `CheckClass` is read from it; `CLASS_ORDER` is gone. The fix
    line is printed when `fails(report, "change")`, not by a second list of
    classes. `settingsOf` in `snapshot.ts` flattens `measuredWith` for both
    `parseSnapshot` and `diff`; the generic `flat` in `check.ts` is gone.
- Fixed, in the tests:
  - A1 compared the verdicts measured again with the snapshot's own, which a
    `remeasure` that trusts the snapshot passes. It now hands `remeasure` the
    snapshot with every measurement blanked (`query ""`, no numbers), in both
    halves. The reviewer's `queries.length > 0` was left out: the deep-equal
    already needs every statement verify builds.
  - A3's no-API test ran with an empty key, so the SDK could send nothing
    whatever `check` did. It spawns `check` with a key and the recording
    `ANTHROPIC_BASE_URL`, then again with no key.
  - A2 had no database test for "confirmed or broken → rejected" or for a
    suspicion that comes true. The regression test goes on to move four of
    every five line items (`confirmed 100.0% -> rejected 20.0%`), in the copy
    it already has rather than a new one; "a suspicion that comes true is a
    regression" adds `inconsistent_values` on `customers.country`, rejected on
    the fixture, then sets one country to `cz`.
  - The retyped column was `vehicles.model_year`, whose claim matches nothing
    either way. It is `order_items.order_id` now (confirmed at 100%), with its
    foreign key dropped first. Not `orders.customer_id`, as suggested: the
    view `shipped_orders` and the materialized view `order_totals` use it, so
    Postgres refuses to change its type.
  - Removed "fails: every class under every --fail-on", which repeated what
    the table test asserts under all three `--fail-on`. The unusable-snapshot
    test removes its temporary directory, which held an 11 MB file. Added: the
    stale test's timeout cases and an invented table in neither schema, the
    one-point boundary in the drift test, a drift-only report ending with the
    fix line, and an oversampling of 0 refused in `snapshot.test.ts`.
- Kept as it was, in part: R7's "print the fresh query beneath each line".
  The plan specifies the human report's lines, and the verdict measured now
  carries its query and numbers in `CheckReport`, which T3.3 prints as
  `--json`. NOTES now says so, as the reviewer's alternative asked.
- Docs: NOTES (the options sentence rewritten plainly; the settings sentence
  that claimed every setting had a flag's range; the stale rule, as "Stale
  needs a name that was there"; the tolerance's slack; no query on a line;
  the no-API test; the added assertion; the last "not done" limit; T3.1's
  note on the two settings points here), README's stale row ("a table or
  column the snapshot had"), `acceptance/checks.json` (the renamed stale
  test, the suspicion test in A2 and in the tests list, A5 on the table test
  instead of the removed one).
- Sabotage of this iteration's fixes, each restored byte for byte (`cmp`):
  `runCheck` sending a preflight when a key is set: "check sends nothing to
  the Anthropic API ..." failed with three `GET /v1/models/...` requests.
  `remeasure` handing back the snapshot's verdicts: "an unchanged database
  ..." failed at the first deep-equal, blank queries against real ones. The
  text fallback matching nothing: the retype test failed with its lines,
  `confirmed 100.0% -> rejected 0.0%`, once its exit-code assertion carried
  them (it printed `2 !== 0` before); the two new exit-code assertions carry
  them too. The old stale rule: "a claim is stale ..." failed on "a dropped
  table the snapshot could not measure". No `Number.EPSILON`: the drift test
  failed on its one-point case. No bound on the oversampling: the parse test
  failed. The suspicion's regression move removed: "a suspicion that comes
  true ..." failed with `changed ...: rejected -> confirmed`. Confirmed →
  rejected removed: the regression test failed with `changed ...:
  confirmed 100.0% -> rejected 20.0%`. The fix line under `regression`: no
  unit test failed, and three database tests did; the `reportLines` test
  now fails too, at its drift-only case.
- `npm run verify` exits 0: 194 tests, 192 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.2`
  prints `T3.2: 80/100`, every check passing but the sabotage item.
- `npm run acceptance` over every task, three times. The first run's shared
  `npm run verify` exited 1, failing every task's gate; its output was lost
  to a filter of mine, and `verify` run alone just before and just after
  exited 0. The second run passed `verify`, and T2.1's test command (sampling,
  extract, config, write and verdict tests, none of this task's) timed out at
  240 s; run alone it passes 60 of 60 in 13 s. The third run is clean: T0.1,
  T0.2, T1.1, T1.2, T1.3, T1.5, T2.1 and T3.1 at 100/100, T3.2 at 80/100.
  Cause not found: no copy, session or waiting lock was left on the server,
  and its log holds only the errors the tests provoke. Two other Claude
  sessions on this machine were idle when looked at; whether one ran the
  suite against the same databases during those runs is not known. Flagged
  for the lead as unexplained, not as fixed.
- Lost Tests (-20): `FAIL T3.2 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: `acceptance/manual.json` holds no
  sabotage record for the task; the sabotage check of the task's core is
  done by a later stage. The sabotages above cover only this iteration's
  fixes.
- Sabotage check of the task's core (section 4.5), with the two new test
  files run after each break. Each file was copied outside the repository
  first and restored from its copy: `cmp` identical, and `git diff HEAD --
  src/cli.ts` byte for byte the diff saved before; `src/check.ts` is
  untracked, so `cmp` alone.
- Sabotage: `remeasure` measuring with this run's settings, not
  `snapshot.measuredWith`; "the snapshot's settings are the ones measured
  with" failed with "+ 'check <copy>: 12 unchanged' - 'improved
  relationship:orders.customer_id->customers.id: broken 88.0% -> confirmed
  88.0%'". Restored.
- Sabotage: `classify` with regression and improved swapped; "every row of
  the plan's table classifies and fails as the plan says" failed with
  "relationship confirmed → broken + actual - expected [+ 'improved' -
  'regression']". Restored.
- Sabotage: `runCheck` returning 0 when the report fails and 2 when it
  passes; "check sends nothing to the Anthropic API and needs no key" failed
  with "check <copy>: 12 unchanged ... 2 !== 0", and sixteen other database
  tests on their exit codes. Restored.
- Sabotage: `missingName` looking at tables only; "a claim is stale when the
  database lost a name it uses, unless the snapshot lacked one too and could
  not measure it" failed with "a dropped column + actual - expected [+
  'not measured', undefined - 'stale', 'orders.customer_id']", and the
  hostile test lost its column claim from the stale list. Restored.
- Sabotage: `diff` listing the relations the database lost and not those it
  gained; "relations added and removed are stale; a relation not examined is
  still in the context" failed with "- { in: 'database', name: 'added' }",
  and "a new table is stale" with "0 !== 2". Restored.
- Sabotage: `remeasure` profiling every relation in the catalog; "check
  profiles only the relations its claims name" failed with the statement
  that profiled one no claim names, "SELECT count(*) AS n, ... FROM (SELECT *
  FROM "public"."audit_log" LIMIT 50000) s". Restored.
- Sabotage: `runCheck` connecting before it reads the snapshot; "a snapshot
  that cannot be used exits 1 with its sentence before any connection"
  failed with "could not connect to the database: nothing is listening at
  the host and port in the URL; ...". Restored.
- Sabotage: the `check` command passing `regression` whatever `--fail-on`
  says; "no hidden value reaches check's output or the snapshot, and stdout
  stays empty", the one test that gives `--fail-on change` on the command
  line, failed with "improved
  relationship:orders.customer_id->customers.id: broken 88.0% -> confirmed
  100.0% ... 0 !== 2". Restored.
- Sabotage: `classify` calling any move of the hit rate drift, whatever the
  tolerance; "drift needs the hit rate to move, by at least the tolerance"
  failed with "a move below it + actual - expected [+ 'drift' -
  'unchanged']". Restored.
- Sabotage: stale left out of what fails under `--fail-on regression`;
  "every row of the plan's table classifies and fails as the plan says"
  failed with "claim names a table or column that no longer exists,
  --fail-on regression false !== true", and "a dropped table makes its
  claims and itself stale" with "0 !== 2". Restored.
- Sabotage: not measured failing under `--fail-on change`; "every row of the
  plan's table classifies and fails as the plan says" failed with "measured
  before, unverifiable now (timeout, budget), --fail-on change true !==
  false", and "claims the budget leaves unmeasured never fail" with "2 !==
  0". Restored.
- Sabotage: `side()` without the hit rate; "a broken foreign key is a
  regression, named with both hit rates" failed with "+ 'regression
  relationship:order_items.order_id->orders.id: confirmed -> broken' -
  '... confirmed 100.0% -> broken 80.0%'". Restored.
- No sabotage left every test green, so no test changed. No copy of the
  template was left on the server.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  194 tests, 192 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T3.2` prints `T3.2: 100/100`, every
  check passing.
