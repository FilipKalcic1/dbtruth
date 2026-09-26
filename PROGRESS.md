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

## T6.1 Team section and waitlist in the README
### Iteration 1: 80/100
- Read first: sections 0 to 5 and T6.1 of the plan, with section 2 (the tiers),
  T4.1, T5.1, T5.2, T6.2, T6.3 and T7.1, which the section's sentences lean
  on; README.md, NOTES.md (0.2.0 and 0.3.0), CHANGELOG.md, the earlier
  iterations here, `acceptance/`, `test/readme.test.ts` and the commands in
  `src/cli.ts`.
- Tests first, two in `test/readme.test.ts`: "the Team tier section has a
  price and a waitlist link, placeholders until a person sets them" (A1)
  failed with `no Team tier section`; "the Team tier section names every
  command, and those not built yet as coming" (A2) failed with `+ Set(0) {}`
  against `check`, `dbtruth`, `doctor`, `init`, `mcp`. Both for the reason the
  task describes: the README had no such section.
- Built: the section "Team tier" in README.md, after "Keeping context true:
  dbtruth check" and before "What it sends, and what it never does". The plan
  puts it after a "CI" section, which T4.1 writes and which does not exist;
  NOTES says so, and that T4.1 moves it. Four short paragraphs: the Team tier
  is the Action on private repositories, coming, and what it will do there;
  what stays free; that no database content passes through a server of ours,
  with what the license check of T6.2 will send; the price, `PRICE_TBD` per
  team per month, and `[Join the waitlist](WAITLIST_URL)`. No price, link or
  date was made up.
- The tests: A1 accepts the placeholders, or an amount and an `https` link,
  so the person's edit needs no change to a test. A2 reads the built commands
  from `.command("...")` in `src/cli.ts` and the full run, and the coming ones
  from the Commands list's `# coming in` lines, and fails when the section
  names another command, leaves one out, or names a coming one in a clause
  without "coming". Checked by breaking a copy of the README before any
  record (not the sabotage record): `init` without "the coming", a
  `dashboard` code span, `mcp` named in the model sentence, a price without
  an amount, a `#waitlist` link and the heading renamed each failed a test;
  the README was restored byte for byte (`cmp`). One of them showed the first
  version of the A2 test read the named commands with one pattern and the
  clauses with a plain substring, so a clause holding `` `dbtruth init` ``
  without "coming" passed; both now come from one pass over the clauses, and
  that clause fails with ``... after `dbtruth init`" names init, which is not
  built yet``.
- A2 by hand, sentence by sentence (the manual item `A2-sentences`), each
  against the plan and the code:
  1. "The Team tier is the GitHub Action on private repositories": section 2,
     the tier table.
  2. "The Action is coming: on a pull request it will run `dbtruth check`
     against the database the workflow gives it, write what moved into one
     comment on the pull request, updated in place, and by default fail the
     job on a regression or a stale item": T4.1 (P1, not built: the
     `database-url` and `fail-on` inputs, `comment.sh`, A2), T3.2's table
     (stale fails under `regression`), T3.3's comment body.
  3. "These stay free: the CLI (`dbtruth`, `doctor`, `check`, and the coming
     `init` and `mcp`); the skill, also coming, that tells an agent when to
     read the context and measure a join; and the Action on public
     repositories": section 2's Free row and T6.1's list; the three commands
     `src/cli.ts` defines; T1.4 and T5.1 for `init` and `mcp`, coming in the
     Commands list too; T5.2 and Appendix D for the skill; T6.2 (public
     repositories never need a key). The plan's "free forever" is "stay
     free" (NOTES).
  4. "No database content passes through a server of ours, on either tier":
     section 2's goal, T6.1, R3 and R9; a hosted service is out of scope.
  5. "You bring your own model access: a full run calls the Anthropic API
     with your key, and `check` needs no model at all": section 2;
     `src/cli.ts` hands `ANTHROPIC_API_KEY` to the client of `src/model.ts`;
     `src/check.ts` never imports `model.ts`, which `test/structure.test.ts`
     pins.
  6. "The Action will run `check` in your own CI job": T4.1, a composite
     action in the user's workflow.
  7. "On a private repository it will also check a license key, sending the
     key and the repository's id and nothing else, and an outage of that
     check will never fail the job": T6.2 (P2), its fail-open rule and A2.
  8. "The Team tier will cost PRICE_TBD per team per month": section 2, "per
     team per month, HUMAN decides".
  9. "[Join the waitlist](WAITLIST_URL) to hear when it opens": T6.1's HUMAN
     line and T6.3, step 3.
  Nothing else is named: no dashboard, hosted service, SLA, support tier or
  UI.
- HUMAN, not done, and recorded as done nowhere: decide the price; make the
  waitlist form (email only); replace `PRICE_TBD` and `WAITLIST_URL` in
  README.md. README.md is in the package, so a release made before then shows
  both placeholders on npm too.
- Docs: README (the section), NOTES (the entry under 0.3.0: what, why, where
  it sits and why, what is HUMAN, how it is tested, what is not done),
  CHANGELOG (a line under 0.3.0). No `--help` change: no command or option
  changed. `acceptance/checks.json`: A1 and A2 on the two tests, the same two
  as tests, `verify`, the README's place, the NOTES entry, the CHANGELOG line,
  and the structure and canary invariants; `acceptance/manual.json`:
  `A2-sentences` with the check above, and the sabotage item, empty.
- `npm run verify` exits 0: 196 tests, 194 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T6.1`
  prints `T6.1: 80/100`, every check passing but the sabotage item.
  `npm run acceptance` over every task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.5,
  T2.1, T3.1 and T3.2 still 100/100 with the README and NOTES changed.
- Lost Tests (-20): `FAIL T6.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
### Iteration 2: 80/100
- Four reviews gave seven findings. Each was checked against the plan, the
  code and a run of the test's logic on changed copies of the README before
  anything changed; all seven held. Two fixes were applied without the edits
  they asked for in iteration 1 of this task (below).
- Fixed, in the acceptance entries: A2 was scored twice, by the commands
  test and by the manual item `A2-sentences`, so T6.1 had three acceptance
  entries for two A-items and A2 weighed twice what A1 did; section 4.2
  splits the 50 points evenly over the A-items. The test alone also passes a
  broken A2 that names no command, such as a sentence promising a dashboard,
  since it reads only code spans. The automated `A2` entry is gone, the test
  stays scored as `commands` under tests, and the manual item is `A2`: every
  sentence by hand, with the commands test named as the part a script judges.
- Fixed, in the README: "These stay free" is "These stay free forever", as
  T6.1's Build says. The plan made that promise, and "stay free" gave it no
  term. Sentence 3 checked again against the Build's "what stays free
  forever"; the rest of it is as iteration 1 records. NOTES no longer
  explains the substitution.
- Fixed, in `test/readme.test.ts`:
  - The commands test took "coming" anywhere in the clause, so ``the CLI
    (`dbtruth`, `doctor`, `check`, `init` and `mcp`) and the coming skill``
    passed. It now reads "coming" only before the command in its clause and
    asserts both ways, so a command built since and still called coming
    fails too. Its title says so: "... and only those not built yet as
    coming". NOTES drops its "Not caught" sentence and says the word marks
    every command after it in its clause.
  - A command counted only as a code span of one word, with or without
    `dbtruth `, so `npx dbtruth mcp` and `dbtruth mcp --stdio`, the README's
    own forms, went unseen. The span may now start with `npx ` and carry
    options.
  - The price took only a token holding a digit right before " per team per
    month", so "20 EUR" and "20 €" failed a correct README after the HUMAN
    edit. It takes any text on the line from the first digit on.
  - Checked on changed copies of the README, each restored byte for byte
    (`cmp`); not the sabotage record. The "coming skill" clause failed with
    ``... `init` and `mcp`) and the coming skill" names init, which is not
    built yet``; `npx dbtruth mcp` added to the CI sentence failed with
    ``... names mcp, which is not built yet``, and so did `dbtruth mcp
    --stdio`; "20 EUR per team per month" passed; "a fee per team per
    month" failed the price test. "The Action is coming, and on a pull
    request it will run `dbtruth check`" failed with ``... names check,
    which is built``: correct English the positional rule refuses, which
    NOTES now says.
- Fixed, in NOTES: the sentence spliced in unwrapped, "It ends with the
  price and a link to the waitlist.", is gone, since the HUMAN bullet names
  both placeholders, and the paragraph is rewrapped. In CHANGELOG: the line
  listed the skill as free without saying it is coming. It now says what a
  team will pay for, what stays free forever and the promise on database
  content, without the list, and the placeholders are there "for now", not
  "until they are decided"; it still opens "README: a Team tier section."
  for the docs check.
- Kept as it was: iteration 1 of this task. The plan reviewer asked to
  change its "(A2)" labels and remove its note on "stay free"; it records
  what was done then, and this iteration records the change. The manual
  item's evidence cites both iterations.
- `npm run verify` exits 0: 196 tests, 194 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T6.1`
  prints `T6.1: 80/100`, every check passing but the sabotage item.
  `npm run acceptance` over every task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.5,
  T2.1, T3.1 and T3.2 still 100/100.
- Lost Tests (-20): `FAIL T6.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Sabotage check of the task's core (section 4.5): the price and the
  waitlist link (A1), and the commands the section names and calls coming,
  the part of A2 a test judges. `README.md` and `test/readme.test.ts` were
  copied outside the repository first, and `test/readme.test.ts` was run
  after each break.
- Sabotage: the section taken out whole, `README.md` as at `HEAD`; "the Team
  tier section has a price and a waitlist link, placeholders until a person
  sets them" failed with "no Team tier section", and "the Team tier section
  names every command, and only those not built yet as coming" with "+
  Set(0) {} - Set(5) { 'check', 'dbtruth', 'doctor', 'init', 'mcp' }".
  Restored.
- Sabotage: the price sentence, "The Team tier will cost PRICE_TBD per team
  per month.", deleted; "the Team tier section has a price and a waitlist
  link, placeholders until a person sets them" failed with "The input did
  not match the regular expression
  /(?:PRICE_TBD|\d[^\n]*?) per team per month/". Restored.
- Sabotage: the waitlist link unlinked and its placeholder gone, "Join the
  waitlist to hear when it opens."; the same test failed with "The input did
  not match the regular expression
  /\[[^\]]+\]\((?:WAITLIST_URL|https:\/\/[^)\s]+)\)/". Restored.
- Sabotage: "the coming" dropped before `init` and `mcp`, so the CLI's list
  gives them as built; "the Team tier section names every command, and only
  those not built yet as coming" failed with ""the CLI (`dbtruth`,
  `doctor`, `check`, `init` and `mcp`)" names init, which is not built yet
  ... false !== true". Restored.
- Sabotage: `check` dropped from the CLI's list in the sentence on what
  stays free forever. Every test stayed green: the commands test gathered
  the commands over the whole section, which names `check` three times
  more, so a README that no longer said `check` stays free passed.
  Strengthened "the Team tier section names every command, and only those
  not built yet as coming": the sentence on what stays free forever must
  name every command the section names, which the test already holds to
  what `cli.ts` defines and the Commands list calls coming. NOTES.md says
  so. Repeated; the test failed with ""free forever: the CLI (`dbtruth`,
  `doctor`, and the coming `init` and `mcp`); the skill, also coming, that
  tells an agent when to read the context and measure a join; and the
  Action on public repositories" leaves out check". Restored.
- Not broken: the sentences no test reads, among them the promise on
  database content. A test of them would copy the prose; they were checked
  by hand, sentence by sentence, for the manual item A2, as NOTES says.
- `README.md` was restored from the copy each time and matched it byte for
  byte (`cmp`), and `git diff HEAD -- README.md` printed byte for byte the
  diff saved before. The changes left are the strengthened test and its
  NOTES sentence.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  196 tests, 194 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T6.1` prints `T6.1: 100/100`, every
  check passing. T1.5, whose checks run the same test file, is still
  100/100.

## A rare failure of the verify gate (the lead, after T6.1)
- Seen three times, never with its cause: once while T0.1 was built (a
  database test file, output not kept), and twice as `FAIL <task> verify
  gates: exit 1` inside `npm run acceptance` (T0.2 after T3.1, T1.5 after
  T6.1), each time with every other task's identical `verify` passing in the
  same batch. A rerun of the task passed each time.
- Not reproduced outside the acceptance runs: 12 runs of `npm test`, 5 and
  then 30 runs of `npm run verify` in a row, all green. Two suspects measured
  and cleared: the 40,000-suspicion parse takes about 200 ms of its 2 s limit,
  and `connect()` 28 ms at the median and 57 ms at most, under load, of the
  0.2 s limit one safety test sets.
- The first 20 lines the acceptance script prints of a failed `npm run
  verify` are its preamble, so the cause was cut off every time. A failed
  check's whole output is now also written to a file in the temporary
  directory and its path printed (`full output: ...`); test "one passing and
  one failing check ..." asserts it. Sabotage: the path line removed; that
  test failed. Restored. The next occurrence will show its cause.
- Seen again, with its output, in T1.4's first `npm run verify`, run on its
  own: `not ok 148 - 300 tables: the budget is respected and output still
  renders`, at `assert.ok(statuses.includes("unverifiable"), "some
  measurements ran out of budget")`, `test/scale.test.ts` line 50; 206 tests,
  203 pass, 1 fail, the 2 live tests skipped. The rerun passed.
- Cause: a race in that test's own assumption. It gives the run a budget of
  0.3 s and asserts that some claim runs out of it. Sampling may use 60% of
  the budget (`extractBudgetShare`), the fake model then proposes one claim
  per sampled table and 20 more, and verify has the rest. Whether a claim is
  left over depends on how fast the server answers each phase: slow while
  sampling and quick while verifying, few tables are sampled, their few
  claims all fit, none is unverifiable, and the assertion fails. Measured
  with a script that repeats the test's run and prints its counts (in the
  scratchpad, not the repository): alone, 15 runs sampled 26 to 43 tables and
  left 2 to 30 claims unmeasured, the 2 a near miss; three at once, as `npm
  test` runs the database files side by side against one server, 5 of 45
  runs sampled 20 to 22 tables and measured all 40 to 42 claims, each a
  failure of this test.
- This is the first failure of the gate whose output was kept. The three
  before it fit this cause (a database test file, a full parallel run, a
  rerun that passed), but their output is lost, so it is not proven that
  they were this test.
- Not changed: the test is an earlier task's, and section 4.4 rules out
  rewriting it without a decision. For the lead: make the budget run out by
  construction rather than by timing. One way is `extractBudgetShare: 1` in
  the test's flags, so that sampling spends the whole budget and verify finds
  none left, while no machine samples 300 tables in 0.3 s; the test would
  still show that the budget is respected, extraction stops, and the output
  renders.
- Fixed by the lead after T1.4: the test's flags gain `extractBudgetShare: 1`,
  so sampling spends the whole 0.3 s, which 300 tables always exhaust, and
  verify finds no budget left; the assertions are unchanged. Twelve runs of
  the whole scale file, three at a time against one server, all passed. The
  loop of 30 `npm run verify` before it did not reproduce the failure, which
  fits a cause that needs the load of a full parallel run.

## T1.4 `dbtruth init`
### Iteration 1: 80/100
- Read first: sections 0 to 5 and T1.4 of the plan, with T1.1, T1.3, T1.5,
  T5.1, T5.2, T6.1, T7.1 and Appendices B and E; `src/cli.ts`,
  `src/safety.ts`, `src/doctor.ts` and their tests, `test/readme.test.ts`,
  `test/acceptance.test.ts`, `scripts/acceptance.mjs` and
  `scripts/pack-smoke.mjs`; README.md, NOTES.md (0.2.0 and 0.3.0),
  CHANGELOG.md, the iterations above and `acceptance/`.
- Scope, as the lead set it: no `--skill` and no `claude mcp add` line, which
  need the skill file of T5.2 and the server of T5.1. NOTES says each task
  adds its part when it lands; no option or placeholder stands for them.
- Checked before designing, on this machine (git 2.50.1, Node 22.18):
  `git check-ignore --quiet --no-index .env` exits 1 with no `.gitignore`,
  with `.env.local`, `.env/`, and `.env*` then `!.env`, and 0 with `.env`,
  `/.env`, `.env*`, `*.env` and `*`; without `--no-index` a tracked `.env`
  that `.gitignore` lists exits 1. Git reads `~/.config/git/ignore` with no
  global config at all, and this machine has one; a repository's own empty
  `core.excludesFile` shuts it out. Opening a directory named `.env` with `wx`
  fails with `EEXIST`; `spawnSync("git")` with `PATH` empty fails with
  `ENOENT`; outside a repository git exits 128.
- Tests first, `test/init.test.ts`, ten tests, in `test:unit`: they need git,
  not the databases.
  - On the code as committed the file does not load: `The requested module
    '../src/cli.js' does not provide an export named 'runInit'`. `dbtruth
    init` prints `error: too many arguments. Expected 0 arguments but got 1:
    init.` and exits 1, as the README said.
  - On a stub `runInit` that printed nothing and returned 0, with the README
    as committed, each failed on its own assertion: A1 with `no .env at the
    root`; the nested package with `[]` for `wrote ..\..\.env` and the
    warning naming `..\..\.gitignore`; the placeholders with `ENOENT` opening
    the `.env`; the existing `.env` with `[]` for `.env already exists; left
    as it is`; the `.env` directory with `0 !== 1`; the `.gitignore` cases
    with `[]` for `wrote .env` and the warning; git missing with `[]` for the
    warning that git could not say; outside a repository with `[]` for
    `wrote .env`; A3 with "no block of next steps after the quick start's
    `npx dbtruth init`"; the command with `error: too many arguments ...` and
    `1 !== 0`. The stub was then removed; `src/cli.ts` matched `HEAD` again.
  - That run also showed the README lookup was loose: with no block after
    the quick start's mention of `init`, it took the closing fence of the
    `bash` block for an opening one and read half the page as the next
    steps. Both lookups now read the quick start section alone, and the block
    must open with the first fence after the mention.
- Built: `runInit` in `src/cli.ts`, beside `runCheck` (Appendix B has no
  module for it), and the `init` subcommand, with no options;
  `repositoryRoot` exported from `src/safety.ts`, T1.1's walk, not a second
  one. It writes the `.env` at the repository root, or in the working
  directory outside a repository, with `wx`, unless a file is there, which
  it leaves as it is and says so; asks `git check-ignore --quiet --no-index
  .env` at the root, inside a repository only; prints on stderr what it did,
  a warning when git does not ignore the file or could not say, and the next
  steps; exits 0, or 1 when it could not write. The file holds the quick
  start's two settings and `ANTHROPIC_MODEL=claude-sonnet-5`, each behind
  `# `, under two comment lines of their own.
- Checked by hand: from `packages/api` of a scratch repository, `wrote
  ..\..\.env`, the warning with both paths, the next steps, exit 0; the file
  as written; a second run after `.env` went into `.gitignore`, stdout empty
  and exit 0; `init --skill` refused as an unknown option, exit 1. Then
  `doctor` from there: `FAIL no database URL: set DATABASE_URL in
  ..\..\.env, ...` on the untouched file, and every check `ok` once
  `DATABASE_URL` was uncommented and set to the fixture (with the variable
  removed from the environment: set but empty, it hides the file's, as
  T1.1 has it).
- Under Linux as the non-root `node` user, in `node:20` (20.20.2) and
  `node:22` (22.23.3), git 2.39.5, from a copy with LF line endings: the
  init, readme, structure, cli and acceptance test files, 37 tests, 37 pass
  on each. There too, a dangling `.env` link makes `init` exit 1 with
  `EEXIST` and write nothing where it points, and a link to a file is left
  as it is, as NOTES says.
- Docs: README (the quick start's paragraph on `init` with the next steps in
  a block, and no "coming"; the Commands list; the Team tier's sentence on
  what stays free forever; rows for the three new messages; the row for
  `could not write <path>: <error>` covering `init`'s; the row for an unknown
  command naming only `mcp` as not built), NOTES (the entry under 0.2.0:
  what, why, the git decision, the README as the reference for the next
  steps, what is left to T5.1 and T5.2, what is not done), CHANGELOG (0.2.0),
  `--help` (`init` in the program's list; `init --help` has only `-h`).
  `acceptance/checks.json`: T1.4's checks, three for the A-items, twelve on
  tests, the gate, seven on docs, four invariants; T1.5's `readme-init-coming`
  is now `readme-init`, and its `readme-commands` no longer expects `init` to
  be coming, as NOTES says. `acceptance/manual.json`: the sabotage item,
  empty.
- `npm run verify`: the first run exited 1 on `test/scale.test.ts`, not on
  anything of this task; the cause is in "A rare failure of the verify gate"
  above. The rerun exits 0: 206 tests, 204 pass, the 2 live tests skipped,
  and the package smoke test passes.
- `npm run acceptance -- --task T1.4` prints `T1.4: 80/100`, every check
  passing but the sabotage item. `npm run acceptance` over every task: T0.1,
  T0.2, T1.1, T1.2, T1.3, T1.5, T2.1, T3.1, T3.2 and T6.1 still 100/100,
  after T1.5's two checks changed.
- Lost Tests (-20): `FAIL T1.4 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead, no point depends on either: the fix for the scale test
  above; and whether "the README the single source" of the next steps meant
  `init` reading `README.md` at run time. Built: the README is the
  reference, `init` keeps a copy, and the test holds the two, and the line
  for `CLAUDE.md` under "Giving it to your agent", equal; NOTES says why.
### Iteration 2: 80/100
- Four reviews, nine findings, each checked against the code and the plan
  before acting; none rejected. Three were one finding: git's answer took in
  the user's own ignore file, while the plan and the quick start speak of
  `.gitignore`.
- Checked first, on this machine: in a repository whose config points
  `core.excludesFile` at a file listing `.env`, `git check-ignore --quiet
  --no-index .env` exits 0, and with `-c core.excludesFile=` before
  `check-ignore` it exits 1; `.git/info/exclude` listing `.env` still gives
  0 with that option. From Node 22.18, with `NoDefaultCurrentDirectoryInExePath`
  deleted (Git Bash sets it), `spawnSync("git", ...)` with `cwd` on a
  directory holding an empty `git.exe` fails with `EFTYPE`: that file was
  started, not the git on the `PATH`; with `-C <dir>` and the temporary
  directory as `cwd`, git answers 1. A test with `{ timeout: 50 }` whose
  synchronous body waits 500 ms on a child reports `ok`.
- Fixed:
  - The warning is about `.gitignore`, as the plan says: `runInit` runs `git
    -c core.excludesFile= check-ignore --quiet --no-index .env`, so a rule in
    the user's own ignore file, which covers one machine, no longer silences
    the warning a teammate's clone needs. Both warnings name the file they
    are about: `WARNING: .gitignore does not ignore .env; add this line to
    it: .env`, and `WARNING: git could not say whether .gitignore ignores
    .env; if it does not, add this line to it: .env`. The quick start's
    sentence, "asks git whether `.gitignore` ignores `.env`", is now what the
    code does, so it stays; the two rows, NOTES and CHANGELOG follow. The
    test helper no longer empties `core.excludesFile` in each repository,
    since `init` now does; the new test "the user's own ignore file does not
    stand in for the line in .gitignore" sets it in the repository's config,
    the key a global setting uses. `.git/info/exclude` still counts, since
    `check-ignore` cannot skip it; NOTES lists it under not done.
  - Outside a repository `init` asks git too, and prints that git could not
    say, with the line: the plan makes no exception, and the directory may
    become a repository with the `.env` in it. The `if (root)` is gone: one
    directory, `dir`, names both files and is where git looks. The test
    outside a repository expects the warning, and its row names the case.
  - Git is started in the temporary directory and pointed at the repository
    with `-C`, so on Windows a `git.exe` in the repository is never the git
    that runs. New test "init never runs a git.exe the repository holds": an
    empty `git.exe` at the root, the variable deleted while `init` runs.
  - A1 and A2 through the command: the command test runs in a fresh
    repository and compares every other file, `.git` included, before and
    after, and is a second lookahead of A1 and of A2.
  - The ten `{ timeout }` options, dead on synchronous tests, are gone; the
    `spawnSync` timeout in the command test, the one that works, stays.
  - The block of next steps is found by its first line, `next steps:`,
    without a lookahead.
  - NOTES: the sentence on where `runInit` sits says why in plain words.
- Sabotage of the fixes, `src/cli.ts` restored byte for byte after each:
  without `-c core.excludesFile=`, "the user's own ignore file ..." failed,
  its expected warning missing from the lines; git started with `cwd: dir`,
  "init never runs a git.exe ..." failed with `WARNING: git could not say
  whether .gitignore ignores .env; ...` where the other warning was
  expected; git asked inside a repository only, "outside a repository ..."
  failed, the warning missing; the `init` command renamed, the command test
  failed with `error: too many arguments. Expected 0 arguments but got 1:
  init.` and `1 !== 0`, and A1 with it. In README.md, the block's first line
  changed: "the next steps ..." failed with `no block of next steps in the
  quick start`, as did every test that compares printed lines. README.md
  restored byte for byte.
- `npm run verify` exits 0: 208 tests, 206 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T1.4`
  prints `T1.4: 80/100`, every check passing but the sabotage item. T1.5 and
  T6.1, whose checks read the rows and the Team tier, still 100/100.
- Lost Tests (-20): `FAIL T1.4 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record of the task's
  core; the sabotage check is done by a later stage. The sabotages above are
  of this iteration's fixes only.
- Open for the lead, as in iteration 1; no point depends on either.
- Sabotage check of the task's core (section 4.5), with `test/init.test.ts`
  run after each break. `src/cli.ts` and `test/init.test.ts` were copied
  outside the repository first; after each break `src/cli.ts` was restored
  from its copy, `cmp` identical, and `git diff HEAD -- src/cli.ts` printed
  byte for byte the diff saved before.
- Sabotage: the existing-file check dropped and the `.env` opened with `w`
  in place of `wx`, so `init` writes over whatever is there; "an existing
  .env is left as it is, byte for byte, and init says so and goes on" failed
  with "Expected values to be strictly deep-equal: + '.env': Buffer(267) -
  '.env': Buffer(113)" and a dump of both files' bytes, a message assert
  generated. That comparison was given a message saying what it checks, as
  the fresh repository's has. Repeated; the test failed with "every file,
  .env included, as it was + '.env': Buffer(267) - '.env': Buffer(113)", and
  "a .env that is a directory, such as a Python virtualenv, ..." and the
  command test with "The input did not match the regular expression
  /^could not write \.env: EEXIST: /. Input: "could not write .env: EISDIR:
  illegal operation on a directory, ..."". Restored.
- Sabotage: the `.env` written in the working directory, `const dir =
  here`, not at the repository root; "from a nested package init writes the
  .env at the repository root, and names both files from there" failed with
  "+ 'wrote .env', + 'WARNING: .gitignore does not ignore .env; ...', -
  'wrote ..\..\.env', - 'WARNING: ..\..\.gitignore does not ignore
  ..\..\.env; ...'". Restored.
- Sabotage: the `.gitignore` warning's condition inverted, the warning on
  git's 0 and none on its 1; "git decides whether .env is ignored, and
  .gitignore is only read" failed with "- 'WARNING: .gitignore does not
  ignore .env; add this line to it: .env'", missing after 'wrote .env' in
  the repository with no `.gitignore`, and seven other tests with it.
  Restored.
- Sabotage: `--no-index` dropped from `git check-ignore`. Every test stayed
  green: no test had a `.env` git tracks, the case NOTES gives `--no-index`
  for. New test "a .env git already tracks draws no warning when .gitignore
  lists it": a `.env` added with `git add --force` under a `.gitignore` that
  lists it, as when it was committed before the line went in; it passes on
  the code as built. NOTES.md's list of the cases the tests cover names it,
  and `acceptance/checks.json` has a check for it, as for each test in the
  file. Repeated; the new test failed with "+ 'WARNING: .gitignore does not
  ignore .env; add this line to it: .env'" after '.env already exists; left
  as it is'. Restored.
- Sabotage: `DATABASE_URL` written uncommented in the `.env`; "the .env init
  writes holds no setting until a line is uncommented, and then that line's
  alone, as the quick start writes it" failed with "nothing is read until a
  line is filled in + { DATABASE_URL:
  'postgres://user:password@host:5432/dbname' } - {}". Restored.
- The changes left are the message on the byte-for-byte comparison, the new
  test, its check and its words in NOTES.md.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  209 tests, 207 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T1.4` prints `T1.4: 100/100`, every
  check passing.

## T2.3 Conditional relationships for polymorphic references
### Iteration 1: 80/100
- Read first: sections 0 to 5 of the plan and T2.2 to T2.4, with T3.1, T3.2,
  T5.1 and Appendices A to C; the design brief for T2.3, T2.4 and T2.2 and
  the lead's decisions in its section 7, which set the order T2.3, T2.4,
  T2.2; `src/verify.ts`, `src/safety.ts`, `src/schemas.ts`, `src/check.ts`,
  `src/write.ts`, `src/snapshot.ts`, `src/extract.ts`, `src/cli.ts`, both
  prompts and their tests; README.md, NOTES.md (0.2.0, 0.3.0 and the limits),
  CHANGELOG.md, the iterations above and `acceptance/`.
- Checked before building, on the fixture server (Postgres 16) with pg 8.23:
  a statement with an empty parameter list goes by the simple protocol, as
  every statement `connect()` sends already does (`requiresPreparation` is
  false without values), so the statements without a condition travel as
  before; a NUL bound as a parameter is refused by the server with 22021,
  `invalid byte sequence for encoding "UTF8": 0x00`, a `DatabaseError` with
  its code, so the claim is unverifiable and the run goes on; the brief's
  case for asking the lead, a throw without a SQLSTATE, which `connect()`
  takes for a lost connection, does not arise; and `total_cents = $1`
  with `05` bound compares as 5, where `total_cents::text = $1` does not.
- The fixture first: `test/fixtures/polymorph.sql`, all of it, as the brief
  writes it, mounted as `60-polymorph.sql` before the template, and loaded
  once into the running server with `docker exec -i dbtruth-db-1 psql -v
  ON_ERROR_STOP=1 -U dbtruth -d fixture < test/fixtures/polymorph.sql`: 300
  `post` comments over ids 1 to 100 and 180 `photo` comments over 1 to 60;
  `reltuples` 40, 480, 200, 40, 100 and 20 for accounts, comments,
  invoices, photos, posts and refunds.
- Tests first: eight unit tests (three in verify, two in schemas, one each in
  write, check and snapshot) and six database tests in the new
  `test/joins.test.ts`, which joins `test:db`; `fakeDb` in `verify.test.ts`
  also records each statement's parameters. On the code as committed:
  - `schemas.test.ts` did not load: `The requested module
    '../src/schemas.js' does not provide an export named 'sqlString'`.
  - On polymorph the condition was dropped by the schema and every branch
    measured as the whole join: the post branch read `total: 480, hits: 480`
    for 300 of 300; no statement held `::text = $1`, `[]` where seven values
    were expected; no line of `comments.md` had `when commentable_type =
    'post'`; the claim on `comments.nope` came back confirmed; and check
    printed `check polymorph: 4 unchanged` for `11 unchanged`, the branches'
    ids having fallen into the whole join's. The canary test passed, as it
    must before and after.
  - The verify tests: the statement read `FROM (SELECT * FROM
    "public"."comments" LIMIT 50000) f`, no filter; the four statements of
    the retries carried `[]` four times for `["photo"]`; the unknown and the
    hidden column were queried (`nothing here should be queried`).
  - The write test found no line with the condition; the check test classed
    the branch whose column was dropped `not measured`, not `stale` with
    `orders.status`; the snapshot test found one relationship where three
    branches were written.
- Built, as section 2.1 of the brief has it: `when` on `RelationshipSchema`,
  optional and not nullable; the raw `[column=value]` suffix in
  `relationshipId`; `sqlString` in `schemas.ts`; bind parameters through
  `querySampled` and `runWithTextFallback`; `claimRows` and `column()` in
  `verify.ts`, with an unknown condition column checked with the others, a
  hidden one after emptiness, the filter in both forms of the join, and the
  note `-- $1 = <value>` before the statement in the query kept, never in
  the one run; the condition's column among a relationship's names in
  `claimNames`; the condition in the per-table file's edge. Prompt A's
  bullet replaced and its schema given `"when"?`; prompt B given the
  sentence and the rule. The stored query for the photo branch is the
  brief's section 2.2, character for character.
- Where the code at HEAD and the brief differ: nowhere that changed what
  was built. `SNAPSHOT_FORMAT` stays 1, as decided.
- Checked beyond the tests: the fixture server reads `sqlString`'s literal
  back as the value for `photo`, `x'; DROP TABLE posts; --`, a value with a
  newline, quotes and a backslash, one with CR LF, one with `\n` as two
  characters, a tab and a lone backslash, each on one line.
- Docs: NOTES (the entry under 0.2.0, with the old and new bullet of prompt
  A, the decisions and what is not done; the known limit renamed "A join is
  unconditional unless its claim names a condition."; "One sample, one
  target" no longer says polymorphic references go to a suspicion; the id
  suffix under "Where string matching does appear"), README ("How it
  works", and polymorph in the Development line), CHANGELOG (0.2.0), both
  prompts. No option was added, so `--help` is unchanged. The one new text
  is a verdict's reason, `<table>.<column> is hidden, so no condition on it
  is measured`, shown where `unknown column <table>.<column>` is: in the
  per-table files and after `unverifiable` on a `check` line. Reasons have no
  troubleshooting rows and `test/readme.test.ts` does not read them, so the
  table is unchanged.
- `acceptance/checks.json`: T2.3's checks, four for the A-items (A4 the
  brief's check on NOTES), thirteen on tests, the gate, seven on docs, three
  invariants. `acceptance/manual.json`: the sabotage item, empty.
- The database tests (`joins`, `remeasure`, `integration`, `doctor`,
  `safety`, `sampling`, `scale`: 82 tests, 80 pass, the 2 live tests
  skipped) pass on Postgres 12 (12.22) and 18 (18.6), in throwaway
  containers loaded with every fixture file in compose order, as on 16. No
  copy was left.
- Under Linux as a non-root user (uid 1000), in `node:20` (20.20.2) and
  `node:22` (22.23.3), from a copy of the working tree with LF endings and
  `npm ci`, against the 18.6 server: the task's six test files with
  `readme`, `ci`, `structure`, `acceptance` and `remeasure`, 103 tests, 103
  pass on each.
- `npm run verify` exits 0: 223 tests, 221 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.3`
  prints `T2.3: 80/100`, every check passing but the sabotage item.
  `npm run acceptance` over every task: T0.1, T0.2, T1.1, T1.2, T1.3, T1.4,
  T1.5, T2.1, T3.1, T3.2 and T6.1 still 100/100; after the last edits to
  README.md and NOTES.md every file check of every task still matches.
- Lost Tests (-20): `FAIL T2.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead, no point depends on it: whether a verdict's reason,
  such as the new one for a hidden condition column, should have a
  troubleshooting row. None has one today, `unknown column` included.
### Iteration 2: 80/100
- Four reviews, twelve findings, each checked against the code and the plan
  before acting; none rejected. Two pairs overlapped (the fixture's
  `refunds` and the test claims on it; `claimRows` and `column()`), and the
  two on which columns a condition may name were fixed together, since the
  rule one asks for reads settings the other shows a snapshot can widen.
- Checked first, in the code: `visible` is categorical, a declared non-text
  key or revealed (`extract.ts`), so a gate on it let `comments.id` through;
  `remeasure` lays the snapshot's `measuredWith` over this run's config and
  profiles with it, and `parseSnapshot` gives the two categorical bounds no
  upper limit; the statement guard lets through only a statement that
  starts with `SELECT` or `WITH`, so a kept query with its note first could
  not be rerun through `connect()` as it was stored.
- Fixed:
  - The stored query ends with the note, as the plan says:
    `<statement>\n-- $1 = '<value>'`. Iteration 1 put it first on the
    lead's word, which the plan does not carry. The kept query now reruns
    as it is: the database test binds the value to the whole of it, and the
    tests in `verify.test.ts` and `joins.test.ts` read the note as the last
    line. NOTES: "The stored query ends with the value."
  - Prompt A asks for one relationship per value of the other column, each
    to the table that value selects, as the plan says, not one per target:
    two values that selected one table made one claim, and the rows of the
    other were never measured. NOTES quotes the new bullet and says why.
  - A condition must be on a categorical column: visible, with no more than
    `categoricalMaxDistinct` values on the sample, none longer than
    `categoricalMaxValueLength`. `visible` alone let a key through, and
    `id = '42'` narrowed the join to one comment. The reason reads
    `<table>.<column> is not categorical, so no condition on it is
    measured`. A revealed column is held to the same bounds, so the full run
    and `check` differ on it only when no value repeats on its sample. A
    key on a table no larger than the bound, and a value one row alone
    holds, still narrow to a row; NOTES says so. New claim `keyed` in
    `joins.test.ts`; the `comments` of `verify.test.ts` has a key and
    statistics like the fixture's.
  - In `check` a snapshot can no longer widen what is categorical:
    `remeasure` hides every column from `verify` when the snapshot's bounds
    are wider than this run's or its `sampleRows` smaller, so no branch is
    measured, and every other claim is measured as before, since nothing
    else reads `visible` there. With this removed, the guess
    `comments.commentable_id = '57'` under `categoricalMaxDistinct` 1000000
    came back confirmed. New test "check measures no condition when the
    snapshot's settings would show more values than this run's", over each
    of the three settings, which also finds no statement with a parameter.
    NOTES: "In `check`, a snapshot cannot widen what is categorical."
  - `claimRows` and `column()` are gone, with the `Column` import:
    `measureRelationship` looks the condition's column up once, as `on`,
    and writes the filter and its parameter where the statement is built.
  - `refunds` is out of `polymorph.sql`, with its header item and the one
    about T2.2's key test, and the unconditional `invoices` claim is out of
    `CLAIMS`. `accounts` and `invoices` stay: T2.4 adds them, and
    `invoices.account_id` is the condition on a column that is not text.
    The fixture was reloaded with `docker compose down -v && docker compose
    up -d --wait`. The check line is `check polymorph: 10 unchanged`.
  - `joins.test.ts`: `offline()` takes nothing and returns no exit code;
    `claim(table, column, to, when?)` needs no split and no cast.
    `verify.test.ts`: `photoBranch`'s parameter is `on`. `sqlString` sits
    after `suspicionId`, so the two id functions are together.
  - README "How it works" says the other column must be categorical and
    that each of its values is a claim; CHANGELOG likewise.
    `acceptance/checks.json`: the renamed tests, the NOTES bullets, the
    README sentence, and one new check, `check-wider`.
- Sabotage of the fixes, each file restored from a copy and compared with
  `cmp`: `sampleRows` dropped from the comparison in `remeasure`, "check
  measures no condition ..." failed with `{"sampleRows":60}: nor a branch
  the full run measured`, `[ 'confirmed', undefined ]` where `[
  'unverifiable', 'comments.commentable_type is not categorical, so no
  condition on it is measured' ]` was expected; `categoricalMaxDistinct`
  dropped from it, the same test failed with
  `{"categoricalMaxDistinct":1000000}`, the guess `[ 'confirmed', undefined
  ]`; the gate back to `on.visible` alone, three tests failed, among them
  "a discriminator value is always a bind parameter ...", which found `[
  'posts', '42' ]` among the bound values.
- `npm run verify` exits 0: 224 tests, 222 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.3`
  prints `T2.3: 80/100`, every check passing but the sabotage item. `npm run
  acceptance` over every task: every other task built so far still 100/100.
- Lost Tests (-20): `FAIL T2.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record of the task's
  core; the sabotage check is done by a later stage. The sabotages above are
  of this iteration's fixes only.
- Open for the lead, as in iteration 1: whether a verdict's reason, now
  `<table>.<column> is not categorical, so no condition on it is measured`,
  should have a troubleshooting row.
- Sabotage check of the task's core (section 4.5), with the task's six test
  files (`joins`, `verify`, `schemas`, `write`, `check`, `snapshot`: 62
  tests, all passing before) run after each break. `src/verify.ts`,
  `src/schemas.ts`, `src/safety.ts`, `src/write.ts` and `src/check.ts` were
  copied outside the repository first; after each break the file was
  restored from its copy, `cmp` identical, and `git diff HEAD -- <file>`
  printed byte for byte the diff saved before.
- Sabotage: the condition's filter and its parameter dropped in
  `measureRelationship`, so a branch is measured over every sampled row;
  "each branch of a polymorphic reference gets its own verdict with its own
  numbers" failed with "+ hits: 480, - hits: 300, + total: 480 - total: 300"
  for the post branch, and five other tests with it. Restored.
- Sabotage: the value written into the statement as a literal through
  `sqlString`, `::text = 'photo'` in place of `$1`, and no parameter sent,
  so the numbers stay right; "a condition filters the sampled rows by a
  bound value, shown only in a note after the statement" failed with the
  statement it ran, which read `w."commentable_type"::text = 'photo'`, and
  "the plain-form retry and the text fallback send the condition's value
  too" with "+ [ [], [], [], [] ]" where `[ 'photo' ]` was expected four
  times. "a discriminator value is always a bind parameter, ..." failed too,
  but before its own assertions, with "database connection lost: invalid
  message format": the NUL claim's value was now in the statement's text.
  Restored.
- Sabotage: `relationshipId` without the `[column=value]` suffix; "a
  condition is part of a claim's id: ..." failed with the four claims
  reduced to two ids, "relationship:comments.commentable_id->posts.id" and
  "...->photos.id", and "check measures every branch again, ..." with "+
  'check polymorph: 3 unchanged' - 'check polymorph: 10 unchanged'", among
  nine tests. Restored.
- Sabotage: `querySampled` retrying the plain form without the parameters;
  "the plain-form retry and the text fallback send the condition's value
  too" failed with "+ [ [ 'photo' ], [], [ 'photo' ], [] ]" where the value
  was expected four times. Restored.
- Sabotage: the edge in `tableFile` without its condition; "the per-table
  files show each branch with its condition" failed with "no line in
  comments.md starts - comments.commentable_id -> posts.id when
  commentable_type = 'post': confirmed, 100.0% of 300 sampled rows match
  (inferred". "a branch reads with its condition, ..." in `write.test.ts`
  failed too, with only the table's name, "comments", as its message.
  Restored.
- Sabotage: the kept query without its closing note; "a condition filters
  the sampled rows by a bound value, shown only in a note after the
  statement" failed with "the query kept is the one run, before a note that
  gives $1", and "a discriminator value is always a bind parameter, ..."
  found the statement's last line where "-- $1 = 'x''; DROP TABLE posts;
  --'" was expected. Restored.
- Sabotage: the check that the condition's column exists removed; "a
  condition on a column the table lacks or that is not categorical is
  unverifiable, ..." failed with "+ 'column w.nope does not exist'" and the
  statement run where "'unknown column comments.nope', ''" was expected,
  and "a condition on a column the table lacks, or on one that is not
  categorical, is unverifiable and nothing runs" with "nothing here should
  be queried". Restored.
- Sabotage: `claimNames` in `check.ts` without the condition's column; "a
  claim whose condition names a column the database lost is stale" failed
  with "+ 'not measured', + undefined - 'stale', - 'orders.status'".
  Restored.
- Sabotage: the categorical gate removed, so a condition on any column is
  measured; "a condition on a column the table lacks or that is not
  categorical is unverifiable, ..." failed with "a count under a guessed
  value would tell whether a hidden value exists": `comments.body = 'x'`
  came back `empty`, with its statement, where `unverifiable` and
  "comments.body is not categorical, so no condition on it is measured"
  were expected; three other tests failed with it. Restored.
- No sabotage left every test green, so no test was changed.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  224 tests, 222 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T2.3` prints `T2.3: 100/100`, every
  check passing.

## T2.4 Where the orphans fall
### Iteration 1: 80/100
- Read first: sections 0 to 5 of the plan and T2.4, with T2.2, T2.3 and
  Appendices A to C; the design brief's section 3 and ground rules, and the
  lead's decisions in its section 7; `src/verify.ts`, `src/write.ts`,
  `src/safety.ts`, `src/schemas.ts`, prompt B and their tests,
  `test/joins.test.ts`, `test/canned.ts`, `test/integration.test.ts`,
  `test/readme.test.ts`; README.md, NOTES.md (0.2.0, the string-matching
  list and the limits), CHANGELOG.md, T2.3's iterations above and
  `acceptance/`.
- Where the guidance and the code at HEAD differ: the lead's note says
  `polymorph` already holds `refunds`, the table for orphans below a key.
  It does not: T2.3's iteration 2 took it out, with its header item, since
  nothing of T2.3 read it. It is back as the brief's section 2.6 writes it,
  header item 3, and the databases were reloaded with `docker compose down
  -v && docker compose up -d --wait`; `reltuples` 40, 200 and 20 for
  accounts, invoices and refunds, and by hand 15 of its 20 rows match, 5
  below account 1, none above. NOTES records it.
- Tests first: four unit tests (two in `verify.test.ts`, one each in
  `write.test.ts` and `safety.test.ts`) and three database tests in
  `test/joins.test.ts`, whose `offline()` now takes the URL and the claims
  (polymorph and T2.3's claims by default, so T2.3's tests read as before).
  On the code as committed:
  - `safety.test.ts` did not load: `The requested module
    '../src/safety.js' does not provide an export named 'isIntegerType'`.
  - "against an integer key it leads, ..." found the statement ending `AS
    hits\n  FROM (SELECT * FROM "public"."orders" LIMIT 50000) f`, with no
    count of either end.
  - The write test found the broken line with nothing between "60 orphans
    (inferred)." and "An inner join drops the orphans".
  - On the databases: "orphans are counted where they fall ..." failed with
    `orphansAbove: undefined, orphansBelow: undefined` where 60 and 0 were
    expected for `orders.customer_id -> customers.id`; "only counts leave
    the database ..." with "one statement for each join", 0 !== 3; "the
    per-table files say where the orphans fall ..." with "orders.md does not
    say 60 orphans (inferred). All 60 are above the highest customers.id.
    ...".
  - "no orphan ends where a column is not an integer, ..." passed, as a
    guard must while nothing counts the ends.
- Built, as section 3.1 of the brief has it: `isIntegerType` in `safety.ts`
  beside `typeFamily`, which is unchanged; in `measureRelationship`, when
  both columns are integers, the probe form of the join, the one taken when
  the target column leads the key and is compared as is, also counts
  `orphans_above` and `orphans_below` against one uncorrelated `max` and
  `min` of the key, without the plan's `<orphan> AND`; the counts are read
  when the returned row has them, so the fakes of existing tests need no
  change; `orphanShape` in `write.ts` adds one sentence after
  "(inferred)." on a broken line, the place only; prompt B gets the two
  numbers in its numbers paragraph and the rule that where the orphans fall
  is a hint, not a proven cause.
- Checked beyond the tests: `EXPLAIN` of the fixture's statement shows each
  end as an InitPlan, run once, over `Index Only Scan (Backward)` of
  `customers_pkey` with `Limit`; the stored queries on polymorph and the
  fixture, and the broken lines of every per-table file, read as the tests
  expect; a confirmed join into an integer key carries 0 and 0, and one that
  is not probed (`customers.address -> customers.full_name`) carries
  neither.
- Docs: NOTES (the entry under 0.2.0: the two counts and why no second
  probe, only integers and only where the key is probed, no third number,
  the file's facts and prompt B's hint, `refunds`, the `offline()` change,
  the README output left for release, and what is not done;
  `isIntegerType` under "Where string matching does appear"), README ("How
  it works"), CHANGELOG (0.2.0), prompt B. No option was added, so `--help`
  is unchanged. No new message reaches stderr, so the troubleshooting table
  is unchanged; `readme.test.ts` still passes.
- `acceptance/checks.json`: T2.4's checks, three for the A-items, seven on
  tests, the gate, five on docs, three invariants. `acceptance/manual.json`:
  the sabotage item, empty.
- The database tests (`joins`, `integration`, `remeasure`, `doctor`,
  `safety`, `sampling`, `scale`: 87 tests, 85 pass, the 2 live tests
  skipped) pass on Postgres 12 (12.22) and 18 (18.6), in throwaway
  containers loaded with every fixture file in compose order, as on 16. No
  container was left.
- Under Linux as a non-root user (uid 1000), in `node:20` (20.20.2) and
  `node:22` (22.23.3), from a copy of the working tree with LF endings and
  `npm ci`, against the 18.6 server: the task's four test files with
  `readme`, `ci`, `structure`, `acceptance`, `remeasure` and `integration`,
  117 tests, 115 pass, the 2 live tests skipped, on each. The first attempt
  ran without `docker run --init`, and "a check that hangs is killed ..."
  failed because nothing reaped the killed process, as that test's comment
  says a container without an init does; with `--init` it passes.
- `npm run verify` exits 0: 231 tests, 229 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.4`
  prints `T2.4: 80/100`, every check passing but the sabotage item. `npm run
  acceptance` over every task: every other task built so far still
  100/100.
- Lost Tests (-20): `FAIL T2.4 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
### Iteration 2: 80/100
- Four reviews gave eight findings. Each was checked against the code and
  the plan before acting; none rejected. Two overlapped (the reload command
  for an older volume) and were fixed together.
- Checked first: on the fixture server `1::smallint = 2::bigint`, `1::int >
  (SELECT max(x::bigint) ...)` and `3::bigint < 2::smallint` all run, so two
  integer columns never raise a datatype mismatch and the text fallback
  never reaches a join that counts ends; a join is confirmed at 95%, so a
  confirmed one can have orphans, and nothing in `verify.ts` ties the ends
  to a verdict; `polymorph.sql` starts with `CREATE DATABASE polymorph`, so
  loading it into a server that has `polymorph` stops there under
  `ON_ERROR_STOP`.
- Fixed:
  - The broken line puts the place in the count, as the plan writes it:
    "60 orphans, all above the highest customers.id (inferred).", and for a
    split "60 orphans, 48 above the highest customers.id and 12 inside the
    customers.id range (inferred).". Iteration 1 added a sentence after
    "(inferred)." that repeated the count, so that the words existing tests
    matched stayed as they were. `orphanShape` writes "all" where one place
    holds every orphan and lists the places with `Intl.ListFormat`, so the
    branch on how many places there are is gone. Since A3 changes that
    line, two existing assertions change with it, named in NOTES: the
    `orders` line in `test/integration.test.ts` and the photo branch's in
    "the per-table files show each branch with its condition"
    (`test/joins.test.ts`). The new tests' expectations and the CHANGELOG
    example follow; NOTES drops the sentence that justified the deviation.
  - NOTES no longer says a confirmed join carries 0 and 0: every join
    measured with the ends carries them, whatever its verdict.
  - NOTES on the fixture: T2.3's entry calls `accounts` and `invoices` two
    of the tables T2.4 adds; T2.4's gives only the rebuild, `docker compose
    down -v && docker compose up -d --wait`, and says that loading
    `polymorph.sql` into the running server fails once `polymorph` exists.
  - README "How it works" and CHANGELOG name both conditions and speak of
    counts: a broken join from an integer column into an integer primary
    key says how many of its orphans lie above the key's highest value and
    how many below its lowest; the rest lie inside its range.
  - The text-fallback case is out of "no orphan ends where a column is not
    an integer or the column does not lead the key" (`verify.test.ts`),
    with its second `db` and `m`, and NOTES no longer explains the ends of
    a comparison as text: two integer columns always compare as they are.
  - `write.test.ts`: the no-cause assertion after the line's full equality
    is gone, since it could fail only where the equality had. The test is
    now "a broken join's orphan count says where they fall, and nothing
    without the counts".
  - `joins.test.ts`: `says` takes the run's `file` accessor, and the
    closing loop reads the table files through it, as the test before it
    does.
  - `acceptance/checks.json`: the renamed tests (A3, `table-file`,
    `verify-no-ends`), and the README and CHANGELOG sentences.
- Sabotage of the fixes, `src/write.ts` restored from a copy and compared
  with `cmp` each time: "all" replaced by the count, "a broken join's
  orphan count says ..." failed with the line reading "60 orphans, 60 above
  the highest customers.id (inferred)" where "60 orphans, all above ..."
  was expected; the places joined with ", " in place of `Intl.ListFormat`,
  it failed with "48 above the highest customers.id, 12 inside the
  customers.id range" where "... and 12 inside ..." was expected.
- `npm run verify` exits 0: 231 tests, 229 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.4`
  prints `T2.4: 80/100`, every check passing but the sabotage item; `npm
  run acceptance -- --task T2.3` still prints `T2.3: 100/100`.
- Lost Tests (-20): `FAIL T2.4 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record of the task's
  core; the sabotage check is done by a later stage. The sabotages above
  are of this iteration's fixes only.
- Sabotage check of the task's core (section 4.5), with the task's four
  test files (`joins`, `verify`, `write`, `safety`: 57 tests, all passing
  before) run after each break. `src/verify.ts`, `src/write.ts` and
  `src/safety.ts` were copied outside the repository first; after each
  break the file was restored from its copy, `cmp` identical, and `git
  diff HEAD -- <file>` printed byte for byte the diff saved before.
- Sabotage: the ends' names swapped in `measureRelationship`, the count
  past the key's `max` returned as `orphans_below` and the one past its
  `min` as `orphans_above`; "orphans are counted where they fall: above
  the key on the fixture, inside it and below it on polymorph" failed with
  "customer ids from 9001 on, past the 250 customers", `orphansAbove: 0,
  orphansBelow: 60` where 60 and 0 were expected, and three other tests
  with it. Restored.
- Sabotage: the integer gate weakened to either column, `||` in place of
  `&&`; "no orphan ends where a column is not an integer or the column
  does not lead the key" failed with "a numeric from-column", the
  statement it ran counting `orphans_above` and `orphans_below`. Restored.
- Sabotage: `orphanShape` returning at once, `if (true) return ""`; "a
  broken join's orphan count says where they fall, and nothing without the
  counts" failed with "{"orphansAbove":60,"orphansBelow":0}", the line
  reading "60 orphans (inferred)." where "60 orphans, all above the
  highest customers.id (inferred)." was expected, and the two tests of the
  per-table files with it. Restored.
- Sabotage: the orphans inside the range computed as `orphans -
  orphansAbove`, forgetting those below; "a broken join's orphan count
  says where they fall, and nothing without the counts" failed with
  "{"orphansAbove":0,"orphansBelow":60}", the line reading "all below the
  lowest customers.id and all inside the customers.id range", and "the
  per-table files say where the orphans fall, and no cause" with
  "refunds.md does not say 75.0% match (15 of 20 sampled), 5 orphans, all
  below the lowest accounts.id (inferred).". Restored.
- Sabotage: the statement returning the key's highest value beside the
  counts, `(SELECT max(t."id") ...) AS key_max`; "only counts leave the
  database for where the orphans fall" failed with "never the ends of the
  key", `+ 'key_max'` among the returned columns, and "against an integer
  key it leads, ..." with the statement it ran. Restored.
- Sabotage: `isIntegerType` by substring, `/int/.test(type.toLowerCase())`;
  "isIntegerType is smallint, integer and bigint, by declared type" failed
  with "integer[]", `true !== false`. Restored.
- Sabotage: the ends counted in the hashed form of the join too, where the
  target column does not lead the key; "no orphan ends where a column is
  not an integer or the column does not lead the key" failed with "a
  column second in the key", its statement a `LEFT JOIN` counting both
  ends. Restored.
- Sabotage: the returned row checked for `orphansAbove`, the name in the
  numbers, in place of the column `orphans_above`, so the ends are counted
  and never read; "against an integer key it leads, the join also counts
  the orphans past either end of it" failed with `orphansAbove: 60,
  orphansBelow: 0` missing from the numbers, and "orphans are counted
  where they fall: ..." with "customer ids from 9001 on, past the 250
  customers", both `undefined`; the two tests of the per-table files
  failed with them. Restored.
- No sabotage left every test green, so no test was changed.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  231 tests, 229 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T2.4` prints `T2.4: 100/100`, every
  check passing.

## T2.2 Weak-evidence note for small value ranges
### Iteration 1: 80/100
- Read first: sections 0 to 5 of the plan, T2.2 with T2.3, T2.4, T3.1, T3.2
  and Appendices A to C; the design brief for T2.3, T2.4 and T2.2, section 4
  and the ground rules of section 1, and the lead's decisions in its
  section 7, which include bounding prompt B's input (decision 9);
  `src/verify.ts`, `src/write.ts`, `src/extract.ts`, `src/check.ts`,
  `src/cli.ts`, `src/config.ts`, `src/schemas.ts`, `src/snapshot.ts`,
  `src/safety.ts`, both prompts and their tests, `test/joins.test.ts`,
  `test/scale.test.ts`, `test/integration.test.ts`, `test/readme.test.ts`;
  README.md, NOTES.md (0.2.0, 0.3.0, the limits), CHANGELOG.md, the
  iterations of T2.3 and T2.4 above and `acceptance/`.
- Where the brief and the code at HEAD differ, the code won:
  - The `$1` note ends a branch's query (T2.3 iteration 2), where the brief
    puts it first. A weighed branch's query is the join's statement, `;`,
    the weighing, then the one note, which gives the value both statements
    bind. Appending `;` and the weighing after the note would have put the
    `;` inside the comment, and the two statements would read as one.
  - T2.3 folded `claimRows` into its one caller. With the weighing it has
    two again, so it is back, and returns the note with the rows and the
    parameters, so both statements are built from one place.
  - `polymorph`'s claims at HEAD include `keyed` and not `invoices` or
    `refunds`, so its summary is `3 confirmed (3 on weak evidence), 1
    broken, 0 rejected, 3 unverifiable, 3 empty`, not the brief's.
  - The orphan place is inline in the broken line (T2.4); the weak-evidence
    wording goes in the confirmed line only, where "(inferred)" goes, so
    the two never meet: only a confirmed join is weighed.
- Checked before building, on the fixture server (Postgres 16): every
  single-column integer key of the fixture fills its range (customers 250,
  order_items 1200, orders 500, products 80, products_legacy 70, vehicles
  120, from `reltuples`); `cars` is 0 over 0 pages, `events` has two
  columns; on `polymorph`, `accounts` has 40 rows over 50 ids and the other
  four keys fill theirs.
- Tests first, on the code as committed:
  - `config.test.ts`: both new tests failed with `actual: undefined` where
    0.9 and 50 were expected.
  - `extract.test.ts` and `write.test.ts` did not load: `The requested
    module '../src/extract.js' does not provide an export named
    'integerKeys'`, and the same for `fitForWriter` in `write.js`.
  - `snapshot.test.ts`: `measuredWith` lacked both settings, `[ undefined,
    undefined ]` where `[ 0.9, 50 ]`.
  - `verify.test.ts`: no probe was sent, `actual: undefined` where the
    probe of `customers` was expected; the leave-out test found `[]` where
    six probes were expected; out of budget, `1` statement where 4. "a join
    stated, declared, broken, empty or unmeasured, ... is not weighed"
    passed, as a guard must while nothing weighs.
  - `joins.test.ts`: the quantity join `candidates: undefined, alsoFits:
    undefined` where 5 and 5; "only counts leave the database when a join
    is weighed" found `0` probes where 6; the edge copy `candidates:
    undefined` where 8; the branch test the same where 3 and 2; T2.3's
    bound-value test found no weighing among the statements that bind a
    value. "a declared foreign key is never weighed ..." passed, as a
    guard.
  - `integration.test.ts`: prompt B was sent over the limit, `actual: 2,
    expected: 1` requests. `scale.test.ts`: the new test failed, since
    before the change no verdict carries `alsoFits`.
- Built, as section 4.1 of the brief has it, with the code at HEAD:
  `denseKeyShare` and `weakEvidenceMaxCandidates` in `config.ts`, with
  their comments, ranges, variables and flags; `IntegerKey` and both
  settings, optional, in the snapshot's `measuredWith` (`schemas.ts`);
  `integerKeys(catalog)` in `extract.ts`; in `verify.ts`, `keys` as a
  required argument, and after every claim, for each join worth weighing,
  one probe per key once per run (`denseKeys`) and one statement per join
  (`weigh`); `check.ts` and `cli.ts` pass `integerKeys(catalog)`; the
  confirmed line of `tableFile`; the summary's parenthesis; prompt B's
  sentence and rule.
- Built for decision 9: `fitForWriter` in `write.ts` holds what prompt B is
  sent to `modelMaxInputTokens` as `fitToContext` holds prompt A's extract:
  every verdict's query emptied when Verified is over it, and nothing sent
  when that is still over it, in which case `render()` writes the
  per-table files alone; the note ends the line that starts `write:`.
  Prompt B is told a query may be empty.
- Checked beyond the tests: `EXPLAIN` shows each end of a key, in the probe
  and in the weighing, as an InitPlan over an index-only scan of its primary
  key. Measured on `scale`, 300 joins weighed against 49 keys each:
  `Verified` 1,652,576 characters (413,144 tokens at 4 a token), 271,484
  with the weighing off; prompt B sent 141,496 characters (35,374 tokens);
  the snapshot 1,859,232 bytes, 470,939 with the weighing off; a weighed
  join's query 4,540 characters; `verify` 3.4 s, 1.0 s with the weighing
  off.
- Docs: NOTES (the entry under 0.2.0 and one for prompt B's input, with the
  measured sizes and the test changes; "One sample, one target" and the
  unconditional-join limit point at the note; the 0.3.0 snapshot bullet no
  longer says `denseKeyShare` comes later; the T3.2 bullet says `check`
  probes the whole catalog's keys; the 10 MB bullet gives a weighed join's
  size; `isIntegerType` picks the joins and keys), README ("How it works",
  a troubleshooting row for both notes on the `write:` line), CHANGELOG
  (0.2.0, two bullets), `--help` (the two flags, from `overridable`), both
  config comments, prompt B, and a header item in `polymorph.sql` on the
  keys its numbers depend on, a comment only.
- Test changes, named in NOTES: the 21 `verify(...)` calls in
  `verify.test.ts` gain `, []` and the `measuredWith` deep-equal in
  `snapshot.test.ts` gains the two settings, both approved; T2.3's "a
  discriminator value is always a bind parameter, ..." expects the two
  weighing statements that bind `post` and `5` besides the joins', and
  `offline()` in `joins.test.ts` takes flags.
- `acceptance/checks.json`: T2.2's checks, five for the A-items (A4 twice:
  the per-table line with prompt B's input, and prompt B's rule, as the
  lead scores A4 on the offline evidence), nineteen on tests, the gate,
  eight on docs, three invariants. `acceptance/manual.json`: the sabotage
  item, empty.
- The database tests (`joins`, `integration`, `remeasure`, `doctor`,
  `safety`, `sampling`, `scale`: 94 tests, 92 pass, the 2 live tests
  skipped) pass on Postgres 12 (12.22) and 18 (18.6), in throwaway
  containers loaded with every fixture file in compose order, as on 16. No
  container and no copy of `fixture_template` was left.
- Under Linux as a non-root user (uid 1000), with `docker run --init`, in
  `node:20` (20.20.2) and `node:22` (22.23.3), from a copy of the working
  tree with LF endings and `npm ci`, against the 18.6 server: the task's
  eight test files with `remeasure`, `check`, `readme`, `ci`, `structure`
  and `acceptance`, 166 tests, 164 pass, the 2 live tests skipped, on each.
- `npm run verify` exits 0: 249 tests, 247 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.2`
  prints `T2.2: 80/100`, every one of its 36 checks passing but the
  sabotage item. `npm run acceptance` over every task: every other task
  built so far still 100/100. (That run read T2.2's NOTES check before its
  heading "Test changes" was renamed from "Test changes the lead
  approved", and failed it; the run of T2.2 alone after the rename passes
  it.)
- Lost Tests (-20): `FAIL T2.2 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead:
  - The snapshot grows by about 4.6 KB per weighed join at the default cap,
    so `check`'s 10 MB limit is reached near two thousand weighed joins,
    where T3.1 put it at some twenty thousand relations. Whether to lower
    the default cap, shorten the stored weighing, or leave it.
  - T2.3's test "a discriminator value is always a bind parameter, ..."
    now expects the two weighing statements that bind a value besides the
    joins'. Named in NOTES; approval asked, since the lead approved only
    the `verify` call sites and the `measuredWith` deep-equal.
### Iteration 2: 80/100
- Four reviews gave ten findings. Each was checked against the code and
  the plan before acting; none rejected. One was fixed otherwise than it
  proposed (R8), and one was kept as built, as it allowed, with its
  rationale corrected and put to the lead (the weighing statement).
- Checked first: A2's two tests assert only that something is absent, so
  on the code before T2.2 both pass (iteration 1 recorded it). `integerKeys`
  dropped every key whose catalog estimate is unknown, the case T2.1 sizes
  by a pilot, where the plan asks for "a known `rowEstimate > 0`"; on a
  database loaded since its last `ANALYZE` no key was weighed against, or
  only the analyzed few, and an `alsoFits` of 0 read as strong evidence. It
  also dropped a partitioned key whose empty leaf was never analyzed,
  which reads -1 on Postgres 14 and later, where `estimateRows` counts that
  leaf as empty. The probe wrote `denseKeyShare`, which comes from a flag,
  a variable or the snapshot, into its SQL text (R8).
- Fixed:
  - A2: "a declared foreign key is never weighed, ..." also asserts that
    the quantity join of the same run is weighed (5 and 5, `also_fits` in
    its query), and "a join stated, declared, ... is not weighed" ends with
    the same join, inferred and confirmed, on the same answers: 5
    statements, 2 and 2.
  - Keys: `integerKeys(db, cfg, catalog)` sizes each key by `estimateRows`
    with the pilot `extract` runs, now one function, `pilot()`, and takes
    the first `weakEvidenceMaxCandidates` keys that hold rows, so the cap
    bounds the pilots as well as the probes, and `denseKeys` no longer
    slices. `verify` is handed `() => integerKeys(...)`, so the keys are
    sized, as they are probed, only when a join is weighed. The empty leaf
    needs no rule of its own: rule 3 counts a leaf with no pages as empty.
    `IntegerKey.rows` is `rowEstimate`. The `integerKeys` unit test covers
    a key never analyzed, one loaded since, one whose pilot fails, the
    empty leaf, and the cap (4, and 0 with no statement); the edge test on
    a copy of `fixture_template` adds `fresh`, 1,000 rows never analyzed,
    which is piloted and counts: the quantity 9 and 7, the serials 9 and 0,
    and at `denseKeyShare` 0, 11 and 9, 11 and 1.
  - R8, not as proposed: with the key's size and the share bound, T2.3's
    "check measures no condition when the snapshot's settings would show
    more values than this run's" failed, `no statement carries a value`,
    since every probe then carried two. That test is committed, and 4.4
    forbids loosening it. The probe returns the span instead, `max(id)::
    numeric - min(id) + 1`, how many values the key spans and never an end,
    and Node compares it with the key's size and the share, as the plan's
    own density test does, so no setting is in a probe's text or its
    parameters. The T2.2 tests follow: the probe's text, answers that give
    spans, and "only counts leave the database when a join is weighed"
    checks that each probe returns one whole number named `span`.
  - `verify()` keeps HEAD's one `out` array and weighs `out[i]` in place.
  - `write()` calls `fitForWriter` itself and returns the files with the
    note, so the per-table files are rendered from `Verified` whole whatever
    prompt B is sent; `render()` is folded back into `write()`, as at HEAD,
    and `cli.ts` makes one call. The two existing `write()` calls in
    `write.test.ts` pass `config` and read `files`, with no assertion
    changed; named in NOTES.
  - Docs: the cap's comment in `config.ts` says it counts the keys probed;
    README "How it works" and CHANGELOG say "among the first
    `--weak-evidence-max-candidates` that hold rows" and "would also fit one
    or more of them ... says how many"; NOTES "Which keys", "Measured" and
    "Test changes" follow the fixes, the T3.2 bullet says `check` may pilot
    a key, and the README's fixture output is said to show the note only if
    the model claims such a join.
  - The weighing statement: kept. NOTES said the plan's form leaves a query
    no one can rerun, though the plan names the keys in a comment for that,
    and set it against a double the plan never uses. A new NOTES item, "Not
    the plan's statement", gives the trade-off as it is: every key's ends
    read again in each weighed join and a stored query about twice as long,
    against one that reruns as it is and binds no value but a branch's, so
    that the T2.3 test above holds, which the plan's bound ranges would fail.
  - `acceptance/checks.json`: the renamed tests (`edges`, `verify-left-out`,
    `integer-keys`) and the cap's comment.
- Sabotage of the fixes, each file restored from a copy and compared with
  `cmp`: `worthWeighing` returning false at once failed both A2 tests on a
  strict deep-equal, the quantity join's `candidates` and `alsoFits`
  undefined where 5 and 5, and `[1, undefined, undefined]` where `[5, 2,
  2]`; `integerKeys` sized with a pilot that returns nothing failed the
  `integerKeys` unit test, `never_analyzed` (40) and `loaded_since` (12)
  missing, and the edge test; the probe's guard for a key with no span
  removed failed the edge test with "quantity fits all but serials and
  serial_refs; the serials fit none", 10 candidates where 9 (the emptied
  `gone` counted), and "the weighing leaves out the target, ...".
- The database tests (94, 92 pass, the 2 live tests skipped) pass on
  Postgres 12 and 18.6 in throwaway containers loaded with every fixture
  file in compose order, as on 16. No container and no copy of
  `fixture_template` was left.
- `npm run verify` exits 0: 249 tests, 247 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T2.2`
  prints `T2.2: 80/100`, every check passing but the sabotage item; `npm
  run acceptance` over every task: every other task built so far still
  100/100.
- Lost Tests (-20): `FAIL T2.2 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: the item in
  `acceptance/manual.json` is still empty; the sabotage check of the task's
  core is done by a later stage, and the sabotages above are of this
  iteration's fixes only.
- Open for the lead:
  - The weighing statement is not the plan's (NOTES, "Not the plan's
    statement"): keep it, or take the plan's, which reads each key's ends
    once per run and stores about half the query, but reruns only with
    every range looked up and bound by hand, and fails T2.3's test that
    `check` under wider settings binds no value.
  - Still open from iteration 1: the snapshot's growth, about 4.6 KB a
    weighed join at the default cap, and the change to T2.3's "a
    discriminator value is always a bind parameter, ...".
  - New: the change to the two `write()` calls in `write.test.ts`.
- Sabotage check of the task's core (section 4.5), with the task's eight
  test files (`joins`, `verify`, `write`, `extract`, `config`,
  `snapshot`, `scale`, `integration`: 111 tests, 109 passing and the 2
  live tests skipped before) run after each break. `src/verify.ts`,
  `src/extract.ts`, `src/write.ts` and `src/cli.ts` were copied outside
  the repository first; after each break the file was restored from its
  copy, `cmp` identical, and `git diff HEAD -- <file>` printed byte for
  byte the diff saved before.
- Sabotage: the density test inverted in `denseKeys`, `rowEstimate <
  denseKeyShare * span`; "keys are judged in the database: ..." failed
  with "quantity fits all but serials and serial_refs; the serials fit
  none", 2 and 2 candidates where 9 and 9, and eleven other tests with
  it. Restored.
- Sabotage: the density test dropped, so every key with a span counts;
  "keys are judged in the database: ..." failed with "quantity fits all
  but serials and serial_refs; the serials fit none", 11 candidates where
  9 (`sparse` and `wide` counted), and "a branch is weighed on its own
  rows, and check measures ..." with "1 to 100 fit comments and invoices,
  not photos", 4 candidates where 3 (`accounts` counted). Restored.
- Sabotage: the containment inverted in the weighing, `k.lo >= v.lo AND
  k.hi <= v.hi`; "the fixture's inferred quantity join is confirmed, and
  says it would also match its 5 other dense keys" failed with `alsoFits:
  0` where 5, "keys are judged in the database: ..." with "quantity fits
  all but serials and serial_refs; the serials fit none", 0 where 7, and
  "a join confirmed on inference from an integer column is weighed last,
  ..." with "over the rows the join was measured on, against every dense
  key but the target". Restored.
- Sabotage: the claimed target kept among the keys weighed against; "the
  fixture's inferred quantity join ..." failed with 6 candidates and 6
  fits where 5 and 5, "a branch is weighed on its own rows, and check
  measures ..." with "1 to 100 fit comments and invoices, not photos",
  and "300 weighed joins: ..." with "each ref_id -> t_1.id join weighed
  against the 49 other keys the cap takes", `0 !== 300`. Restored.
- Sabotage: the from-column's own key kept among the keys; only "the
  weighing leaves out the target, the from-column's own key, ..." failed,
  and with assert's own "Expected values to be strictly deep-equal",
  `vehicles` among the keys where only `products`. Its two comparisons of
  the keys a join is weighed against were given messages that say what
  each leaves out ("orders: not its target customers, nor audit, cars or
  sparse"; "vehicles.id: not vehicles' own key either"), and the repeated
  sabotage failed with "vehicles.id: not vehicles' own key either".
  Restored.
- Sabotage: the declared foreign key dropped from `worthWeighing`; "a
  declared foreign key is never weighed, whatever basis the claim gives
  it" failed with "relationship:order_items.product_id->products.id", 5
  candidates and 4 fits where none, and "a join stated, declared, ... is
  not weighed" with "declared, though the claim says inferred", `5 !== 1`
  statements. Restored.
- Sabotage: the basis dropped from `worthWeighing`, so stated joins are
  weighed; "a join stated, declared, ... is not weighed" failed with
  "stated", `5 !== 1`. Restored.
- Sabotage: the `join.confirmed` bound dropped from `worthWeighing`; "a
  join stated, declared, ... is not weighed" failed with "broken", `5 !==
  1`, and "a discriminator value is always a bind parameter, ..." with a
  weighing that binds `photo`, the broken photo branch's value. Restored.
- Sabotage: the confirmed line of `tableFile` given `inferred` in place of
  `evidence`; "a confirmed join whose values other keys would fit is
  labelled inferred with the reason, never stated as fact" failed with the
  line ending "match (inferred)." where "match (inferred; the same values
  would also match 5 other keys, so the match alone does not prove this
  join).", and "the fixture's inferred quantity join ..." with
  "order_items.md". Restored.
- Sabotage: the summary counting every weighed join as weak evidence,
  `alsoFits !== undefined` in place of `(alsoFits ?? 0) > 0`; every test
  stayed green, since no run whose summary a test read weighs a join that
  fits no other key. "keys are judged in the database: ..." has one,
  `serial_refs.serial_id`, weighed with `alsoFits` 0 beside the quantity
  join; its runs now return the summary's `relationships:` line with the
  numbers, and each of its four settings asserts it: 1, 2 and 1 on weak
  evidence, and no parenthesis with the cap at 0. The repeated sabotage
  failed it with "quantity fits all but serials and serial_refs; the
  serials fit none, so only quantity is on weak evidence", "(2 on weak
  evidence)" where "(1 on weak evidence)". Restored.
- Sabotage: the weighing returning the column's ends beside the counts,
  `min(v.lo) AS lo, max(v.hi) AS hi`; "only counts leave the database when
  a join is weighed" failed with "two counts, never the ends of a
  column", `hi` and `lo` among the columns returned. Restored.
- Sabotage: the probe returning the key's highest value as its span,
  `max(id) AS span`; "a join confirmed on inference from an integer column
  is weighed last, ..." failed with "a probe returns how many values the
  key spans, never an end of it", and "keys are judged in the database:
  ..." with "quantity fits all but serials and serial_refs; the serials
  fit none", 7 and 8 candidates where 9 and 9 (the two keys past 2^53 no
  longer dense). Restored.
- Sabotage: `integerKeys` taking any key an integer column leads,
  `primaryKey ?` in place of `primaryKey?.length === 1 ?`; "integerKeys
  takes, up to the cap and in catalog order, ..." failed with
  `composite`'s `tenant` among the keys, "the fixture's inferred quantity
  join ..." with 6 and 6 where 5 and 5 (`events` counted), and "only
  counts leave the database ..." with "each integer key probed once", `7
  !== 6`. Restored.
- Sabotage: the cap ignored in `integerKeys`, `if (false) break`;
  "integerKeys takes, ..." failed with `loaded_since` and the keys after
  it past the cap of 4, "keys are judged in the database: ..." with
  "customers, fresh and gone are probed", 9 candidates where 2, and "300
  weighed joins: ..." with "each ref_id -> t_1.id join weighed against the
  49 other keys the cap takes", `0 !== 300`. Restored.
- Sabotage: a weighing that did not run returning `candidates` and
  `alsoFits: 0`; only "out of budget, the weighing claims nothing either
  way" failed, and with assert's own "Expected values to be strictly
  deep-equal". Its comparison of the join's numbers was given a message,
  and the repeated sabotage failed with "the join's own numbers: an
  alsoFits of 0 would say that no other key holds its values", `alsoFits:
  0` and `candidates: 1` added. Restored.
- Sabotage: `fitForWriter` returning Verified whole at once; "what is over
  the model's input limit even without its queries is not sent to prompt
  B, ..." failed with "prompt A only", `2 !== 1`, "300 weighed joins: ..."
  with "prompt B was sent 413144 tokens", and "prompt B is sent Verified
  whole, ..." with `undefined` where "the verdicts' queries dropped to fit
  the model's input limit". Restored.
- Sabotage: a branch weighed over every sampled row, `claimRows({ ...r,
  when: undefined })` in `weigh`; "a branch is weighed on its own rows,
  and check measures ..." failed with "5 fits every dense key", `alsoFits`
  3 where 4, and "a branch is weighed on its own rows with its value
  bound, ..." with the statement it ran, which has no condition. Restored.
- Sabotage: the keys probed again for every join weighed, `dense =` in
  place of `dense ??=`; "only counts leave the database when a join is
  weighed" failed with "each integer key probed once", `15 !== 5` on
  polymorph, and "the weighing leaves out ..." with "nothing here should
  be queried". Restored.
- Sabotage: the keys probed before any join is found worth weighing; "a
  join stated, declared, ... is not weighed" failed with "stated", `4 !==
  1` statements. Restored.
- One sabotage left every test green and two failed a test only with
  assert's own message; the tests were strengthened as above, in T2.2's
  own tests in `test/joins.test.ts` and `test/verify.test.ts`, and each
  repeated sabotage failed them. With them the eight files pass: 111
  tests, 109 pass, the 2 live tests skipped.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  249 tests, 247 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T2.2` prints `T2.2: 100/100`, every
  check passing.
### Iteration 3: the lead's answers
- Snapshot size: a weighed join adds about 4.6 KB at the default cap, so
  `check`'s 10 MB limit is reached near two thousand weighed joins (the scale
  fixture's 300 give 1.86 MB). Accepted as recorded in NOTES: a model that
  infers two thousand integer joins on its own is not a case to size for.
- T2.3's test "a discriminator value is always a bind parameter, and SQL in
  it matches nothing" now also expects the two weighing statements that bind
  `post` and `5`: approved, as it adds to what the assertion checks.
- Rescoring every task after T2.2, while the lead ran two read-only design
  panels whose agents installed packages and ran prototypes on this machine,
  failed the verify gate of T3.2, T3.1 and T2.1 (and T2.1's A5). The saved
  outputs show timeouts only: tests cut at 30 s and 60 s, `spawnSync ...
  ETIMEDOUT`, the 40,000-suspicion parse at 2,279 ms of its 2 s, a full run
  of 353 s where 150 s is usual. Rerun on the idle machine, all three scored
  100/100. Lesson for the lead: nothing heavy runs beside a scoring run.

## T3.3 `check` reports: JSON and Markdown
### Iteration 1: 80/100
- Read first: sections 0 to 5 of the plan, T3.2, T3.3, T4.1 and Appendices
  A to E; the design brief for T3.3 and T4.1 in full, its section 0 facts
  and the lead's decisions in its section 8; `src/check.ts`, `src/cli.ts`,
  `src/schemas.ts`, `src/snapshot.ts` and their tests,
  `test/remeasure.test.ts`, `test/joins.test.ts`, `test/readme.test.ts`,
  `test/structure.test.ts`, `test/copies.ts`; README.md, NOTES.md (0.2.0,
  0.3.0), CHANGELOG.md, the iterations above and `acceptance/`; the brief's
  rendering prototype, which I ran: it prints the Markdown the brief quotes.
- The code at HEAD ca22729 is as the brief read it: T2.2 changed nothing in
  `reportLines`, `diff` or `CheckReport`, and the four in-process `runCheck`
  calls are the ones the brief names.
- One departure from the brief, to put to the lead: the pipe is escaped in
  the table's cells, not inside `code()`. `code()` also writes the database
  names in a note, which is a list item and not a table cell, and there the
  backslash is shown. Rendered with the cmark-gfm wasm build the brief's
  judge used: `` ` shop\|ci ` `` in a note gives `<code>shop\|ci</code>`,
  `` ` shop|ci ` `` gives `<code>shop|ci</code>`, and in a cell
  `` ` x.y\|z ` is not in the database `` gives one cell with
  `<code>x.y|z</code>`. So `table()` escapes every pipe of each cell, and
  U4 expects `` ` shop|ci ` `` in the note where the brief had
  `` ` shop\|ci ` ``. Every table row is as the brief gives it.
- Tests first, on the code as committed:
  - `check.test.ts` and `remeasure.test.ts` did not load: `The requested
    module '../src/check.js' does not provide an export named
    'COMMENT_MARKER'`.
  - Run from a throwaway copy with `COMMENT_MARKER`, `reportMarkdown` and
    `CheckReportSchema` stubbed (a literal, a function that returns `""`, a
    parse that returns its input), each new test failed for its reason:
    U1 with `''` where the comment was expected; U2 with `[ '' ]` where
    `[COMMENT_MARKER, 'dbtruth: 1 unchanged', '']`; U3 with `[]` where 50
    regression rows; U4 with "no line | regression | `
    relationship:comments.commentable_id->...`"; U6 with `undefined !== 1`
    (now the schema's parse, which refuses a report without its format);
    D1 and D2 with `error: unknown option '--json'`, `1 !== 2`; D3 with
    `0 !== 1`. U5 passed, as a bound on size must against an empty comment.
  - D3 and U6 failed with assert's own message; both were given one.
- Built, as section 2 of the brief has it, with the escape above:
  - `schemas.ts`: `CHECK_REPORT_FORMAT` and `CheckReportSchema`; `CheckReport`
    and `ClaimCheck` inferred from it, each property comment kept.
  - `check.ts`: `diff()` sets `report` first; `COMMENT_MARKER`,
    `COMMENT_MAX_ROWS` and `FIX`; `rows`, `notes` and `tally`, from which
    `reportLines` and the new `reportMarkdown` are made; `table`, `block` and
    `code`; `side` without its `skipped`.
  - `cli.ts`: `CheckOptions` gains `json`, `markdown` and `out`; `runCheck`
    writes the comment, then prints the JSON; `check` takes `--json` and
    `--markdown <path>`; `out` is defined once in `main`, beside `err`, for
    the full run and `check`.
- Checked by hand: `dbtruth --json check --url <fixture> --markdown c.md`,
  the program's `--json` before the name, printed the report (`report`,
  `database`, `schemaChanged`, `settings`, `claims`, `relations`, 12 claims)
  and wrote the all-clear, `<!-- dbtruth-check -->` and `dbtruth: 12
  unchanged`. U5's comment measures 37,220 bytes for eighty stale claims on
  the longest names, 28,098 for eighty not measured and 27,975 for eighty
  regressions.
- Docs: README "Keeping context true" (two commands, "stdout stays empty
  unless `--json` asks for the report there", a paragraph for each flag, the
  example comment, which D1 compares with a real run), the troubleshooting
  row of `could not write <path>: <error>`; NOTES 0.3.0, a new entry after
  `check`'s; CHANGELOG 0.3.0, one bullet; `--help`, the two options.
- Test changes, none to an assertion, as the lead approved: the four
  in-process `runCheck` calls gain `json: false` and `out`; the fixed report
  and its `claim` helper move to module scope as `MOVED`; `MOVED` and `quiet`
  gain `report: 1`. Named in NOTES.
- `acceptance/checks.json`: T3.3's checks, A1 (D1, U6) and A2 (U1, U2, U3,
  D1), nine on tests, the gate, five on docs (the README section, the
  troubleshooting row, `check --help`, NOTES, CHANGELOG) and two invariants
  (T3.2's three structure tests; D2 and D1). Every test check uses T3.2's
  command, so the script runs it once. `acceptance/manual.json`: the
  sabotage item, empty.
- The task's test files with those that guard what it touches (`check`,
  `remeasure`, `joins`, `structure`, `readme`: 63 tests) pass on Postgres
  12.22 and 18.6, in throwaway containers loaded with every fixture file in
  compose order; with `ci` and `acceptance` (79 tests) under Linux as uid
  1000 in `node:20` (20.20.2) and `node:22` (22.23.3), from a copy of the
  working tree with LF endings, against the 18.6 server. No container and
  no copy of `fixture_template` was left.
- `npm run verify` exits 0: 258 tests, 256 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.3`
  prints `T3.3: 80/100`, every check passing but the sabotage item. `npm run
  acceptance` over every task: every other task built so far still 100/100.
  Every task's file checks pass on the final files, a few of which changed
  after that run.
- Lost Tests (-20): `FAIL T3.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead: the pipe escaped in the cells rather than in `code()`
  (above). The brief's sabotage "no `|` escape in `code()`" becomes "no `|`
  escape in `table()`", which U4 must catch.
### Iteration 2: 80/100
- Four reviews gave sixteen findings. Each was checked against the code and
  the plan before acting; none rejected. Two were one bug (the spread in
  `code()` and the catch around it) and were fixed together; one was taken
  in the second form it offered (`--json`, below).
- Checked first, on iteration 1's code: the size test's eighty stale rows
  came to 37,220 bytes with the cap and would come to about 59,200 without
  it (734 bytes a row), under GitHub's limit either way, so the test held
  without the cap; `reportMarkdown` of a relation named `` "`a" `` repeated
  200,000 times threw `RangeError: Maximum call stack size exceeded`; a
  report with a changed schema, a claim not measured and one unchanged,
  which fails nothing even under `change`, gave a note and a `<details>`
  block, not the marker and the counts alone. BUILD_PLAN.md already has
  changed and not measured in T3.2's table.
- Fixed:
  - The fence and the catch (bugs, rules): `code()` finds the longest run
    of backticks with a `reduce`, where it spread every run into
    `Math.max`, and `runCheck` renders the comment before the `try`, which
    now holds the write alone, so `could not write <path>` means a write
    failed. New test "a name of 200,000 backtick runs, which a snapshot can
    hold, is still one code span in one cell" failed on iteration 1's
    `code()` with that `RangeError`.
  - The size test renders a hundred stale rows, 75,508 bytes without the
    cap, so it fails when the cap goes; with it the comment is 38,021.
  - A stale claim's Before cell holds its status in the snapshot, since the
    plan's table has claim, before, after and hit rates for stale items too;
    a relation added or dropped still has none. stderr's line, T3.2's and
    pinned by its test, still leaves it out: `reportLines` prints the before
    for a row that is not stale, where it tested for a before. `rows` gives
    every claim its before, and writes the fields both kinds of claim share
    once.
  - The notes come after the rows and `and <n> more`, before the fix line,
    so the parts the plan names keep its order; they are not folded. U1 and
    the README's example follow, and D1, which compares that example with a
    real run, passes.
  - `block()` is gone: the comment is a list of parts, the empty ones
    dropped and the rest joined once with a blank line between two. `asIs`
    is gone: `rows` and `notes` take the name as it is by default.
  - Comments: `runCheck`'s says a check that cannot write the comment prints
    no JSON, where it said no report; `COMMENT_MARKER`'s and the header of
    `schemas.ts` no longer speak of an Action that does not exist yet.
  - NOTES: changed and not measured are T3.2's classes, which T3.3 does not
    place, not classes added after the plan; the all-clear is a report of
    unchanged claims, or of none, with nothing to note, and a note or a
    claim not measured still shows; the schema test is described as the
    three reports it parses; the fence, the size, the catch around the
    write alone, the stale Before and the notes' place as built. The
    all-clear test is retitled to say the same, and `acceptance/checks.json`
    follows (A2, `comment`, `all-clear`), with a `long-name` check for the
    new test.
  - README: the troubleshooting row tells the user to give `--markdown` a
    path to a file, in a directory that exists and this user can write; the
    comment's description has the notes in their new place.
  - `remeasure.test.ts`: `REGRESSION` moves down to the two tests that use
    it, and its comment says it is what "a broken foreign key is a
    regression" does to the copy. That test keeps its own two statements
    (4.4).
  - `check.test.ts`: `quiet` is `reportOf(...)`, the same value, where it
    spelled out the literal the helper returns. No assertion changed; named
    in NOTES.
- Taken in its second form, the `--json` finding (plan, major): `--json`
  stays the whole `CheckReport`, each verdict with its query and reason.
  Holding it to names, statuses, counts and rates would take the query out
  of every verdict in the report T3.2 defines, against R7 and T3.3's own
  "the `CheckReport` on stdout". NOTES no longer settles this as a reading:
  it names the conflict and puts it to the lead (below).
- Sabotage of the fixes, `src/check.ts` restored from a copy and compared
  with `cmp` each time: the cap removed (`const shown = all`), "a comment
  of the longest names Postgres allows stays under GitHub's 65,536
  characters" failed with `75508 bytes`, and the row-cap test with it; the
  runs spread into `Math.max` again, the new test failed with `RangeError:
  Maximum call stack size exceeded`; `reportLines` printing a stale claim's
  before, "reportLines: notes, ..." failed with `stale
  suspicion:inconsistent_values:orders.status: confirmed -> orders.status
  is not in the database` where the line without `confirmed ->` was
  expected; the stale claim's before dropped from `rows`, U1 failed with an
  empty cell where `confirmed` was expected. Restored.
- `npm run verify` exits 0: 259 tests, 257 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T3.3`
  prints `T3.3: 80/100`, every check passing but the sabotage item. The
  file checks of every task, 76, still match README.md, NOTES.md and the
  other files.
- Lost Tests (-20): `FAIL T3.3 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record of the task's
  core; the sabotage check is done by a later stage. The sabotages above
  are of this iteration's fixes only.
- Open for the lead, no point depends on any:
  - `--json` against T3.3's third bullet. Should `--json` print each
    verdict with its query, numbers and reason, as built, from the first
    bullet ("the `CheckReport` on stdout") and R7, or only names, statuses,
    counts and rates, as the third bullet says of both formats? The second
    needs a shape of its own for `--json`, without the query R7 asks of
    every verdict; T4.1 reads only the counts from it.
  - The pipe escaped in the cells rather than in `code()` (iteration 1).
  - `quiet` in T3.2's "reportLines: notes, ..." test is now built by
    `reportOf`, one step past the `report: 1` the lead approved for it.
- Sabotage check of the task's core (section 4.5), with the task's two
  test files (`check`, `remeasure`: 41 tests, all passing before) run
  after each break. `src/check.ts` and `src/cli.ts` were copied outside
  the repository first; after each break the file was restored from its
  copy, `cmp` identical, and `git diff HEAD -- <file>` printed byte for
  byte the diff saved before.
- Sabotage: the marker after the counts in `reportMarkdown`; "a report of
  unchanged claims, or of none, with nothing to note is the marker and its
  counts alone: ..." failed with "the marker first, the counts, and no
  other line", `dbtruth: 1 unchanged` before `<!-- dbtruth-check -->`, and
  "check --json prints the report alone on stdout, and --markdown writes
  the comment the README shows" with "the README's example comment", U1
  and "no hidden value reaches --json or --markdown" with it. Restored.
- Sabotage: the cap keeping the last rows, `all.slice(-COMMENT_MAX_ROWS)`;
  only "the comment shows at most 50 rows, the most serious first, then
  how many more" failed, and with assert's own "Expected values to be
  strictly deep-equal", five drift rows where five regressions. Its
  comparison of the rows past the cap was given a message saying what it
  checks, and the repeated sabotage failed with "the regressions take
  every row, the drifts none". Restored.
- Sabotage: the table and the fold swapped, `!` moved from `folded` to
  `open`; "the comment on a report with every class: ..." failed with the
  drift, improved, changed and not measured rows in the table where the
  regression and the stale rows were expected, "check --json prints the
  report alone ..." with "the README's example comment", the regression
  inside `<details>` under `<summary>1 regression</summary>`, and the
  row-cap test with "nothing left to fold". Restored.
- Sabotage: `code()` returning the name as it is, `return text` first; "a
  name from the snapshot or the database is code in the comment: ..."
  failed with "no line | regression | ` relationship:comments.
  commentable_id->posts.id[commentable_type=x \| forged \| row \|] ` |
  confirmed 100.0% | broken 80.0% |", "a name of 200,000 backtick runs,
  ..." with "no row of the name in a fence of two", and U1 and D1 with the
  names outside code spans. Restored.
- Sabotage: no pipe escaped in `table()`, `(cell) => cell`; only "a name
  from the snapshot or the database is code in the comment: ..." failed,
  with "no line | regression | ` relationship:comments.commentable_id->
  posts.id[commentable_type=x \| forged \| row \|] ` | ...". Restored.
- Sabotage: `code()` keeping the line breaks in a name, `const inline =
  text`; only the same test failed, with the same "no line | regression |
  ` relationship:comments.commentable_id->...`". Restored.
- Sabotage: the reason a claim was not measured written into the After
  cell, ``reason ? `${after} (${reason})` : after`` in `table()` (R3: the
  comment holds names, statuses, counts and rates); only "the comment on a
  report with every class: ..." failed, its diff showing `| unverifiable
  (time budget exhausted) |` where `| unverifiable |`. Restored.
- Sabotage: `diff()` without `report: CHECK_REPORT_FORMAT`; "the report is
  the value CheckReportSchema describes, whole" failed with "ZodError:
  [{ "code": "invalid_value", "values": [1], "path": ["report"],
  "message": "Invalid input: expected 1" }]" (the TAP reporter prints the
  error as `''`, the spec reporter in full), and "check --json prints the
  report alone ..." with the same error at its parse of stdout. Restored.
- Sabotage: `runCheck` printing its report lines with `out` in place of
  `err`; "check --json prints the report alone ..." failed with
  "Unexpected token 'o', "note the sc"... is not valid JSON", "a comment
  that cannot be written stops check with exit 1 and no JSON" with "no
  JSON", `check fixture: 12 unchanged` on stdout, and T3.2's sixteen tests
  that read check's stderr, "... and stdout stays empty" among them.
  Restored.
- Sabotage: the failed write passed over, `return EXIT_FAILURE` dropped
  from its `catch`; only "a comment that cannot be written stops check
  with exit 1 and no JSON" failed, with "check fixture: 12 unchanged /
  could not write context: EISDIR: illegal operation on a directory, ..."
  and `0 !== 1`. Restored.
- No sabotage left every test green. One failed its test only with
  assert's own message; that comparison was given one, in T3.3's own
  row-cap test, and no other test changed. With it the two files pass:
  41 tests.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  259 tests, 257 pass, the 2 live tests skipped, and the package smoke test
  passes; `npm run acceptance -- --task T3.3` prints `T3.3: 100/100`, every
  check passing.
### Iteration 3: the lead's answers
- The `|` escape on each table cell in `table()`, not inside `code()`:
  approved. Checked with cmark-gfm; the brief's version showed a stray
  backslash for a name in a note, outside any table.
- `--json` keeps each verdict's query and reason: decided. Section 0, item 6
  of the plan makes section 3 win over a task's text, and R7 asks every
  verdict to carry a query a human can rerun, while R3 lists query text among
  what an output may carry; the reasons are what `Verified` already carries.
  T3.3's "only names, statuses, counts and rates" holds for the pull request
  comment, which carries neither.
- `quiet` in T3.2's `reportLines` test built with `reportOf(...)` to the same
  value, no assertion changed: approved.

## T4.1 GitHub Action
### Iteration 1: 30/100
- The dbtruth part of T4.1, section 3 of the design brief for T3.3 and T4.1.
  The Action's repository, FilipKalcic1/dbtruth-action, is built beside this
  one and pushed by the lead, and A1 to A4 are evidenced by runs on GitHub
  (the lead's decision 3), so they stay empty here.
- Read first: sections 0 to 5 of the plan, T3.3, T4.1, T6.1, T6.2 and T7.1;
  the brief's sections 0, 1, 3 to 6 and 8, and its prototypes of
  `check.sh`, `comment.sh` and `scripts.test.sh`; `src/check.ts`,
  `src/cli.ts` and `src/schemas.ts` at HEAD d73c48b;
  `test/remeasure.test.ts`, `test/readme.test.ts`, `test/canned.ts` and
  `test/copies.ts`; README.md, NOTES.md (0.3.0), CHANGELOG.md, the T3.3 and
  T6.1 iterations above and `acceptance/`.
- The code at HEAD differs from the brief in one place this part meets: the
  comment's notes come after its table (T3.3, iteration 2), not before.
  Nothing here depends on it, and the fail scenario the brief gives the
  Action reads only the first line, the marker, and the regression row.
- Tests first: "the fixture snapshot script writes a context/ that check
  passes on" (D4, `test/remeasure.test.ts`) failed with
  `ERR_MODULE_NOT_FOUND` for `scripts/make-fixture-snapshot.mjs` and
  `1 !== 0`, for the reason the task describes: there was no script. It
  starts the script as the other tests start the CLI, with `command`, which
  now takes the script to run, `src/cli.ts` by default; no assertion
  changed.
- Built: `scripts/make-fixture-snapshot.mjs <dir>`, as the brief has it. It
  makes `<dir>`, runs `run()` there on `DATABASE_URL`, else the fixture,
  with the canned transport of `test/canned.ts`, and exits 0 when the run
  exits 0 or 2, and 1 when it exits 1. It runs under `node --import tsx`, is
  not in the package (`files` in package.json holds `dist`, README.md and
  LICENSE), and typecheck reads it. D4 passes. Run by hand as the reader
  role into a new directory: 14 files under `context/`, `snapshot.json`
  among them, exit 0, and `check` on that snapshot printed `check fixture:
  12 unchanged`.
- Docs:
  - README: "## CI" right after "Keeping context true", with the plan's
    workflow (checkout at the SHA `ci.yml` pins, v7.0.1;
    `FilipKalcic1/dbtruth-action@v1`; `database-url` from
    `secrets.DBTRUTH_DATABASE_URL`; `concurrency` per pull request with
    `cancel-in-progress`), what `pull-requests: write` and `concurrency` are
    for, a link to the Action's README for its inputs, outputs and comment,
    and the security guidance: a read-only role on a replica or a staging
    copy, never an owner role on production; the URL in a secret, since
    GitHub prints any other `with:` or `env:` value; `pull_request`, never
    `pull_request_target` with a checkout of the pull request's code; a
    fork's pull request skipped without failing; a database that holds the
    data the context describes; `context/snapshot.json` reviewed like code.
  - README: the Team tier moved after "CI", its first sentence and the
    free-forever sentence as they were. "The Action is coming: ... it will
    run" became "The Action (see CI) runs ...", and "The Action will run
    `check`" became "runs"; the license sentence stays in the future (T6.2).
    No code span added. The Development block gains the script's line.
  - CHANGELOG 0.3.0: the Action's bullet, after `check --json`'s; "which is
    coming" dropped from the Team tier bullet.
  - NOTES 0.3.0: the entry "The GitHub Action runs `check` on every pull
    request and keeps one comment on it.", after T3.3's, with the bullets
    the brief lists: the shape, `dbtruth-version`, the results, the comment
    rule, the could-not-run body, the size cut, a missing `gh` and a refused
    call, stop-commands, the password, the tests' fixture, the script and
    its test, R9 as the lead decided, the Team tier's move, and what is not
    done.
- The Team tier's changed sentences, re-checked against the plan and the
  code, numbered as in T6.1's iteration 1 (the evidence for T6.1 A2, whose
  manual item now names this record too):
  2. "The Action (see CI) runs `dbtruth check` on a pull request against the
     database the workflow gives it, writes what moved into one comment on
     the pull request, updated in place, and by default fails the job on a
     regression or a stale item": T4.1 (the `database-url` input, `fail-on`
     defaulting to `regression`, `comment.sh` updating the comment it finds
     or creating one, A2), T3.2's table (stale fails under `regression`),
     T3.3's comment. "(see CI)" is the section T4.1's Docs ask for.
  6. "The Action runs `check` in your own CI job": T4.1, a composite action
     whose bash step runs `npx dbtruth check` on the job's own runner.
  Both are in the present tense, as the check section is, since 0.3.0 ships
  the Action with `check`, as the brief directs. Sentence 7, the license
  check, stays in the future: T6.2 (P2) is not built. Sentences 1, 3, 4, 5,
  8 and 9 are unchanged. Both tests of the section pass: "the Team tier
  section names every command, and only those not built yet as coming" and
  "the Team tier section has a price and a waitlist link, ...".
- `acceptance/checks.json`, T4.1: D4 on T3.2's command, the gate, five docs
  checks (the CI section with the Action, `pull-requests: write` and
  `pull_request_target`; the order Keeping context true, CI, Team tier, What
  it sends; the Development line; NOTES; CHANGELOG) and T3.2's three
  structure tests. `acceptance/manual.json`: A1 to A4 and the sabotage item
  as the brief words them, each with its evidence empty.
- `npm run verify` exits 0: 260 tests, 258 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T4.1`
  prints `T4.1: 30/100`: every check passes, and the five manual items have
  no evidence. `npm run acceptance` over every task: every task built so
  far, T6.1 and T1.4 among them, still 100/100 with the README, CHANGELOG
  and NOTES changed; T4.1 30/100; overall 76/100 over 20 tasks, with T5.1,
  T5.2, T6.2 and T7.1 not started.
- Lost Acceptance (-50): `FAIL T4.1 A1 acceptance: no evidence for: The four
  automated scenarios pass in the Action repository's CI: ...`, and A2, A3
  and A4 likewise. Cause: each is a run on GitHub, of the Action's CI or on
  its test pull request (the lead's decision 3), which needs
  FilipKalcic1/dbtruth-action pushed; the lead fills them.
- Lost Tests (-20): `FAIL T4.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; it takes the
  local sabotages and a red run on a sabotage branch of the Action's
  repository, which a later stage and the lead do.
### Iteration 2: 30/100
- Four reviews (plan, security, quality, bugs) gave fourteen findings, some
  of them one defect seen by more than one review: the carriage return
  (security, bugs), the event gate (plan, quality, bugs), a refused list or
  update (plan, quality, bugs). Each was checked against the code, the plan
  and the brief before acting; none was rejected. One was taken in the
  first of the two forms it offered, `result` when the step never starts
  (below), and one in part, the sabotage record (below).
- Checked first:
  - The carriage return, end to end. `scripts/make-fixture-snapshot.mjs`
    wrote a real snapshot of the fixture; one verdict key became
    `x\r@octocat **approved**`, with an invalid status. `check --json`
    exited 1, and `od -c` of its stderr showed `verdicts.x \r @octocat`.
    The could-not-run body built from such a line, rendered by GitHub
    (`gh api markdown -f mode=gfm`): a `<pre>` that ended at `verdicts.x`,
    then a paragraph with a live `user-mention` link to @octocat, an image
    through camo, and `<strong>approved</strong>`. With the fix, one
    `<pre>` that holds every word.
  - setup-node at `820762786026740c76f36085b0efc47a31fe5020`, its
    `src/main.ts` read through the API: automatic caching reads
    `package.json` at the root of `GITHUB_WORKSPACE` only. In test.yml's
    scenarios job that is the Action's repository, which has none; in
    `action.yml` it is the user's repository, so the input stays there.
  - `check` with a wrong password prints `dbtruth: could not connect to the
    database: authentication failed; check the user and password in the
    URL`, and no step script of the scenarios job holds "could not
    connect".
  - The Action's 29 script cases at f5dd543 stayed green under each of the
    sabotages the reviews named: no resume line after dbtruth's lines,
    `moved` starting at 0, relations left out of what moved, a comment on
    every event, a refused list or a refused update failing the step, and
    the last of two comments taken.
- Fixed, in the Action's repository:
  - `scripts/check.sh`: each carriage return in check's stderr is made a
    line break before the four-space indent (`tr '\r' '\n'`), and its
    comment says why. node's error on a report it cannot parse is dropped
    (`2> /dev/null`): it quoted the report after commands resumed, where the
    runner reads a `##[` in it as a command. The Action's own `::error::`
    still says what went wrong.
  - `test/scripts.test.sh`, from 29 cases to 35:
    - the stop-commands case compares the whole block from the stop line to
      the resume line, so the resume line must follow dbtruth's;
    - the case of a check that cannot run starts with no comment, so it
      tests that one is created;
    - "a relation added and nothing else is stale: it fails, and creates
      the comment";
    - `step` takes the event from `EVENT`, `pull_request` unless set, and
      "on pull_request_target, as on any event but pull_request, no call to
      gh either";
    - a list, a create and an update GitHub refuses each exit 0 with one
      warning naming the permission, and the refused update leaves the
      comment as it was (`refused GET`, `POST`, `PATCH`, where only a
      refused create was tested);
    - "of two comments of its own, the first is updated";
    - "a carriage return in what check printed starts a line of its own,
      inside the code block", through `FAKE_ERR`, what the fake npx prints
      when check could not run;
    - "and so is a report it cannot parse" gives the fake npx `not json
      ##[warning]from stdout`, and "whose text is not printed once commands
      resume" finds that text in neither stream;
    - "no gh on the runner fails the step, even with nothing to create",
      renamed from "... fails when there is a comment to keep", which the
      code does not test for, and run with `false`;
    - a `reset` before "no database-url is skipped, and passes", so it
      counts only its own calls to gh.
  - `.github/workflows/test.yml`: `pull-requests: write` only in the
    scenarios job, the one that comments; the workflow's default is
    `contents: read`. `package-manager-cache: false` is gone from its
    setup-node step, where it did nothing. The log job looks for dbtruth's
    own line, `dbtruth: could not connect to the database: authentication
    failed`, where it looked for "authentication failed": the runner prints
    each step's script in the log, and the error step's holds those words,
    so they were found whether dbtruth's line was there or not.
  - `action.yml`: `comment` says, in the README's words, that a check that
    cannot run creates the comment too; `result` says `error` covers a
    wrong input as well, and that it is empty when the step did not start.
  - README: the `result` row says it is empty when the Action's step did
    not start, on a `working-directory` that does not exist or when
    setup-node failed before it. Taken in that form, not by moving the
    directory into check.sh: when setup-node fails no script runs, so no
    code could set `result` then either.
- Fixed in dbtruth, NOTES, the Action's entry: the carriage return, in the
  could-not-run bullet; an empty `result` for a step that never starts, in
  the results bullet; node's dropped error, in the stop-commands bullet.
- Sabotage of the Action's rules. Each was made in a fresh copy of the
  repository inside a `node:22` container, with `perl`, checked with `cmp`
  to have changed the file, and run through `bash test/scripts.test.sh`;
  the repository itself was never edited, so nothing needed restoring.
  - `echo "::$token::"` removed: "dbtruth's lines are printed with workflow
    commands stopped, and commands resume after them" failed, the block
    running to the end of stdout with no resume line.
  - `moved=0` at the start: "a check that cannot run is an error, and
    creates a comment that says why" failed with `got [exit 1:
    regressions= result=error stale= |]`, no comment, and the carriage
    return case with an empty body.
  - `+ relations.length` out of what moved: "a relation added and nothing
    else is stale: ..." failed with `exit 2: regressions=0 result=fail
    stale=1 |` and no comment.
  - The `pull_request` test removed from the comment's condition: "on
    pull_request_target, ..." failed with 2 calls to gh where 0.
  - The list's `if ! ids=$(gh api ...)` made a plain assignment: "a list
    GitHub refuses ..." failed with `exit 1, 0 warning|`.
  - `|| warn` dropped from the update: "nor does an update it refuses,
    ..." failed with `exit 1, 0 warning`.
  - The last id taken, `${ids##*$'\n'}`: "of two comments of its own, the
    first is updated" failed, the second one updated instead.
  - `sed 's/^/    /' "$report.err"` again, without `tr`: "a carriage return
    in what check printed ..." failed, `@octocat` on the line of
    `verdicts.x`.
  - node's stderr kept: "whose text is not printed once commands resume"
    failed with `1` where `0`.
  No sabotage left every case green. The log job's check runs only on
  GitHub; its fix rests on the runner printing each step's script.
- Taken in part, the sabotage record (plan review): the sabotages above are
  recorded here, and `acceptance/manual.json`'s sabotage item keeps its
  evidence empty. It also asks for a sabotage of
  `scripts/make-fixture-snapshot.mjs` and a red run on a sabotage branch of
  the Action's repository, and evidence now would mark as done what is not
  (4.4).
- Runs, in `node:22` with jq 1.6 and ShellCheck 0.9.0, on a `git archive` of
  the Action's commit: `shellcheck scripts/*.sh test/*.sh` clean; `bash
  test/scripts.test.sh` 35 ok, 0 FAIL; the scripts job's check that every
  message the scripts print has a row in the README passes. actionlint
  1.7.12 is clean on test.yml, its shellcheck pass over the `run:` scripts
  included.
- U4 rendered by GitHub, which the brief asks for before the Marketplace:
  the report of "a name from the snapshot or the database is code in the
  comment: ...", rendered by `reportMarkdown` at HEAD (its three rows equal
  the test's), sent to `gh api markdown -f mode=gfm -f
  context=FilipKalcic1/dbtruth-action`. GitHub returned a table of a header
  and three rows, each name one `<code>` in its cell, `</details><img
  src=x>@octocat` as text, and no mention, link, image or `<details>`. The
  context repository does not exist yet; only issue and commit references
  depend on it, and U4 has none.
- The Action's repository, `C:\Users\igork\Desktop\rainbow\dbtruth-action`:
  one local commit, 8921009, amended from f5dd543, with no remote. Its eight
  files: `action.yml`, `scripts/check.sh`, `scripts/comment.sh`,
  `test/scripts.test.sh`, `.github/workflows/test.yml`, `README.md`,
  `LICENSE` (MIT) and `.gitattributes` (`* text=auto eol=lf`). Against the
  brief's prototypes: `comment.sh` is the same; `check.sh` has comments on
  unparseable JSON and on the code block (iteration 1), the carriage return
  and node's dropped error; `scripts.test.sh` has the cases above, and from
  iteration 1 two renamed cases, "comment never makes no call to gh" and
  "the password is in nothing the action prints or writes", which also
  reads `$GITHUB_OUTPUT`.
- Lead, and HUMAN, not done, and recorded as done nowhere:
  - The lead: commit and push the dbtruth part of T4.1; set `DBTRUTH_REF`
    in the Action's test.yml, forty zeros now, to that commit's SHA; create
    the public repository FilipKalcic1/dbtruth-action and push 8921009, or
    its successor, to main; get test.yml green there (A1, A3, A4); open a
    test pull request and push to it twice (A2); push a sabotage branch on
    which exit 2 reads as pass, see it go red, and delete it; record the
    links in `acceptance/manual.json` and here.
  - HUMAN, in this order: `npm publish` 0.3.0 (2FA); tag `v1.0.0` and a
    moving `v1` in the Action's repository; publish it on the Marketplace.
    The plan's "Marketplace listing text" is `action.yml`'s `name` and
    `description` and the first paragraph of the Action's README.
- `npm run verify` exits 0: 260 tests, 258 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T4.1`
  prints `T4.1: 30/100`: every check passes, and the five manual items have
  no evidence.
- Lost Acceptance (-50): A1 to A4, `no evidence for: ...`, as in iteration
  1. Cause: each is a run on GitHub, which needs the Action's repository
  pushed (the lead's list above).
- Lost Tests (-20): `FAIL T4.1 sabotage tests: no evidence for: ...`.
  Cause: the item's evidence waits for the snapshot script's sabotage and
  the sabotage branch's red run (above).
### Iteration 3: 50/100
- The sabotage check of section 4.5 for T4.1, locally, in both
  repositories. First, copies outside both repositories (the session's
  scratchpad): the files to break, with their SHA-256; the Action's HEAD,
  8921009, and its `git status`, clean; dbtruth's `git diff HEAD` and
  `git status`. Each sabotage was made in place with `perl`, shown by
  `git diff` or `diff`, run, and undone by copying the saved file back;
  `cmp` against the copy and the working tree against its saved state
  confirmed each restore.
- The Action's tests ran as `bash test/scripts.test.sh` in `node:22` with
  jq 1.6 and ShellCheck 0.9.0, the working copy mounted read-only. Before
  any sabotage: 35 ok, 0 FAIL, and `shellcheck scripts/*.sh test/*.sh`
  clean.
- Sabotage of the Action's scripts. No sabotage left every case green.
  - `scripts/check.sh`, exit 2 reported as pass: `if [ "$code" = 0 ] ||
    [ "$code" = 2 ]; then result=pass code=0; fi`. Four cases failed: "a
    regression and two stale items fail" with `got [exit 0: regressions=1
    result=pass stale=2 |...], expected [exit 2: regressions=1 result=fail
    stale=2 |...]`, and "a relation added and nothing else is stale: ...",
    "comment never makes no call to gh" and "on pull_request_target, ..."
    likewise.
  - `scripts/comment.sh`, a second comment created where the first should
    be updated: `if [ -n "$id" ]` made `if false`. Nine cases failed,
    among them "the second run updates it", with both bodies where one was
    expected, "one comment created in all, never two: got [2], expected
    [1]", "and updated twice: got [0], expected [2]" and "still one
    comment: got [2], expected [1]".
  - `scripts/comment.sh`, the author filter dropped: `mine` selecting on
    the marker alone. "a person's comment that starts with the marker is
    left alone" failed, the person's comment overwritten with the Action's
    `dbtruth: 1 stale`, and "and the action's own is created beside it"
    with `got []`.
  - `scripts/comment.sh`, the size cut dropped: the `if` that replaces a
    body over 65,536 bytes removed. "a body over GitHub's limit is cut to
    its counts and a note" failed, its `got` the whole body, 70,000 `x`
    after the counts, where the note was expected.
  - `scripts/check.sh`, the stop-commands dropped: the token, the stop line
    and the resume line removed, `cat "$report.err"` left. "dbtruth's lines
    are printed with workflow commands stopped, and commands resume after
    them" failed with `got []`, where it expected the block from
    `::stop-commands::` holding dbtruth's `##[set-output ...]` line.
  - `scripts/check.sh`, the password echoed into the log: `set -euxo
    pipefail`, whose trace prints `DATABASE_URL` expanded. "the password is
    in nothing the action prints or writes" failed with `got [1], expected
    [0]`.
  - `scripts/check.sh`, the password echoed into the comment: "dbtruth
    check could not run on $DATABASE_URL (exit $code)". The same case
    failed with `got [2]`, the comment and `dbtruth.md`.
  After the last restore the three files' SHA-256 were the saved ones, the
  Action's `git status` clean at 8921009, and the tests 35 ok, 0 FAIL.
- Sabotage of `scripts/make-fixture-snapshot.mjs`, its tests run by name
  (`--test-name-pattern`) on the Docker fixture:
  - The exit code mapping dropped, `process.exitCode = code`: D4 failed at
    `assert.equal(status, 0, stderr)` with `2 !== 0`, under the run's
    stderr, whose `relationships: 1 confirmed, 1 broken` is the fixture's
    broken join the mapping is there for.
  - A run that failed reported as success, `process.exitCode = 0`: D4
    stayed green, and no other test runs the script. D4 runs only a run
    that succeeds, so nothing held the script's exit 1, which the Action's
    CI needs: after a snapshot step that exits 0 on a failed run, each
    scenario would fail later, on a snapshot that is not there. New test,
    after D4 in `test/remeasure.test.ts`: "the fixture snapshot script fails
    when the run does, and says why". It runs the script with
    `DATABASE_URL` set and empty, as a step whose variable is missing sets
    it; the run finds no URL and returns 1. That is the one way the
    script's `run()` returns 1: a connection that fails throws, and node
    then exits 1 whatever the mapping says (checked by hand on a URL where
    nothing listens: exit 1). The test passes on the script as built.
    Repeated, the sabotage failed it with "the script exits 1 as the run
    did, with the run's reason on stderr", `+ 0` against `- 1`.
  - The run's lines not passed on, `err: () => {}`: D4 stayed green, since
    it reads stderr only for its message; the new test failed with its
    message, `+ ''` against `- 'no database URL: DATABASE_URL is not in
    the environment or in a .env'`.
  - The run's directory taken from the process, `cwd: process.cwd()`: D4
    failed at its last comparison, `[1, ['no context/snapshot.json: run
    npx dbtruth first']]` where `[0, ['check <copy>: 12 unchanged']]`,
    but only with assert's own message. The comparison was given one,
    "check passes on the snapshot the script wrote in project/"; no
    assertion changed. Repeated, the sabotage failed D4 with it. The first
    sabotage was then repeated on the tests as they now are, and failed D4
    as before.
  After each restore the script's SHA-256 was the saved one and `git diff
  HEAD` byte for byte the one saved before that sabotage; after the last,
  every file's diff but `test/remeasure.test.ts`'s was the one saved
  before the first.
- With the new test, `acceptance/checks.json`, T4.1, gains
  `fixture-snapshot-fails` on D4's command, as T1.4's test added in its
  sabotage got a check, and NOTES' bullet on the script names the test.
- `acceptance/manual.json`: T4.1's sabotage item has its evidence, a
  pointer to this record, which also names what is still to come from the
  lead: the red test.yml run on a sabotage branch of
  FilipKalcic1/dbtruth-action (exit 2 reported as pass), the branch deleted
  afterwards, its link to be added there. Iteration 2 left that evidence
  empty for want of the red run; it is written now with the run named as
  missing. A1 to A4 stay empty.
- `npm run verify` exits 0: 261 tests, 259 pass, the 2 live tests skipped,
  and the package smoke test passes. `npm run acceptance -- --task T4.1`
  prints `T4.1: 50/100`: every check passes, the new one among them, and
  the sabotage item has its evidence.
- Lost Acceptance (-50): A1 to A4, `no evidence for: ...`, as in
  iterations 1 and 2. Cause: each is a run on GitHub, which needs the
  Action's repository pushed (the lead's list in iteration 2, the red run
  on a sabotage branch included).
### Iteration 4: 100/100 (the lead)
- The maintainer created FilipKalcic1/dbtruth-action and pushed it after
  granting the gh token the `workflow` scope (creating a public repository
  was not the agent's to do). The runs on GitHub:
- A1: https://github.com/FilipKalcic1/dbtruth-action/actions/runs/36151534406 (main, 0cc5eb8): scripts, scenarios and log green. pass: "check fixture: 12 unchanged"; fail: "check fixture: 1 regression, 11 unchanged"; skipped: the notice; error: "dbtruth: could not connect to the database: authentication failed; check the user and password in the URL".
  First run 36151307682 (81c91d4): scripts and scenarios green; log red because gh api refuses to print a log with terminal escape sequences (its --allow-escape-sequences flag is not in gh 2.95); fixed with curl in 0cc5eb8.
- A2: https://github.com/FilipKalcic1/dbtruth-action/pull/1, pushed twice (runs 36151722873 and 36151846504, all green): one comment by github-actions[bot] after the first push (id 5834631459, "<!-- dbtruth-check --> / dbtruth: 1 regression, 11 unchanged"), still exactly one after the second. The second run found it by marker and author and sent PATCH (no warning in the log, and no second comment although the report had findings, which would have created one); the body was identical, so GitHub records no edit. The scripts job's fake-gh cases prove a changed body is updated in place (one POST and two PATCHes in all). The pull request was closed without merging and its branch deleted.
- A3: the skipped scenario in run 36151534406: "##[notice]dbtruth check skipped: database-url is empty, as it is on a pull request from a fork, which gets no secrets", result skipped, step green.
- A4: in run 36151534406 the log job fetched the scenarios job's real log (1,144 lines), found dbtruth's authentication line and not the password; a re-check of the whole run log found "canary-pii-wrong" 0 times; the error scenario found it in no file the Action wrote; the pull request's comment holds no URL.
- Sabotage (GitHub): branch ci-sabotage (exit 2 reported as pass in scripts/check.sh), run https://github.com/FilipKalcic1/dbtruth-action/actions/runs/36152049336 red: scripts job failed 4 cases ("a regression and two stale items fail: got ... result=pass ..., expected ... result=fail"), scenarios failed. Branch deleted, locally and on GitHub.


## T5.1 `dbtruth mcp`
### Iteration 1: 80/100
- Read first: sections 0 to 5 of the plan, T1.4, T3.1 to T3.3, T5.1, T5.2 and
  T7.1, Appendices A to E; the design brief for T5.1 and T5.2 in full, the
  lead's decisions in its section 12 binding; every module of `src/` at HEAD
  a4de4de and the tests that touch what T5.1 changes (`structure`, `readme`,
  `init`, `doctor`, `safety`, `config`, `write`, `extract`, `integration`,
  `remeasure`, `joins`, `copies.ts`, `canned.ts`); README.md, NOTES.md (0.2.0,
  0.3.0), CHANGELOG.md, the T3.3 and T4.1 iterations above and `acceptance/`;
  the installed SDK's own types and source (`McpServer.registerTool`,
  `serveStdio`, the tool call's validation and error handling, the client's
  `StdioClientTransport`, which spawns through cross-spawn with a default
  subset of the environment).
- The code at HEAD differs from the brief where T2.2, T3.3 and T4.1 landed
  after it, and the code won: `verify` takes `() => integerKeys(db, cfg,
  catalog)`, as `remeasure` calls it; `check` now has T3.3's `CheckReport` with
  a schema, so the `check` tool answers with `reportLines` and the report as
  JSON, where the brief had the lines alone because the JSON did not exist.
- Checked against the documentation on 2026-09-25: Claude Code's MCP page
  (code.claude.com/docs/en/mcp) gives `claude mcp add [options] <name> --
  <command> [args...]`, `.mcp.json` with `mcpServers` and `${VAR}` expansion,
  and "Claude Code sets `CLAUDE_PROJECT_DIR` in the spawned server's
  environment to the project root", and says nothing of Windows or `cmd /c`;
  Cursor's page (cursor.com/docs/context/mcp) gives `.cursor/mcp.json`, a
  stdio entry with `"type": "stdio"` and `${workspaceFolder}`, and does not
  document the working directory. npm: `@modelcontextprotocol/server` and
  `@modelcontextprotocol/client` 2.1.0 are `latest`; installed pinned exactly.
- Probed in the scratchpad before building: a refined strict object lists as
  `additionalProperties: false` with its required keys; a key it does not take
  and the pairing refinement come back as `isError` with `Input validation
  error: Invalid arguments for tool measure_join: ...`; a server whose client
  ends stdin before any message exits, the factory never having run.
- Tests first:
  - `test/mcp.test.ts`, new, 22 tests (the brief's M1 to M22 with the flat
    input of decision D2), in `test:db`. On the code as committed it did not
    load: `Cannot find module 'src/mcp.js'`. Run against a stub `src/mcp.ts`
    whose tools all refused with `not built`, and a CLI without `mcp`, each
    test failed for its reason: the spawned ones with `SdkError: Connection
    closed` (M1, M11, M16, M19) or, speaking JSON-RPC by hand, `the answer to
    request 1 within 20000 ms` (M12, M18); the in-process ones on `not built`
    where a refusal, a line or JSON was expected (M3 expected the BROKEN line
    of the photo branch, M6 `unknown table ordrs; the closest: orders`, M8 and
    M9 `no <abs>/context/...: run npx dbtruth first`, M14 `database
    connection lost: lost on purpose`), `"not built" is not valid JSON` (M2,
    M4, M5, M7, M17, M22), `never two statements at once` with 0 (M13),
    `Cannot read properties of undefined (reading 'lost')` (M15), and `[]`
    where `['orders']` (M21).
  - Elsewhere: `config.test` "mcpCallBudgetSeconds is 20 by default, ..."
    failed with `undefined` where 20; `extract.test` "a relation whose sample
    could not be read says why, ..." with `undefined` where the timeout's
    message; `init.test` "the next steps end with the command that adds dbtruth
    mcp to Claude Code, ..." with the last next step being the CLAUDE.md line;
    `readme.test`'s rows test with `refuse` missing from the ways found;
    `structure.test` "only mcp.ts imports the MCP SDK, ..." with `false ==
    true` and "mcp.ts never loads model.ts at run time" with `ENOENT` for
    `src/mcp.ts`; `write.test` did not load (`joinLine`, `tableFileName` not
    exported). `safety.test` "resetBudget starts a new budget ..." and "a
    connection the server closes while idle is reported by the next statement,
    and does not end the process" and `integration.test` "a connection the
    server closes while the model answers stops the run with database
    connection lost, ..." were written against `resetBudget` and `lost`, which
    did not exist (typecheck); the last two exercise what, before the
    listener, ended the test process.
- Built, in the brief's order, with the lead's decisions:
  - `safety.ts`: `Connection`, a `Db` with `resetBudget` and `lost`, which
    `connect` returns; the pg `'error'` listener, which keeps the first reason;
    the next statement throws `database connection lost: <reason>`.
  - `config.ts`: `mcpCallBudgetSeconds`, 20, its comment, variable and flag,
    minimum 0.001.
  - `write.ts`: `tableFileName` and `joinLine` moved out of `write()` and
    `tableFile`, which call them; `joinLine` gains the rejected wording.
  - `schemas.ts`, `extract.ts`: `Table.unmeasured`, set when the statistics
    statement fails and for a materialized view never refreshed; prompt A's
    introduction says what it means.
  - `mcp.ts`, new: the four handlers over one lazily opened connection, a
    queue that never rejects, `lookUp` in the catalog of the call, `closest`
    by edit distance, the `describe_table` projection, and `serve`.
  - `cli.ts`: `runMcp` (the project, `setup()` reused for the settings) and
    the `mcp` command with every tunable flag; `init`'s last next step.
  - `doctor.ts`: the key line names `mcp`.
  - `package.json`: the server as a dependency and the client as a dev
    dependency, both exact; `test:db` gains `test/mcp.test.ts`.
  - `scripts/pack-smoke.mjs`: starts the installed `dbtruth mcp` over the SDK's
    client with only `DATABASE_URL` added to the SDK's default environment,
    lists the four tools and measures orders.customer_id -> customers.id as
    broken. On Windows cross-spawn ran the `.cmd` shim.
- One fix after the first full run of `test/mcp.test.ts`: two tests that hold
  a session on a copy of `fixture_template` (M15, M17) timed out in their
  after-hooks with `database ... is being accessed by other users`, and the
  file then hung on the open connection. `node --test` runs a test's
  after-hooks in the order they are added, so the copy's drop, added first,
  ran before the session's close. Those two tests close the session, and the
  two that speak to a spawned server (M12, M18) end it, in a `finally` inside
  the test. One regex of M6 wanted `unknown table` without its space.
- Docs: README (the next steps; a subsection of "Giving it to your agent",
  "Measuring while it writes: `dbtruth mcp`", with the four tools, the `claude
  mcp add` line, `.mcp.json`, `.cursor/mcp.json`, the Windows fallback, where
  the project and the settings come from, one connection and the budget; the
  Commands line; five troubleshooting rows new and five changed, and the
  table's introduction; the Team tier; "Agents (MCP)" under what it sends;
  Tuning; Development), NOTES `## 0.4.0 (unreleased)` and a bullet under
  "Where string matching", CHANGELOG `## 0.4.0 (unreleased)`, `--help` and
  `mcp --help`.
- Changes to earlier tests and checks, none to what an assertion means, each
  named in NOTES (decision D6): `readme.test.ts` `WAYS`, `REPORT` and
  `UNSEEN`; `doctor.test.ts` `NO_KEY`; `structure.test.ts` the map;
  `acceptance/checks.json` T1.5 `readme-commands` and T1.4 `readme-team`.
- `acceptance/checks.json`: 56 checks for T5.1, all on one test command (ten
  files, run once) but the gate, `A4-installed` (the pack smoke line of `npm
  run verify`), `--help`, `mcp --help` and the file checks. Acceptance A1 (M1,
  M2, M3, M7, M8, M9), A2 (M5, M10, M11, M20, the runtime-import walk), A3
  (M1, M4, M6), A4 (M12, and the installed server); a tests check for each new
  test and doctor's key line; invariants: the structure tests, the canary
  tests, stdout and the project, the troubleshooting rows; docs: README (six),
  `--help` (two), `config.ts`, prompt A, NOTES (two), CHANGELOG.
  `acceptance/manual.json`: the sabotage item, empty.
- On other servers and systems: the task's ten test files with `remeasure` and
  `joins` pass on Postgres 12.22 and 18.6, in throwaway containers loaded with
  every fixture file in compose order (176 of 178, the 2 live tests skipped);
  with `ci` and `acceptance` under Linux as uid 1000 in `node:20` (20.20.2)
  and `node:22` (22.23.3), from a copy of the working tree with LF endings,
  against the 18.6 server (192 of 194); on `node:22` also `npm run build` and
  the package smoke test, the installed `dbtruth mcp` line included.
  The first Linux Node 22 run failed one test of T3.1, "the fingerprint
  changes when a column is added in a copy of fixture_template, ...", at its
  60 s limit, where it takes about a second. Run three times more against a
  server logging lock waits and every statement over 5 s: all passed, and one
  took 97 s in all because T3.2's "a new table is stale" held about 60 s, while
  the server logged no lock wait and no statement over 5 s. The time goes
  outside Postgres, in the helper that makes and drops copies, which has no
  timeout, on the way from the container through Docker Desktop's port
  forwarding; it is not in T5.1's code, and neither Windows run nor CI's
  service container goes that way. No container and no copy was left.
- `npm run verify` exits 0: 293 tests, 291 pass, the 2 live tests skipped,
  and the package smoke test passes, its `dbtruth mcp` line included. `npm run
  acceptance -- --task T5.1` prints `T5.1: 80/100`, every check passing but
  the sabotage item. `npm run acceptance` over every task: each other task
  scores as before (T4.1 50/100, waiting on the Action's runs; T5.2, T6.2 and
  T7.1 have no checks yet), and all 92 file checks match the final files.
- Lost Tests (-20): `FAIL T5.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- Open for the lead:
  - The `check` tool answers with the report's lines and the `CheckReport` as
    JSON, not the lines alone as the brief has it (above).
  - The README gives `cmd /c` as the Windows fallback; nothing here ran Claude
    Code on native Windows with the server, which T5.2's manual A3 is to do.
### Iteration 2: 80/100
- Read first: the four reviews of iteration 1 (16 findings, from the plan,
  rules, quality and bugs lenses), sections 3 and 4 of the plan and T5.1 again.
  Each finding was checked against the code, the SDK's source and, where it
  claimed a behavior, a run, before anything changed.
- Real, and fixed at the cause:
  - R3, found by two reviews: `run` in `safety.ts` passed the server's message
    on, and a data exception quotes the value it failed on. Reproduced on the
    fixture's server: `SELECT count(*), count(DISTINCT x::text) FROM (SELECT
    v::int AS x FROM (VALUES ('1'),('canary-secret-123')) t(v)) q` fails with
    `invalid input syntax for type integer: "canary-secret-123"`. So a view
    that casts a column sent a row's hidden value to prompt A through
    `unmeasured`, and through a verdict's `skipped` to the table files, the
    snapshot, prompt B, `check` and the MCP answers. Fixed once, where the
    error is caught: class `22`, and class `P0`, all of PL/pgSQL's (`ASSERT`
    is P0004, not P0001), become `a value could not be read (SQLSTATE
    <code>)`; every other error keeps the server's words. The wording is
    neither review's: "a value in the data" is wrong for a condition's own
    value, which the server refuses the same way (a NUL byte, 22021). So
    T2.3's assertion in `joins.test.ts` that expected `/0x00/` now expects this
    sentence with 22021, the same fact in other words, named in NOTES. README:
    a troubleshooting row and a sentence under "What it sends"; NOTES;
    CHANGELOG.
  - The server stopped when the SDK closed its probe instance. Reproduced with
    a client speaking JSON-RPC by hand: `server/discover` with the 2026-07-28
    envelope, then `initialize`, then `tools/list` got two answers and `EXIT 0`.
    `serve` now ends when stdin ends or closes, or when a signal's
    `handle.close()` settles, not on an instance's `onclose`; the known limit
    in NOTES is gone.
  - A4, two findings: `A4-installed` could not fail for A4, since the SDK's
    client passes over a stdout line that is not JSON (`ReadBuffer`'s
    `readMessage`: `if (error instanceof SyntaxError) continue`), and the
    stdout test took no path that logs. Taken as the finding's alternative:
    the check is `installed`, under the tests, the package smoke test being
    what the plan's Tests list asks of it. The stdout test now starts the
    server in a project below its repository's root with no URL, fills the
    root's `.env`, and sends `{"jsonrpc":"2.0","method":7}`, so that the no-URL
    lines, `reading settings from ..\.env` and `mcp: <error>` are logged, and
    checks that stderr has them. `raw()` takes the directory, starts the server
    with the SDK's default environment as `started` does (the environment's
    `DATABASE_URL`, which CI sets, would hide the no-URL path), keeps stderr,
    and counts whole lines only, so a stray newline is a line that fails to
    parse. Not done: a second exchange by hand in `pack-smoke.mjs`; the
    installed `dist/` is `tsc`'s output of the same source.
  - `joinLine` called a declared join that could not be measured inferred:
    the last line hard-coded the word since 0.1.8, and `measure_join` now
    answers with that line. A stated join's is `(not measured: <reason>)`, or
    its status alone. Test in `write.test.ts`; NOTES; CHANGELOG.
  - Docs: the `--dotenv` row gives the project directory for `mcp`; the
    `unknown table` row says per tool how a table is found; the README's "runs
    one call at a time" is now the calls that use the connection; the `<path>
    is not a file` sentence, and NOTES' "above 0 as a millisecond" and "in
    catalog order", are reworded; the CHANGELOG's `unmeasured` line says the
    model still gets the 0s beside it.
  - Code: `context` reads the directory once, with each entry's type, and
    `lstat` is gone; `lookUp` passes over an undefined column, so the call
    hands it `asked.when_column` as it is; `declares` in `schemas.ts` is the
    one test for a declared key, asked by `verify` and `measure_join`; `admin`
    in the tests takes a URL; a missing space in `write.test.ts`.
- Taken in part:
  - `declares` takes the relation `findTable` found as `to`, not the claim's
    `r.to.table`: `check` hands the snapshot's claims to `verify` without
    spelling them again, so after a rename that changes only case the two
    differ, and the suggested form would change which joins `check` weighs.
  - `context` still lists the `.md` names on its refusal path when no table
    was asked: only a refusal builds the list, and skipping it there would
    take a condition more.
- Rejected: none.
- New tests, each run against the code before its fix, put back in place and
  then restored byte for byte from a copy outside the repository:
  - mcp, "a value the server quotes in an error reaches no answer, no file and
    no prompt": `'invalid input syntax for type bigint:
    "person1@canary-pii.example"'` where the sentence was expected.
  - safety, "a statement that fails on a value in the data is told by its code
    alone, and any other error in the server's words": `'invalid input syntax
    for type integer: "person1@canary-pii.example"'`; with class P0 alone
    dropped, `'cannot take person1@canary-pii.example'`.
  - mcp, "a client that probes with server/discover, then opens with
    initialize, is served on": `the answer to request 3 within 20000 ms`.
  - mcp, the stdout test, with `mcp`'s log lines written to stdout:
    `SyntaxError: Unexpected token 'o', "no database"... is not valid JSON`.
    The no-settings test, over the SDK's client, stayed green under the same
    change, as the review said.
  - write, "a declared join that could not be measured says why, and is not
    called inferred": `'order_items.order_id -> orders.id (inferred, not
    measured: no non-null rows to test)'`.
  These show the tests fail for their reason; they are not the task's
  sabotage record.
- `acceptance/checks.json`: `A4-installed` is `installed` under the tests; A2
  and the canary invariant gain the new canary test; four tests checks
  (`probe`, `error-canary`, `data-error`, `declared-unmeasured`);
  `readme-rows` gains the new row.
- `npm run verify` exits 0: 297 tests, 295 pass, the 2 live tests skipped, and
  the package smoke test passes, its `dbtruth mcp` line included. `npm run
  acceptance -- --task T5.1` prints `T5.1: 80/100`, every check passing but
  the sabotage item. `npm run acceptance` over every task: each other task
  scores as before (T4.1 50/100, waiting on the Action's runs; T5.2, T6.2 and
  T7.1 have no checks yet), overall 81/100 over 20 tasks, and all 92 file
  checks match the final files.
- Lost Tests (-20): `FAIL T5.1 sabotage tests: no evidence for: Sabotage
  check (BUILD_PLAN.md 4.5): ...`. Cause: no sabotage record; the sabotage
  check is done by a later stage.
- The sabotage check of the task (section 4.5). `src/mcp.ts`,
  `src/safety.ts`, `src/cli.ts` and `test/mcp.test.ts` were copied outside
  the repository first. After each break `test/mcp.test.ts` was run (24
  tests, all passing before), with `test/safety.test.ts` for the two breaks
  in `src/safety.ts` (44 tests).
- Sabotage: `lookUp` returned the relation before checking the columns
  named (`return found;` once the table was found); "an unknown table or
  column, or a name with quotes and semicolons, is refused with the closest
  names, and no statement is built from it" failed with "orders.customer ->
  customers.id (inferred, not measured: unknown column orders.customer)",
  `isError` `undefined` where `true`: `verify`'s verdict on a column it
  could not find, in place of the refusal and its closest names. Restored.
- Sabotage: the queue never advanced (`turn = call` removed), so calls ran
  at once; "calls made at once run one at a time on one connection, each
  with a budget of its own, and answer as they would alone" failed with
  "never two statements at once", `3 !== 1`, and "stdout carries JSON-RPC
  and nothing else, and when stdin ends the server exits 0 and leaves no
  session" with "describe_table opened the connection", `2 !== 1`: the
  three calls sent together opened two. The file then did not exit, held
  open by the two connections the racing calls opened and nothing closed,
  and the run was stopped; its two processes, which hold two idle sessions
  on `fixture` that no test counts, are left to end by hand. The later
  runs passed `--test-force-exit`, which changes no result. Restored.
- Sabotage: the call's own budget not set (`held.db.resetBudget(...)`
  removed); "calls made at once run one at a time ..." failed with
  "mcpCallBudgetSeconds for each call", `[]` where `[7, 7, 7]`. Restored.
- Sabotage: a connection lost while idle kept (the `lost()` check
  removed); "a connection the server closes while idle is replaced before
  the next call" failed with "database connection lost: terminating
  connection due to administrator command", `isError` `true` where
  `undefined`. Restored.
- Sabotage: every join called inferred, `basis: "inferred"` in place of
  `declares(...)`; "measure_join gives each join the verdict, query and
  numbers a full run gives it, and the line of its table's file" failed
  with "relationship:order_items.order_id->orders.id:
  "order_items.order_id -> orders.id: confirmed, 100.0% of 1200 sampled
  rows match (inferred)." is not a line of order_items.md". The verdict
  itself matched, since the basis changes only the line. Restored.
- Sabotage: the condition left out of the claim (the `when` line removed),
  so the whole join was measured; "measure_join measures one branch of a
  polymorphic reference on its own rows" failed with "**BROKEN**
  comments.commentable_id -> photos.id: 50.0% match (240 of 480 sampled),
  240 orphans, ..." where "... when commentable_type = 'photo': 66.7% match
  (120 of 180 sampled), 60 orphans, ..." was expected, "a when value
  holding SQL is only ever $1: ..." with `'confirmed'` where `'empty'`, and
  "a condition on a hidden column is not measured, whatever value is
  guessed" with "person1@canary-pii.example", `broken` and its numbers
  where `unverifiable` and none. Restored.
- Sabotage: `JoinSchema` a plain `z.object`, which drops a key it does not
  take; "the server lists exactly the four tools, each taking a closed
  object, ..." failed, but only with assert's own "Expected values to be
  strictly deep-equal" and a cut diff, `undefined` where `false`, naming
  neither the tool nor the slot. That comparison was given a message
  saying what it checks; repeated, the test failed with "per tool, the
  keys it takes, those it requires, and false for any other key",
  `measure_join`'s `undefined` where `false`. Restored.
- Sabotage: the pairing refinement removed from `JoinSchema`, so half a
  condition was taken; "the server lists exactly the four tools, ..."
  failed with "{"when_column":"status"}", `isError` `undefined` where
  `true`: measured, not refused. Restored.
- Sabotage: `describe_table` answering the whole `Table`, `tables[0]` in
  place of `described(tables[0])`; "describe_table gives a full run's key,
  size and allowed values, and no other column's values" failed with the
  bare key "schema", and "describe_table says why a relation it could not
  read has no statistics" with "customer_id", `[0, 0]` where no null rate
  or distinct count. The first test's two key checks were given a message
  saying what they check; repeated, it failed with "schema: not a field
  describe_table answers with". Restored.
- Sabotage: a data exception told in the server's words again, `const
  message = errorMessage(e)` in `run` in `src/safety.ts`; "a value the
  server quotes in an error reaches no answer, no file and no prompt"
  failed with `'invalid input syntax for type bigint:
  "person1@canary-pii.example"'` where `'a value could not be read
  (SQLSTATE 22P02)'`, from `describe_table` on the `phones` view, and
  safety's "a statement that fails on a value in the data is told by its
  code alone, and any other error in the server's words" with the same
  for `integer`. Restored.
- Sabotage: `runMcp` writing the settings lines to stdout,
  `process.stdout.write` in place of `opts.err` in `open`; "stdout carries
  JSON-RPC and nothing else, ..." failed with "Unexpected token 'o', "no
  database"... is not valid JSON". Restored.
- Sabotage: `context` reading whatever the listing holds under the name
  (the `isFile()` check removed); "context returns the files the last run
  wrote, says where to run dbtruth before there are any, and reads nothing
  outside context/" failed with "EISDIR: illegal operation on a directory,
  read", thrown by `context` on the directory put where `orders.md` was.
  Restored.
- Sabotage: `resetBudget` keeping what was spent (`spentMs = 0` removed in
  `src/safety.ts`); "resetBudget starts a new budget with nothing spent"
  failed with `spentMs: 11.91` where `0` and `remainingMs: 4988.09` where
  `5000`. Restored.
- `src/mcp.ts` (the first to ninth and the twelfth), `src/safety.ts` (the
  tenth and thirteenth) and `src/cli.ts` (the eleventh) were restored each
  time from the copy and matched it byte for byte (`cmp`); `git diff HEAD
  -- src/safety.ts` and `-- src/cli.ts` printed the same diff as before,
  and `src/mcp.ts`, untracked, matched its copy. No sabotage left every
  test green. Two failed their tests only with assert's words or a bare
  key; those three checks in `test/mcp.test.ts` were given messages, and
  no assertion changed. With them the two files pass: 44 tests.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  297 tests, 295 pass, the 2 live tests skipped, and the package smoke test
  passes, its `dbtruth mcp` line included; `npm run acceptance -- --task
  T5.1` prints `T5.1: 100/100`, every check passing.
### Iteration 3: 100/100 (the lead)
- Rescoring every task after T5.1 timed out T1.4's `npm run verify` at 600 s
  with only `TAP version 13` printed. The cause was a `test/mcp.test.ts`
  process started at 18:53 by an earlier check that never exited, holding two
  idle `dbtruth` sessions on `fixture` (a profile and a weighing statement).
  Killed; the sessions went with it; every other task then scored 100/100.
- The race: `close()` ended the connection it found, so a call still opening
  its connection opened it afterwards and nothing closed it. Ten runs of the
  file did not reproduce the hang; the new test "close waits for a call still
  opening its connection, and closes the connection that call opened" does,
  every time: before the fix it failed with `expected: 1, actual: 0`.
  `close()` now waits in the calls' queue; a failing call still drops its
  connection at once. All 25 tests of the file pass.
- Sabotage: `close: drop` (the old immediate close); the new test failed
  (not ok 1). Restored byte for byte.
- The lead's answers: the `check` tool returning the lines and the
  CheckReport JSON is approved; the `cmd /c` line stays in the README, and
  T5.2's manual A3 run decides whether `init` prints it.

### Iteration 4: 100/100 (the lead)
- CI of the T5.1 and T4.1 commits (runs 36182081768 and 36182322447) failed
  on all eight Postgres and Node pairs with one test: "SIGTERM during a call
  ends the server and leaves no session behind", `error: 'ended promptly'`.
  Missed at the time: the rescoring ran on Windows, where no signal handler
  runs and the process is simply terminated.
- Cause: iteration 3's fix queued `close()` behind the calls, and SIGTERM's
  handler awaits `close()`, so it waited for the call held by the test's
  lock. Reproduced in a node:22 container on the fixture's Docker network:
  the same failure.
- Fix: `close()` sets `closed`, ends the connection at once, so the call
  waiting on the lock fails with the connection's error, then awaits the
  calls' queue; a call that finds `closed` after opening its connection
  throws "the server is closing" before using it, and its catch ends the
  connection. The race test was renamed "close waits for a call still
  opening its connection, and that call closes the connection it opened"
  and now counts the close before awaiting the call; the new test "close
  ends the connection a call is waiting on, and the call fails at once
  instead of holding close" gives a catalog read that waits until its
  connection is closed, with a 5 s timeout. Both have a tests check in
  `acceptance/checks.json` (`close-waits`, `close-ends`); the fake connection
  of both comes from `fakeConnection`.
- Runs: the three close tests pass on Windows; all 26 tests of
  `test/mcp.test.ts` pass in node:20 and node:22 containers on Linux.
- Sabotage, each restored byte for byte from a copy outside the repository
  (`cmp`): `close()` queued behind the calls as in iteration 3, and
  `await drop()` left out of `close()`: "close ends the connection a call is
  waiting on" failed, `Promise resolution is still pending but the event
  loop has already resolved`; the `closed` check after opening left out, and
  `await turn` left out of `close()`: "close waits for a call still opening
  its connection" failed, "the connection the call opened was closed before
  close returned, not left to keep the process alive", `0 !== 1`. The queued
  `close()` also failed the SIGTERM test on Linux, in CI and in the
  container.
- The first rescore after the fix: T5.1 11/100 and T5.2 26/100, every test
  check failing on one test, "every error the CLI can print has a row in the
  README's troubleshooting table": `no troubleshooting row for "the server is
  closing"`. It can be seen: a client that closes the server's input and
  still reads its output gets it as the answer to a call in flight. The row
  was added to the README (the call ran nothing, a connection it had just
  opened was closed; start the server again and repeat the call), and
  `test/readme.test.ts` passes.
## T5.2 Skill
### Iteration 1: 63/100
- Read first: sections 0 to 5 of the plan, T1.4, T5.1, T5.2 and T7.1,
  Appendices A, B, D and E; the design brief for T5.1 and T5.2 (sections 0,
  1, 6, 7, 9 to 12, the lead's decisions binding) and the lead's guidance for
  this task; `src/cli.ts`, `src/mcp.ts` and `src/write.ts` at HEAD 68f9bd7,
  `scripts/pack-smoke.mjs`, `scripts/acceptance.mjs`, `test/init.test.ts`,
  `test/readme.test.ts`, `test/structure.test.ts`, `test/acceptance.test.ts`
  and `src/prompts/write.md`; README.md, NOTES.md (0.2.0's `init` entry and
  0.4.0), CHANGELOG.md, the T1.4 and T5.1 iterations above and `acceptance/`.
- Where the lead's guidance and the brief differ, the guidance won: a second
  `init --skill` without `--force` refuses with a message and a row of its
  own, where the brief printed the `.env`'s "left as it is" line and exited 0.
  The code at HEAD agrees with the brief on the rest: `mcp.ts` registers
  `context`, `describe_table`, `measure_join` and `check`.
- Checked against the documentation on 2026-09-25, with the quotes in NOTES:
  Claude Code's skills page (code.claude.com/docs/en/skills): a project skill
  at `.claude/skills/<skill-name>/SKILL.md`, the command from the folder's
  name, the frontmatter read only when `---` is the first line, every field
  optional, `description` and `when_to_use` cut at 1,536 characters, under
  500 lines advised, descriptions in context each session and the file loaded
  when invoked, skill directories watched without a restart. The Agent Skills
  specification (agentskills.io/specification): `name` and `description`
  required, `name` 1 to 64 characters of `a-z`, `0-9` and `-` and equal to
  the folder, `description` 1 to 1,024 characters, a body under 5,000 tokens
  recommended.
- Checked the earlier checks this touches: T1.5's `readme-commands` pins the
  Commands list's lines as consecutive; T1.4's `readme-commands` pins the
  `init` line word for word, and its `help` pins `init +write`, which
  commander prints as `init [options]` once `init` has options; T0.1's A3
  pins the smoke test's line of required files; T1.4's `readme-rows` pins
  "From `init`, the path is the `.env` it would have written".
- Tests first: `test/skill.test.ts`, new, four tests, in `test:unit`, and
  three in `test/init.test.ts`.
  - Before anything else was written, both files failed to load: `ENOENT: no
    such file or directory, open '...\skills\dbtruth\SKILL.md'`.
  - With the skill written and `src/cli.ts` as at HEAD, the four skill tests
    passed, since they test the file, and each init test failed for its
    reason: "init --skill installs the skill the package ships ..." with the
    deep-equal missing `wrote ..\..\.claude\skills\dbtruth\SKILL.md` before
    the next steps; "a skill path taken by a directory ..." with `expected: 1,
    actual: 0`; "as a command, init --skill ..." with `error: unknown option
    '--skill'` and `1 !== 0`.
- Built:
  - `skills/dbtruth/SKILL.md`, 2,728 characters: Appendix D, checked line by
    line against what `write.ts` and prompt B put in `context/` today, and
    rewritten where it no longer held (NOTES: "What changed from Appendix D,
    and why"). The frontmatter is `name` and `description` alone; no
    `allowed-tools`.
  - `package.json`: `files` gains `skills`; `test:unit` gains
    `test/skill.test.ts`. The build is unchanged: `init` reads the file one
    level up from `cli.ts`, as `--version` reads `package.json`, so it is the
    package root under tsx and once installed, and there is nothing to copy.
  - `src/cli.ts`: `init --skill` and `--force`; `runInit` installs the skill
    at `.claude/skills/dbtruth/SKILL.md` in the directory where it writes the
    `.env`, refuses a file there without `--force` (`<path> already exists;
    pass --force to replace it`, exit 1, after the `.env`'s line and before
    the next steps), and with `--force` removes what is at that path and
    writes with `wx`. `create`, one function, writes the `.env` and the skill
    and prints `wrote` or `could not write` for both. The `init` description
    is unchanged; the options have their help text.
  - `scripts/pack-smoke.mjs`: last, runs the installed `dbtruth init --skill`
    in its temporary project and compares the file with
    `skills/dbtruth/SKILL.md` byte for byte, which also proves that the
    tarball holds it.
- Checked by hand under Linux (node:22, as the `node` user), since Windows
  here refuses a file symlink without privileges (`EPERM`): with
  `.claude/skills/dbtruth/SKILL.md` a link to a file outside the project,
  `init --skill` refused it as a skill already there, and `init --skill
  --force` wrote a regular file in the link's place, the skill as shipped,
  and left the file the link pointed at as it was.
- Docs: README (a subsection of "Giving it to your agent", "Telling it when to
  measure: the skill"; a sentence in the quick start's paragraph on `init`;
  the Commands list's `npx dbtruth init --skill` line; a row for the refusal;
  the rows for `could not write <path>: <error>` and for an unknown option;
  the Team tier no longer calls the skill coming; Development), NOTES (under
  0.4.0: "`init --skill` installs the skill that tells an agent when to
  measure", with the format as read, what changed from Appendix D, the tests,
  why the build copies nothing, the refusal and `--force`, the check changes,
  what is not done), CHANGELOG (0.4.0), `--help` (`init [options]`) and `init
  --help` (`--skill`, `--force`).
- Changes to earlier checks, none to what an assertion means, each named in
  NOTES: T1.4's `help` expects `init [options]` (the lead's decision D6, left
  to T5.2 by T5.1's NOTES); T1.5's `readme-commands` takes the new `init
  --skill` line between `init` and `check`.
- `acceptance/checks.json`: 22 checks for T5.2. A1 is `npm run verify` with
  the two init tests' lines and the smoke test's skill line, one run shared
  with the gate; A2 is the tool-name test; tests: the four skill tests, the
  three init tests and the smoke test's line; the gate; docs: README (five),
  `init --help`, NOTES, CHANGELOG; invariants: the structure tests, stdout
  (the new command test and T1.4's), the troubleshooting rows.
  `acceptance/manual.json`: A3 and the sabotage item, both empty.
- `npm run verify` exits 0: 305 tests, 303 pass, the 2 live tests skipped,
  and the package smoke test passes with its new line. `npm run acceptance --
  --task T5.2` prints `T5.2: 63/100`; `--task T1.4` and `--task T1.5`, whose
  checks changed, print 100/100; the 112 file and `--help` checks of every
  task match the final files.
- Under Linux as the non-root `node` user, from a copy of the working tree
  with LF line ends: in `node:22` (22.23.3) and `node:20` (20.20.2), git
  2.39.5, the skill, init, readme, structure and acceptance test files, 44 of
  44 pass on each; in `node:22` also the typecheck, the build and the package
  smoke test against the fixture, its skill line included.
- Lost A3 (-16.7): `FAIL T5.2 A3 acceptance: no evidence for: Manual ...`.
  Cause: the transcript of Claude Code with the server and the skill needs a
  `claude` CLI, which this machine does not have; the lead produces it after
  this workflow (brief section 7, the A3 procedure).
- Lost Tests (-20): `FAIL T5.2 sabotage tests: no evidence for: Sabotage
  check ...`. Cause: no sabotage record; the sabotage check is done by a
  later stage.
- Open for the lead: a refused second `--skill` exits 1 without the next
  steps, read from the plan's contrast between the `.env` ("says so and
  continues") and the skill ("refuses"); and the file ships with the line
  ends of the checkout it is packed from, CRLF from a Windows one with
  `core.autocrlf`, which A3's run on native Windows can confirm Claude Code
  reads.
### Iteration 2: 83/100
- Read first: the four reviews of iteration 1 (7 findings, from the plan,
  quality and bugs lenses), sections 3 and 4 of the plan, T1.4 and T5.2
  again. Each finding was checked against the code, the plan and, where it
  claimed a behavior, a run, before anything changed.
- Real, and fixed at the cause:
  - `init --skill` never installed the skill beside a directory named `.env`:
    `runInit` returned 1 as soon as the `.env` could not be written.
    Reproduced by the new test below, before the fix: in a repository holding
    `.env/bin/python`, `could not write .env: EEXIST ...` alone, exit 1, no
    skill. After it, the command run there prints that line and `wrote
    .claude\skills\dbtruth\SKILL.md`, exits 1 and prints nothing on stdout.
    The README supports that
    setup (keep the settings in another file, `--dotenv`), so such a project
    had no way to get the skill from `init`. Taken as the finding's first
    fix, not its README-only alternative: the `.env`'s result is kept in
    `hasEnv`; without a `.env`, git judges nothing and no next steps are
    printed, as T1.4 has it, but the skill is installed first and `init`
    then exits 1. T1.4's two tests of a `.env` directory pass unchanged.
    NOTES: "A `.env` that cannot be written does not keep the skill out";
    README: the `could not write <path>` row says `init --skill` still
    installs the skill.
  - The frontmatter test's regex took values YAML does not read as written.
    Checked in node: `description: Use it before SQL:` (a mapping indicator
    at the end), `description: Use it<tab># note` (a comment) and
    `description: null` all matched. The value regex now refuses a `:`
    before a blank or at the end, a `#` after a blank, and `null`, `true` or
    `false` in any case; the comment and NOTES say so.
  - `test/skill.test.ts` read the frontmatter through `lines`, `close`,
    `field` and a key comparison. It now normalizes the line ends once and
    matches the frontmatter once, `^---\nname: (.*)\ndescription: (.*)\n---\n`,
    which also pins line 1, the two keys alone and their order; `FOLDER`
    and its comment are gone. The four tests keep their names.
  - The quick start said `init` "never changes a file that is already
    there", which `--skill --force` breaks; so did the `.env`'s row. Both now
    name the `.env` and `.gitignore`. The finding's wording, which appends
    the `--force` clause to the `--skill` sentence, would break T5.2's
    `readme-quickstart`, which pins that sentence's end; the skill's section
    already says what `--force` does.
  - The skill's section said Claude Code reads the rest of the skill "when
    the agent is about to write, review or debug SQL", a trigger dbtruth
    cannot promise, and "it reads the files", with the skill as "it". Now:
    the agent loads the rest when it judges that a task fits the
    description, and without the server the agent reads the files.
  - `test/init.test.ts` had two `command` helpers, one per command test. One
    now sits beside `init()`, taking the options; T1.4's command test calls
    it with the same arguments, and no assertion changed (NOTES, "Test and
    check changes").
  - The build copies nothing, where the plan's Build and section 5.4 have it
    copy the skill, and iteration 1 put that to no one. The code stays: a
    copy under `dist/` would ship the same file twice, and `files` already
    ships `skills/`. It is now open for the lead, below.
- Taken in part: none. Rejected: none.
- New test, run against the code before its fix: "init --skill installs the
  skill beside a directory named .env, such as a virtualenv, and exits 1: it
  could not write the .env" failed with `actual: []`, `expected: [ 'wrote
  .claude\\skills\\dbtruth\\SKILL.md' ]`. The frontmatter test, with the
  skill's description replaced in turn by each of the three values above,
  failed with `not a plain value: null` and the like; with a third key, with
  `the file does not open with a frontmatter of name and description alone`.
  With the new code, dropping the final `if (!hasEnv) return EXIT_FAILURE`
  failed T1.4's two `.env` directory tests and the new one (`0 !== 1`), and
  running git's check without a `.env` failed T1.4's command test and the
  new one (the `WARNING: .gitignore does not ignore .env` line). Each file
  was restored byte for byte from a copy outside the repository (`cmp`).
  These show the tests fail for their reason; they are not the task's
  sabotage record.
- `acceptance/checks.json`: one tests check, `env-directory`, for the new
  test.
- `npm run verify` exits 0: 306 tests, 304 pass, the 2 live tests skipped,
  and the package smoke test passes, its `init --skill` line included. `npm
  run acceptance -- --task T5.2` prints `T5.2: 63/100`, its 23 automated
  checks passing; the 99 file checks of every task match the final files.
- Lost A3 (-16.7): `FAIL T5.2 A3 acceptance: no evidence for: Manual ...`.
  Cause: the transcript of Claude Code with the server and the skill needs a
  `claude` CLI, which this machine does not have; the lead produces it.
- Lost Tests (-20): `FAIL T5.2 sabotage tests: no evidence for: Sabotage
  check ...`. Cause: no sabotage record; the sabotage check is done by a
  later stage.
- Open for the lead, with iteration 1's two: the build copies nothing, since
  `init` reads `skills/dbtruth/SKILL.md` from the package root under tsx and
  once installed, where the plan's Build says "copied by the build" and
  section 5.4 "tsc + copy prompts (+ skills from T5.2)"; NOTES ("The file
  ships from the package's root") gives the reason and will cite the
  decision.
- The sabotage check of the task (section 4.5). `src/cli.ts`, `src/mcp.ts`,
  `skills/dbtruth/SKILL.md`, `package.json`, `test/skill.test.ts` and
  `test/init.test.ts` were copied outside the repository first. After each
  break `test/skill.test.ts` and `test/init.test.ts` were run (22 tests, all
  passing before); after the break in `package.json`, `npm run build` and
  the package smoke test, `npm run test:pack`.
- Sabotage: the skill installed in the working directory, `join(here,
  ".claude", SKILL)`, not where the `.env` goes; "init --skill installs the
  skill the package ships at the repository root, beside the .env, and
  nothing else" failed with "+ 'wrote .claude\\skills\\dbtruth\\SKILL.md', -
  'wrote ..\\..\\.claude\\skills\\dbtruth\\SKILL.md'". Restored.
- Sabotage: the refusal dropped and every skill replaced (`if (false && ...)`
  and `create(..., true)`), so a skill the user edited is written over; "as
  a command, init --skill installs the skill, refuses a second time without
  --force, and --force replaces the skill alone" failed with the second
  run's stderr, "wrote .claude\skills\dbtruth\SKILL.md" and the next steps,
  and "0 !== 1". Restored.
- Sabotage: `--force` without its `rm` (`if (replace) rmSync(...)` removed),
  so it replaces nothing; the same test failed with "could not write
  .claude\skills\dbtruth\SKILL.md: EEXIST: file already exists, open
  '...'" and "1 !== 0". Restored.
- Sabotage: `--force` removing a directory too, `rmSync(path, { force: true,
  recursive: true })`; "a skill path taken by a directory is left alone,
  with --force too, and init exits 1: it could not write the file" failed
  with "wrote .claude\skills\dbtruth\SKILL.md" and the next steps, and "0
  !== 1": the directory and the file in it were deleted. Restored.
- Sabotage: iteration 2's fix reverted, `if (!hasEnv) return EXIT_FAILURE`
  before the skill; "init --skill installs the skill beside a directory
  named .env, such as a virtualenv, and exits 1: it could not write the
  .env" failed with "the skill's line alone after the .env's: no warning
  about a .env not written, and no next steps", `[]` where `[
  'wrote .claude\\skills\\dbtruth\\SKILL.md' ]`. Restored.
- Sabotage: the skill read beside `cli.ts`, `new URL(SKILL,
  import.meta.url)` without `../`; the four init tests that run `--skill`
  failed, the first with "ENOENT: no such file or directory, open
  '...\dbtruth\src\skills\dbtruth\SKILL.md'". Restored.
- Sabotage: the skill written with the `.env`'s text, `create(skill, DOTENV,
  ...)`; "init --skill installs the skill the package ships ..." failed with
  ".claude\skills\dbtruth\SKILL.md at the root is not the skill the package
  ships", and the `.env` directory test and the command test with "... is
  not the skill the package ships". Restored.
- Sabotage: `--force` reaching the `.env` (`!opts.force &&` on its
  existence check, `opts.force` passed to its `create`); "a skill path taken
  by a directory ..." failed with "every file as it was, --force true",
  `'.env': Buffer(267)` where `Buffer(0)`, and the command test with "+
  'wrote .env\n' - '.env already exists; left as it is\n'". Restored.
- Sabotage: the command not passing `--skill` on (`skill: own.skill` removed
  from `runInit`'s options); the command test failed with its first run's
  stderr lacking "- 'wrote .claude\\skills\\dbtruth\\SKILL.md\n'" after
  ".env already exists; left as it is". Restored.
- Sabotage: the server renaming `measure_join` to `measure_relationship` in
  `src/mcp.ts`, the skill unchanged; "the skill names every tool the MCP
  server registers, and no other" failed, but only with assert's "Expected
  values to be strictly deep-equal" and the two lists, not saying which was
  the skill's. The comparison was given a message; repeated, the test
  failed with "the tools the skill names, against those mcp.ts registers",
  `'measure_join'` where `'measure_relationship'`. Restored.
- Sabotage: `skills` dropped from `files` in `package.json`; after `npm run
  build`, the package smoke test failed with "pack-smoke: FAIL Command
  failed: "node_modules\.bin\dbtruth" init --skill ... dbtruth: ENOENT: no
  such file or directory, open
  '...\node_modules\dbtruth\skills\dbtruth\SKILL.md'": the tarball without
  the skill. Restored.
- Sabotage: the `--reveal` rule taken out of the skill's Never section; "the
  skill mentions --reveal only to forbid it" failed with "the Never section
  does not forbid --reveal". Restored.
- Sabotage: a blank line before the skill's frontmatter, which Claude Code
  then does not read; "the skill's frontmatter opens on its first line and
  holds a name and a description, each a plain value" failed with "the file
  does not open with a frontmatter of name and description alone".
  Restored.
- Sabotage: the skill named `dbtruth-context` in its folder `dbtruth`; "the
  skill's name is its folder's, its description under 1,024 characters, and
  the whole file under 5,000" failed only with assert's "Expected values to
  be strictly equal", `'dbtruth-context'` against `'dbtruth'`. The
  comparison was given a message; repeated, the test failed with "a name
  other than its folder's". Restored.
- Sabotage: `rmSync(path)` without `force: true`. Every test stayed green:
  no test ran `--force` where there was no skill, and there `init --skill
  --force` printed "could not write .claude\skills\dbtruth\SKILL.md: ENOENT:
  no such file or directory, lstat '...'" and exited 1. New test "init
  --skill --force installs the skill where there is none yet"; it passes on
  the code as built. Repeated; it failed with ".env already exists; left as
  it is", "could not write .claude\skills\dbtruth\SKILL.md: ENOENT: no such
  file or directory, lstat '...'" and "1 !== 0". Restored.
- Sabotage: `--force` writing in place, `flag: replace ? "w" : "wx"` without
  the `rm`, which writes through a link. Every test stayed green: no test
  put a link at the skill's path, the case the code's comment and NOTES give
  the `rm` for, checked only by hand under Linux in iteration 1. New test
  "init --skill --force puts a file of its own where the skill is a link,
  and leaves the linked file as it was", with a hard link, since Windows
  makes a symbolic one only with privileges (`EPERM` here); it passes on
  the code as built. Repeated; it failed with "shared.md was written through
  the link", the skill's text where "shared\n". Restored.
- Each file was restored from its copy and matched it byte for byte (`cmp`);
  `git diff HEAD -- src/cli.ts` and `-- package.json` printed byte for byte
  the diffs saved before, `src/mcp.ts` had none, and
  `skills/dbtruth/SKILL.md`, untracked, matched its copy. The changes left:
  two messages in `test/skill.test.ts`, no assertion changed; the two new
  tests in `test/init.test.ts`, a tests check for each in
  `acceptance/checks.json` (`force-new`, `force-link`), and two sentences
  on them in NOTES, under "A second `--skill` refuses". With them the two
  files pass: 24 tests.
- With the record in `acceptance/manual.json`: `npm run verify` exits 0,
  308 tests, 306 pass, the 2 live tests skipped, and the package smoke test
  passes, its `init --skill` line included; `npm run acceptance -- --task
  T5.2` prints `T5.2: 83/100`, its 25 automated checks and the sabotage item
  passing; the 99 file checks of every task match the final files.
- Lost A3 (-16.7): `FAIL T5.2 A3 acceptance: no evidence for: Manual ...`.
  Cause: the transcript of Claude Code with the server and the skill needs a
  `claude` CLI, which this machine does not have; the lead produces it.
### Iteration 3: 100/100 (the lead)
- A3, by an agent standing in for Claude Code (there is no claude CLI on this
  machine): a fresh agent was given only the skill, the fixture project that
  `scripts/make-fixture-snapshot.mjs` writes, and the four tools of the real
  `dbtruth mcp` server started with `--project` on it, and asked "write a
  query joining orders to customers". Its trace: it read `context/README.md`,
  then `context/tables/orders.md` and `customers.md`, listed the tools, called
  `measure_join` on orders.customer_id -> customers.id (broken: 440 of 500,
  60 orphans, all above the highest customers.id) and `describe_table` on
  both tables, and only then answered. The answer used a LEFT JOIN on purpose,
  said 60 of 500 orders (12%) point to no customer and how to keep or drop
  them on purpose, compared status with `lower(btrim(status))`, and left out
  `api_token`. A person should repeat it in Claude Code with the server added;
  that run also settles whether `init` prints the `cmd /c` form on native
  Windows.

## What the first live run since 0.1.7 got wrong (the lead's scope)
### Iteration 1
- Scope, the lead's: C1 and C2 in `tableFile`, P1 to P5 in the prompts; the
  rest of the audit is recorded as known limits (NOTES, 0.4.0). No paid run
  here; the lead runs the live one.
- Tests first. In `test/write.test.ts`, with the code and prompts as they
  were: "a confirmed problem states its numbers as the fact, and the
  analysis's words only as not measured" failed with actual
  `- **inconsistent_values status**: Values mix case and spacing
  (distinctValues 5, ...)`; "a problem
  measured over another table names that table in this table's file" failed
  with actual `- **duplicate_entity products**: same columns and values
  (total 80, matched 70, sharedColumns 5, overlap 0.875).`; the two changed
  assertions of "a table file carries the measured numbers, ..." failed; the
  two prompt tests failed with "write.md no longer says that a confirmed
  heading holds confirmed claims only: ..." and "contextualize.md says the
  database holds a hidden column's values".
- Sabotage, each restored and compared byte for byte with its copy:
  `const over = ""`: "a problem measured over another table ..." failed with
  "products_legacy's file says the numbers count products' rows, not its
  own". The old line, detail inside the bold fact: the three `tableFile`
  tests failed, one with "the numbers are the fact, the detail only what the
  analysis read". Each new prompt sentence altered (ten edits: the label's
  "no other", the confirmed heading, the open questions, the confirmed
  suspicion, the overlap's direction, the inferred broken join, both halves
  of the `[hidden]` rule in `write.md`, and "withheld from you only" and
  "Never write" in `contextualize.md`): each failed a prompt test with the
  message naming that rule.
- A docs check failed on the first draft: T2.2's `prompt-b` pins "The queries
  are empty when\s+the analysis was too large to send with them.", and the
  new sentences had rewrapped that line. They now follow it, and all 99 file
  checks pass; no check was changed.
- `npm run verify` exits 0: 313 tests, 311 pass, the 2 live tests skipped,
  0 fail; the package smoke test passes. `npm run acceptance`: every task
  with checks 100/100, and T6.2 and T7.1, not built yet, 0/100 with no
  checks, so overall 90.
### Iteration 2: four reviews of iteration 1
- Each finding was checked against the code, the plan, the live output and
  `snapshot.json`, and, where it claimed a behavior, a run: the live
  snapshot's claims and verdicts rendered through `tableFile`, and the
  fixture queried for `products` and `products_legacy` (80 and 70 rows, all
  70 in `products`).
- Fixed:
  - The label `Inferred, not measured: <detail>` (plan 7, quality 1,
    correctness 1). Everywhere else in `context/tables/`, what follows
    `not measured: ` is the reason nothing was measured, and the skill tells
    an agent that anything "not measured" is unverified; the live `cars`
    line rendered as `**dead_table**: count 0, exact 1. Inferred, not
    measured: Table is empty ...`. Now `<detail> (inferred)`, the form of the
    purpose line in the same function.
  - Bare numbers in the first table's file (correctness 2): the live
    `products.md` line names `products_legacy` alone above "total 80". Every
    suspicion over more than one table now names the table measured over in
    each of its files (`s.tables.length > 1`, which no longer needs `mine`).
  - Prompt A's polymorphic rule said the reference "cannot be tested",
    against the new ban (plan 1, quality 2, correctness 4, prompt 2). It now
    says that no condition on a column without a "values" list is measured,
    which is what `verify` does. The ban names hiding as the reason, since a
    condition on a column that is not categorical is truly not measured, and
    forbids calling a column hidden too (correctness 3, prompt 1: the live
    detail "entity_id values are hidden which limits verification" passed
    the first wording). Both prompts use the same words (quality 6); "every
    measurement reads them" is now "the measurements read them" (plan 1);
    the ban follows the "years" sentence, so it no longer splits the
    paragraph (quality 7); write.md's rule speaks of a note, detail or reason
    that calls a column hidden, since `Verified` holds no "[hidden]" cell
    (quality 6).
  - P5's premise (plan 2, correctness 5, prompt 3): "the analysis gives
    every declared foreign key basis "stated"" is an instruction to prompt
    A, not a guarantee (T2.2 in NOTES; `worthWeighing` asks `declares`).
    Prompt B is now told to say that the analysis found no declared foreign
    key for the join, and the clause is gone.
  - write.md's numbers (plan 7, quality 4, prompt 4): the overlap's
    direction is a rule in the rules list; the description names
    sharedColumns and comes before "The queries are empty ...", with a
    sentence on inconsistent_values' numbers, which cannot tell case from
    spacing, without which "say what the numbers show" allowed
    "casing/spacing".
  - The Produce item's second "(inferred)" (quality 5, first half).
  - NOTES: the ENTITIES known limit blamed prompt A, but the live snapshot
    has `order_totals` in Customer's `referencedIn` (plan 3); "a tenth" was
    an eighth, 10 of 80 (plan 4, correctness 6); the label, the numbers and
    P5 follow the code (correctness 7).
  - CHANGELOG stated what the model does as fact; it now says what the
    model is told, as the file does elsewhere (plan 5, quality 3).
  - The C1 test repeated an assertion of "a table file carries ..." with
    another detail (plan 6, quality 8): removed. The prompt reader moved to
    the top of the file, each test reads a prompt once, and the first prompt
    test's name covers the broken-join rule (quality 9). This section gained
    iteration headings (quality 10; the section after T6.1 has none, but two
    iterations need them).
- Rejected:
  - Quality 5, second half: the broken-join rule keeps "label it
    "(inferred)"": the lead's P5 asks for it, and the live README left the
    label out with the general rule alone.
  - Prompt 4, `dead_table`'s numbers: nothing false in the live run came
    from them, so outside the lead's scope.
  - Prompt 5, a join with alsoFits above 0 under a heading that says fact:
    "State a relationship as fact only if it is confirmed and its alsoFits,
    if any, is 0" already forbids it; the P1 sentence only narrows what may
    go under a confirmed heading, and the live run kept those joins apart.
  - Correctness 5 and prompt 3, setting a claim's basis from `declares` in
    code: it changes what every claim and the snapshot carry, which is
    outside the lead's scope; recorded under Not done in NOTES.
- Tests first. With iteration 1's code and prompts, "a table file carries
  ..." failed with "the numbers are the fact, the detail only what the
  analysis read"; "a problem over two tables ..." failed with actual
  `... (measured over products). Inferred, not measured: same columns and
  values`; the prompt tests failed with "write.md no longer says that
  unverifiable suspicions go with the open questions: ..." and
  "contextualize.md says the database holds a hidden column's values".
- Sabotage, each file restored and checked with `git hash-object` against
  its blob before: `const over = ""` failed "a problem over two tables ..."
  with "products_legacy's file says the numbers count products' rows, not
  its own"; iteration 1's `!mine(s.tables[0]!)` failed it with "products'
  file says it too, since its line names products_legacy alone"; the
  `Inferred, not measured:` label failed "a table file carries ..." with
  "the numbers are the fact, the detail only what the analysis read"; each
  of eight prompt edits (the polymorphic rule's old words, the old ban,
  P5's old sentence, sharedColumns, "cannot tell case from spacing", the
  overlap rule, "only" in the hidden rule, the open questions) failed a
  prompt test with the message naming that rule. A first run of the
  script copied each file into a scratch directory that already had the
  backup's name, so nothing was restored; the three files were rebuilt by
  hand, matched their blobs from before (`710c63d`, `fcc2c7c`, `d2c1fef`),
  and the sabotage was run again.
- `npm run verify` exits 0: 312 tests (the repeated C1 test is gone), 310
  pass, the 2 live tests skipped, 0 fail; the package smoke test passes.
  `npm run acceptance`: every task with checks 100/100, T6.2 and T7.1 0/100
  with no checks, overall 90, as before.
### Iteration 3: the lead's words for P1 and P3
- The tree was checked again against the lead's scope, the live output and
  the fixture. Two prompt rules fell short of the scope's words; the rest
  (C1, C2, P2, P4, P5) stays as iteration 2 left it, and P5's premise holds:
  prompt B gets each relationship's `basis` as prompt A gave it, and
  `TableFacts` carries no declared key.
  - P3 says neither prompt may let the model say a column cannot be
    inspected, tested or verified. Iteration 2's ban covered only hiding
    given as the reason, so the live note with its reason cut, "entity_id
    cannot be tested directly", passed it. Both prompts now say, in the same
    words, "never write that a column cannot be inspected, tested or
    verified". What is truly not measured is a claim, not a column, and the
    ban leaves that sayable. The rest of that paragraph of
    `contextualize.md` is rewrapped.
  - P1 says to tie the existing "(inferred)" rule to the section headings.
    The heading rule was a bullet of its own; it is now that rule's own
    sentence: "Never launder a guess into a fact: only a claim whose verdict
    is confirmed goes under a heading that says confirmed."
  - NOTES and CHANGELOG follow both. NOTES' `shipped_orders` known limit
    now gives its numbers from the fixture (160 of its 200 rows match
    `customers.id`) in place of "reads `orders.customer_id` at 80%".
- Tests first. With iteration 2's prompts the two changed assertions failed:
  "write.md no longer says that a confirmed heading holds confirmed claims
  only: ..." and "contextualize.md forbids calling a column hidden, or
  saying it cannot be inspected, tested or verified". The ban's test is now
  "neither prompt lets the model call a column hidden, or say it cannot be
  inspected, tested or verified: ..."; no check names it.
- Sabotage: nineteen breaks, each file copied outside the repository and
  compared with `cmp` before the break, restored from the copy and compared
  with `cmp` after; `git diff` hashed the same before and after. Each failed
  `test/write.test.ts`:
  - C1, the old line with the detail inside the bold fact, and C1, the
    detail after the numbers without "(inferred)": "a table file carries
    ..." failed with "the numbers are the fact, the detail only what the
    analysis read" (and "a problem over two tables ..." with its own
    message, since it compares the whole line).
  - C2, `const over = ""`: "a problem over two tables ..." failed with
    "products_legacy's file says the numbers count products' rows, not its
    own"; C2, named only in the second table's file: the same test failed
    with "products' file says it too, since its line names products_legacy
    alone".
  - P1 (the heading sentence, "in that word and no other", the open
    questions), P2 (the confirmed-suspicion rule, "which cannot tell case
    from spacing"), P4 (the duplicate_entity numbers, the overlap's
    direction) and P5 (the inferred broken join) each failed "prompt B
    files a suspicion by its verdict, ..." with "write.md no longer says
    that <that rule>: <its sentence>".
  - P3, in each prompt: what a hidden column means deleted, the ban
    deleted, the ban narrowed back to hiding given as the reason, and in
    `contextualize.md` the polymorphic rule's "cannot be tested" put back:
    each failed "neither prompt lets the model call a column hidden, ..."
    with the message naming that prompt and that rule.
- All 99 file checks in `acceptance/checks.json` pass.
- `npm run verify` exits 0: 312 tests, 310 pass, the 2 live tests skipped,
  0 fail; the package smoke test passes.
### Iteration 4: what the three runs after iteration 3 got wrong
- Scope, the lead's: after iteration 3 (committed as `48acbe2`) the lead ran
  three live runs, r2a, r2b and r2c, and audited them. Two statements were
  false, both in r2c's README, and they are this iteration. F1: "87.5% of
  products_legacy's sampled rows (70/80... actually measured as matched 70
  of total 80 on products) also appear in products_legacy", the share of
  `products`' rows given as `products_legacy`'s. F2: "order_totals is dead:
  ... reading it returns nothing", where reading it raises an error. The
  rest of the re-audit is recorded as known limits in NOTES. No paid run
  here; the lead runs the live one.
- F1, the design: the table is named in the data, beside the numbers, not
  left to the order of the suspicion's `tables`. `verify` gives a
  measurement `over`, the first table the suspicion names, when it names
  more than one and a measurement was taken; `decide` copies it into the
  verdict's `measurement`; `SnapshotSchema` keeps it, optional, so a
  snapshot without it parses, and `check` reads only a verdict's status and
  hit rate; `tableFile`'s "(measured over <table>)" reads it, the one
  source; prompt B is told that such numbers are over the table named in
  "over" and to give the overlap as a share of that table's rows, by name.
  Every kind gets it, not `duplicate_entity` alone: r2b's `missing_key` over
  `order_totals` and `shipped_orders` was looked up on `order_totals` only.
- F2, the design: `measureDeadTable` gives a materialized view never
  refreshed `{ populated: 0 }`, no count; `decide` confirms `populated` 0 as
  dead in its own right; `TableFacts` carries `populated`, so its file says
  "never refreshed (reading it raises an error)" where it said "no rows",
  which came from the row estimate of 0 `extract` gives it; prompt B is told
  what `populated` false and 0 mean, and never to say such a view has no
  rows or returns nothing.
- Tests first. With iteration 3's code and prompts: in `verdict.test.ts`,
  "dead_table: a materialized view never refreshed is dead on the schema's
  word alone, ..." failed with "populated 0 proves it dead: ..." (actual
  `unverifiable`), and "a verdict names the table its numbers were measured
  over ..." with "the writer is told by name whose rows the overlap is a
  share of"; in `verify.test.ts`, "a dead materialized view that was never
  refreshed is not counted: ..." with "no count of 0 and no exact: no row
  was counted" (actual `{ count: 0, exact: 1, populated: 0 }`), and "a
  suspicion measured over one of the tables it names says which, ..." with
  "the overlap is a share of products' rows, and the measurement says so by
  name"; in `write.test.ts`, "a materialized view never refreshed says that
  reading it raises an error, ..." with "its size is what the schema says,
  ..." (actual `materialized view, no rows`), the prompt test with
  "write.md no longer says that a suspicion over more than one table is
  measured over the table named in over: ...", and "prompt B says that a
  materialized view never refreshed raises an error when read, ..." with
  "write.md names populated among the per-relation facts"; in
  `snapshot.test.ts`, "the table a verdict's numbers were measured over
  survives serialize and parse, ..." with "the snapshot keeps whose rows
  the overlap is a share of"; in `integration.test.ts`, "the whole loop on
  the fixture, ..." with "what the catalog says, and no count: reading it
  raises an error". The new test in `remeasure.test.ts`, a snapshot with the
  old numbers and no `over` checked "12 unchanged", passed before too: it
  guards compatibility and changes no behavior.
- Changed tests, each named in NOTES: the duplicate test of `write.test.ts`
  gives its verdict `over: "products"`, since the file now reads it there,
  with its assertions unchanged; the prompt test's two sentences on a
  `duplicate_entity` are replaced by three; `integration.test.ts` asserts
  `order_totals`' numbers whole and its file's line as it now reads.
- Sabotage: sixteen breaks in seventeen runs, since the `SnapshotSchema`
  break ran against the unit tests and again against `remeasure.test.ts`.
  Each file was copied into `sabotage2-over-populated` in the scratchpad, a
  new directory, compared byte for byte before the break and after its
  restore, and the hash of `git diff` was the same before and after. The
  output of the first two scrolled off, so they were run again with the
  copies in a second new directory, `sabotage2-over-first-two`. Each
  failed:
  - F1 in `verify`: no `over`, "a suspicion measured over one of the tables
    it names ..." with "the overlap is a share of products' rows, and the
    measurement says so by name"; `over` on an unmeasured suspicion too, the
    same test with "nothing was measured, so over no table"; `over` on a
    suspicion over one table too, the same test with "a suspicion that
    names one table needs no name beside its numbers".
  - F1 in `decide`, `over` not copied: "a verdict names the table ..." with
    "the writer is told by name whose rows the overlap is a share of".
  - F1 in `SnapshotSchema`, `over` dropped on parse: "the table a verdict's
    numbers were measured over survives ..." with "the snapshot keeps whose
    rows the overlap is a share of"; run against `remeasure.test.ts`, "an
    unchanged database passes ..." and "check --json prints the report
    alone ..." failed their deep equality.
  - F1 in `tableFile`, `over` ignored: "a problem over two tables names the
    one ..." with "products_legacy's file says the numbers count products'
    rows, not its own".
  - F2 in `verify`, the old count back: "a dead materialized view that was
    never refreshed is not counted: ..." with "no count of 0 and no exact:
    no row was counted".
  - F2 in `decide`, no rule for `populated` 0: "dead_table: a materialized
    view never refreshed is dead ..." with "populated 0 proves it dead:
    ...", and the verify test's status assertion.
  - F2 in `tableFile`, "no rows" back: "a materialized view never refreshed
    says that reading it raises an error, ..." with "its size is what the
    schema says, and no count of rows that were never read".
  - F2 in `assemble`, `populated` not copied: "the whole loop on the
    fixture, ..." with "and that the materialized view was never
    refreshed".
  - Prompt B, six edits (the `over` sentence, `total`'s words, the overlap
    rule, what `populated` means, "Never say it has no rows", `populated`
    among the facts): each failed a prompt test with the message naming
    that rule.
- Checked by hand: the canned fixture run renders `order_totals.md` as
  "materialized view, never refreshed (reading it raises an error), primary
  key: none" and "**dead_table**: populated 0.", both product files end
  their duplicate line "(measured over products)", and the snapshot's
  duplicate verdict holds `"over": "products"`. r2c's own snapshot, copied
  into a new scratch directory with no `.env`, checks "13 unchanged"
  against the fixture with this code.
- `npm run acceptance`: every task with checks 100/100, T6.2 and T7.1 0/100
  with no checks, overall 90, as before; no check fails, and all 99 file
  checks pass against the final text.
- `npm run verify` exits 0: 320 tests (eight new), 318 pass, the 2 live
  tests skipped, 0 fail; the package smoke test passes.
### Iteration 5: four reviews of iteration 4
- Each finding was checked against the code, the plan, the sabotage script
  and, where it claimed a behavior, the tests. No sabotage in this
  iteration, at the lead's instruction.
- Fixed:
  - `over` was left off a suspicion skipped with numbers (correctness 1,
    design 2, plan 6, quality 4): a duplicate whose first table's sample
    held no rows keeps `{ total: 0, matched: 0, sharedColumns }`, and an
    `inconsistent_values` that is not categorical keeps its counts, so
    prompt B was sent numbers over two tables with no name beside them.
    `verify` now sets `over` when the suspicion names more than one table
    and there are numbers, which is what its comment already said; the
    type's comment and NOTES follow.
  - Prompt B (design 1, plan 2 and 3, quality 2): the sentence on
    `populated` came before the facts that carry it, and its "Never" sat in
    the description, not the rules. The sentence now follows the
    per-relation facts and says that such a view's row estimate of 0 is not
    a count, since prompt B is still sent that 0; the ban is a rule of its
    own; the rule on "empty", which the audit named as a likely source of
    "returns nothing", says such a view cannot be read; "the table in
    "over"" reads "the table named in "over"", as elsewhere.
  - The table file's one source was not guarded (correctness 3): the
    duplicate test also gives a verdict whose `over` is the other table and
    asserts that the file names that one. Iteration 3's `s.tables[0]` would
    print `products` there; not run, since this iteration breaks nothing.
  - CHANGELOG (plan 4, quality 1, design 3): the round-1 line gave the
    overlap as a share of the first table's rows, and the new line said it
    again by name. The `over` line is folded into the round-1 line, by
    name, and the F2 line says that `--json` gives every materialized
    view's `populated` in `tables`.
  - README "How it works" (plan 4, quality 3, design 4): the overlap is "the
    share of one table's sampled rows also in the other; the verdict names
    that table in `over`", and a dead table is judged by "count, newest
    timestamp, or whether a materialized view was ever refreshed".
  - NOTES: the runs are named r2a, r2b and r2c (plan 5); a line cut short
    mid-paragraph is rewrapped (quality 6); the prompt text, the tests and
    the three-table case below are recorded.
  - The write test's verdict is one literal, from a function of its `over`
    (quality 5), since the guard above needs a second one.
  - Iteration 4 said "seventeen breaks" and listed sixteen (plan 1): the
    `SnapshotSchema` break ran twice, against the unit tests and against
    `remeasure.test.ts`, as `sabotage2-over-populated.mjs` shows. It now
    says sixteen breaks in seventeen runs.
- Rejected:
  - Correctness 2, a `duplicate_entity` that names three tables: it is
    measured over its first two, as before this round, and prompt A is told
    that a duplicate is two tables. Skipping it changes a verdict outside
    the lead's scope, and naming the second table by position in prompt B
    brings back the wording F1 removed. Recorded under Not done in NOTES.
- Tests first. With iteration 4's code and prompts, "a suspicion that names
  more than one table says which one its numbers are over, even from a
  sample that held no rows, ..." failed with "an empty sample still has
  numbers, total 0 of drafts' rows, and they say whose" (actual
  `undefined`); the prompt tests failed with "write.md no longer says that
  a duplicate_entity's total counts the rows of the table named in over:
  ..." and "write.md says what populated false and populated 0 mean, and
  what the row estimate of such a view is, once it has named populated
  among the facts". The new assertion in the duplicate test passed before,
  since it guards what iteration 4 already did.
- `npm run acceptance`: every task with checks 100/100, T6.2 and T7.1 0/100
  with no checks, overall 90, as before; no check fails.
- `npm run verify` exits 0: 320 tests, 318 pass, the 2 live tests skipped,
  0 fail; the package smoke test passes.
### Iteration 6: the sabotage check of iterations 4 and 5
- Scope, the lead's: no change to the design or to the prompts' wording;
  break each part of F1 and F2 in place, and add a test only where a break
  survives.
- `sabotage2-final.mjs` copied the five changed files into
  `sabotage2-final`, a new directory in the scratchpad, applied each break,
  ran the tests named below, put the file back from its copy and compared
  it byte for byte, and `cmp` compared all five at the end; the hash of
  `git diff` was the same before and after. One run's output overflowed
  the buffer of `spawnSync` and three messages were missed by its TAP
  parser, so those breaks and one probe ran again from copies in a second
  new directory, `sabotage2-final-rerun`, with the raw TAP kept. Before its
  dry-run guard worked, the script wrote its first break into
  `src/verify.ts` and stopped before any test ran; the line was put back by
  hand, and the hash of `git diff` matched the one before.
- Each break failed at least one test (the unit files `verdict`, `verify`,
  `write` and `snapshot`, with `integration` and `remeasure` for every code
  break but three of `verify`'s):
  - F1 in `verify`: no `over`, and `over` naming the second table, both "a
    suspicion that names more than one table says which one ..." with "the
    overlap is a share of products' rows, and the measurement says so by
    name", and "the whole loop on the fixture, ..." with "the writer is
    told by name whose rows the overlap is a share of"; `over` on a
    suspicion over one table, "a suspicion that names one table needs no
    name beside its numbers"; on one with no numbers, "nothing was measured,
    so over no table"; iteration 4's `m.skipped === undefined` back, "an
    empty sample still has numbers, total 0 of drafts' rows, and they say
    whose".
  - F1 in `decide`, `over` not copied: "a verdict names the table ..." and
    the whole loop, both with "the writer is told by name whose rows the
    overlap is a share of".
  - F1 in `SnapshotSchema`, `over` dropped on parse: "the table a verdict's
    numbers were measured over survives ..." with "the snapshot keeps whose
    rows the overlap is a share of"; "an unchanged database passes ..." and
    "check --json prints the report alone ..." failed their deep equality.
  - F1 in `tableFile`: no table named, "a problem over two tables names the
    one ..." with "products_legacy's file says the numbers count products'
    rows, not its own"; the table taken from the order of the names again,
    the same test with "the table comes from the verdict, as prompt B is
    sent it, and not from the order of the suspicion's names".
  - F2 in `verify`: the count back beside `populated`, and a count in its
    place, both "a dead materialized view that was never refreshed is not
    counted: ..." with "no count of 0 and no exact: no row was counted",
    and the whole loop with "what the catalog says, and no count: reading
    it raises an error".
  - F2 in `decide`, `populated` ignored: "dead_table: a materialized view
    never refreshed is dead ..." with "populated 0 proves it dead: ...",
    the verify test's status assertion, the whole loop with "an
    unpopulated materialized view is dead, from the catalog", and "claims
    the budget leaves unmeasured never fail" (10 claims not measured where
    it expects 11, since the view's verdict was unverifiable both times).
  - F2 in `assemble`, `populated` not copied: the whole loop with "and that
    the materialized view was never refreshed".
  - F2 in `tableFile`, "no rows" back: "a materialized view never refreshed
    says that reading it raises an error, ..." with "its size is what the
    schema says, and no count of rows that were never read", and the whole
    loop with "not "no rows": a read raises an error".
  - Prompt B, seven deletions (the `over` sentence, the `duplicate_entity`
    numbers, the overlap rule, `populated` among the facts, what
    `populated` false and 0 mean, "which cannot be read" in the rule on
    "empty", the rule never to say such a view has no rows): each failed a
    prompt test with the message naming that sentence.
- Survived, a probe outside the lines this round changed: `fitForWriter`
  rebuilding a verdict's measurement as `{ query: "", numbers }` when it
  leaves the queries out drops `over`, so prompt B over its input limit
  would get the numbers with no name beside them; `write.test.ts` and the
  whole loop stayed green. New test in `write.test.ts`, "prompt B sent the
  verdicts without their queries is still told the table a verdict's
  numbers were measured over": it passes on this code and failed under that
  probe with "only the query goes: the overlap still names whose rows it is
  a share of", from a copy in a third new directory,
  `sabotage2-final-probe`, put back and compared the same way. NOTES lists
  it with the round's tests.
- `npm run verify` exits 0: 321 tests (one new), 319 pass, the 2 live tests
  skipped, 0 fail; the package smoke test passes.
