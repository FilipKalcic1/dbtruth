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
- Commit: not made, because this run may not touch git. Its message is
  `T0.1: Verification harness and scoring script (score 100)`.
