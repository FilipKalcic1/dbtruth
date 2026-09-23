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
