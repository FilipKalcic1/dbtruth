# NOTES

Where the build departed from the spec, or where the spec was followed against
a competing recommendation. Each entry says what, why, and what was not done.

## Followed the spec against a recommendation

- **Default model is `claude-sonnet-5`.** The Claude API reference available
  while building recommends `claude-opus-5` as the default for new code. The
  spec names the current Sonnet-class model. `ANTHROPIC_MODEL` overrides it.

## Small extensions of the spec's types

- **`Verified` carries `database` and `tables`** (per table: primary key, row
  estimate, distinct values of categorical columns). The per-table files need
  the key and the categorical values, and `Claims` do not carry them. Since
  0.1.8 `write.ts` renders those files from `Verified` itself; the model still
  receives the whole object. This is allowed fix 1, better evidence, not a new
  feature.
- **`Table` carries `schema`** so `verify.ts` can write correct SQL for tables
  outside `public`. `name` is still the display name (`table`, or
  `schema.table` outside `public`).
- **`Column` carries `values`** when the column is categorical: every distinct
  value on the sample. Fifteen sample rows are poor evidence for
  `shipped` / `SHIPPED`; the full list is good evidence.
- **Three numbers added to `config.ts`**: `modelMaxOutputTokens`,
  `charsPerToken`, `sampleOversample`. The rule that a number lives only in
  config forced them there; each has its comment.

## Mechanisms, stated plainly

- **Read-only proof** is two checks inside one transaction that is always
  rolled back. First the server states `current_setting('transaction_read_only')`,
  which is the proof: Postgres enforces that mode on every write. Then a
  `CREATE TABLE` is attempted as an empirical confirmation; any refusal is
  fine, since a role without CREATE privilege refuses it with 42501 and is
  read-only all the same. Only an accepted write disproves anything. That
  attempt is the one write-shaped statement this tool ever sends, in tension
  with "never write". It is accepted deliberately: the spec asks for it, the
  transaction is rolled back whether it succeeds or fails, and it exists to
  catch the case where the read-only setting silently did not take.
- **Statistics never leave the database.** Null rate and distinct count are
  computed by one aggregate query per table over the bounded sample. Node
  only ever holds the shown rows, and hidden cells are replaced before they
  are serialized.
- **Canonical form** for `inconsistent_values` is `lower(btrim(value))`, one
  normalization applied uniformly. A column with more distinct values than
  `categoricalMaxDistinct` is not measured (unverifiable), because collisions
  in free text mean nothing.
- **Budget overrun** is bounded by one `statementTimeoutSeconds`: the budget is
  checked before each query, not enforced mid-query.
- **The three catalog reads are outside the budget.** With 300 tables and a
  0.3 s budget the first version crashed on "could not list constraints: time
  budget exhausted". The budget is for measuring; describing the schema is the
  minimum any run must do, and it is bounded by the statement timeout anyway.
  `safety.catalog()` is `query()` without the budget, nothing else.
- **API preflight.** Before the database is touched, `model.preflight()` calls
  the Models endpoint for the configured model id. It sends nothing but that
  id, costs no tokens, and turns a missing key, a rejected key, a wrong model
  name or no network into one sentence that says what to fix. This mirrors the
  read-only proof on the database side: prove both ends work, then read.

## 0.1.1: what the first real database taught (Pagila, Postgres 18)

Every claim the tool made about Pagila was true when checked by hand. The run
itself exposed five defects, none caught by a test. Each fix is a mechanism.

1. **`--json` could not be piped.** The disclosure line went to stdout with
   the JSON. Now every human-facing line goes to stderr; stdout carries the
   analysis and nothing else.
2. **Partitions were tables.** 70 relations reported where a person sees 15;
   55 were monthly partitions of `payment`. A partitioned table now stands for
   its partitions (`relispartition` is a catalog flag, not a name pattern),
   carrying `partitions.count` and `partitions.withLocalForeignKeys`. The
   second number keeps the run's best finding possible: partitions from
   2022-07 onward declared no foreign keys while earlier ones did.
3. **Views were invisible.** Eight relations a user would query were absent
   and unmentioned. Views and materialized views are now relations with a
   `kind` and their SQL as `definition`; a plain view's size comes from its
   sample because it has no `reltuples`.
4. **A secret was sent.** `staff.password` holds the same hash on every row:
   one distinct value, so the cardinality gate called it categorical and sent
   it. Categorical text must now also be short: the longest value on the
   sample is measured and compared with `categoricalMaxValueLength`. Enum
   labels are short; hashes and tokens are not. The fixture carries a constant
   32-character token, the length of an MD5 hash, that the canary test now guards.
5. **`missing_key` with no table.** The model emitted a suspicion naming no
   table. The schema now requires at least one, so validation sends it back.
6. **A materialized view that was never refreshed.** Pagila's
   `rental_by_category` has never had `REFRESH MATERIALIZED VIEW` run, so
   Postgres refuses every read of it. The first 0.1.1 build sampled it, got an
   error, silently hid its columns, and returned every claim about it as
   unverifiable with no reason. The catalog knows: `pg_class.relispopulated`.
   It is now `populated: false` on the relation, sampling is skipped, a
   `dead_table` suspicion on it is confirmed from the catalog, and any other
   measurement says plainly that it cannot be read.

Speed on Pagila (214 s) was mostly item 2: 55 partitions of schema and
samples sent to the model for nothing.

Needs Postgres 12 or newer (see the 0.1.6 section).

## 0.1.4: from the first code review

1. **False alarm for careful users.** The read-only proof counted only
   SQLSTATE 25006. A role without CREATE privilege on the schema, the
   Postgres 15+ default for non-owners, gets 42501 instead, so the most
   careful users got a loud warning that the session was not proven
   read-only. Now the server's own `transaction_read_only` is the proof and
   any refusal of the write attempt is acceptable. The fixture has a `reader`
   role for exactly this, and a test that expects no warning.
2. **Non-text columns were always visible.** `visible = !isText || categorical`
   meant a national id stored as `bigint`, a phone number as `numeric`, a
   birth date, a salary, a coordinate were all sent to the model. Visibility
   is now one rule for every type: categorical, or a declared key (primary or
   foreign key column, an identifier by declaration), or revealed. Hidden
   date and timestamp columns keep a year range so staleness can still be
   suspected. The cost: the model can no longer quote orphan values such as
   `9001, 9002` in its reports; the measurement does not care.
3. **First impression.** A small schema ran at effort `high` for a minute and
   a half. Effort now follows schema size through bands in config, small
   schemas start at `low`, and each step prints one progress line with its
   time, so a person can see it working. `DBTRUTH_MODEL_EFFORT` still pins a
   level.
4. **The GIF left the tarball.** The README links to it on GitHub; 171 kB per
   install for a picture nobody sees locally was waste.

## 0.1.5: token usage

`model.usage()` sums input and output tokens over every call, including
retries, and the summary prints them. It exists because "what does a run
cost" was a question nobody could answer from the outside.

### A benchmark script that was written and then removed

For one day `scripts/benchmark.ts` ran the tool's own extract, verify and
verdict over eight public schemas with claims synthesized from the schema
instead of from the model: every declared foreign key, every table, every
categorical text column. It needed no model and cost nothing.

It was removed because it measured what cannot break. Postgres enforces a
declared foreign key, so its hit rate is 1.0 by construction; all eight
schemas returned exactly that. The relationships worth finding are the
undeclared ones, which exist only in application code, and nothing in the
schema points at them. Producing that list is the model's whole job.

Worth keeping from the exercise: application schemas taken from migrations
carry no rows, so on them this tool can count tables and keys but cannot
measure a single join. Its claim is testable only on a populated database
with real history.

## 0.1.6: the second review, eight reviewers over src/

`/code-review` and `/simplify` ran eight independent readers over the source:
conventions, simplification, efficiency, reuse, altitude, a cross-file tracer,
a removed-behaviour audit and a line-by-line scan. About thirty-five findings
came back. Each was checked against the code; these were real and are fixed.

Correctness and safety:

- **A small table leaked.** The categorical test was absolute, so on a
  40-row `customers` table `email` (40 distinct, 17 characters) counted as
  categorical and was sent. A categorical column now also has to repeat a
  value: `distinct < nonNull`. An identifier is an identifier at any size.
- **An empty sample opened the gate.** A stale row estimate made TABLESAMPLE
  return zero rows; every column then had zero distinct values, every column
  was "categorical", and the shown rows were read from the table unmasked.
  A categorical column now needs at least one value, an empty sample falls
  back to the plain form, and the shown rows are drawn from the same sample
  with only the visible columns selected, so a hidden value is never read
  out of the database at all.
- **A text key was shown.** Declared keys were exempt from hiding whatever
  their type, so `users(email PRIMARY KEY)` sent every email. Keys are exempt
  only when they are not text.
- **A dead-table check could return millions of rows.** For a large table
  with no timestamp column the statement had no aggregate, so it returned one
  row per table row. `deadTableQuery` is now always an aggregate or no
  statement at all, and a test proves it.
- **A lost connection looked like "nothing found".** Every failed statement
  became a skipped measurement, so after the server dropped the session the
  run finished, wrote files and exited 0. A failure with no SQLSTATE, or one
  in class 08 or 57, now stops the run.
- **OIDs above 2^31 wrapped negative** through `::int` and were then rejected
  as `oid[]` input. They travel as `bigint`.
- **Dates of `infinity` and `date[]` columns** broke the whole statistics
  statement for their table, which then silently lost all its statistics.
  Year ranges are computed as float and checked for finiteness; arrays are
  not date columns.
- **`--reveal` never matched a table outside `public`**, and a typo went
  unreported. Both forms match now, and every entry that named no column is
  reported.
- **A view's size was reported as the sample size.** A relation whose count
  hit the sample limit is now reported as -1, "at least this many", and the
  prompt says what that means; a plain count that came back short is exact.
- **The write step could abort after both paid calls** on a path Windows
  refuses, silently write to an NTFS stream, or let `Users` and `users`
  overwrite each other. Paths are sanitised, reserved names prefixed,
  case collisions suffixed, and one file that cannot be written is reported
  while the rest are written. Files from a previous run are cleared first, so
  a dropped table leaves no stale context behind.
- **Identical claims were measured twice** and the second verdict could not
  be mapped back. Claims are deduplicated when they are parsed.
- **A model that rejects the effort parameter** failed after all the
  sampling with a raw 400. The call is retried once without effort and the
  summary says so; every API error mid-run is now explained the same way as
  at preflight.
- **Config accepted anything numeric.** `statement_timeout = 0` disables the
  timeout in Postgres; `join.broken` above `join.confirmed` inverted the
  bands. Every tunable now carries its range, and the invariants are checked.

Efficiency and structure:

- The join measurement probes per row only when the target column is a key;
  otherwise it hashes the target once. Claims are measured strongest first.
- Statistics and value lists of one table come from the same
  `TABLESAMPLE ... REPEATABLE` pages, in two statements instead of three.
- The extract is measured against `modelMaxInputTokens` before it is sent,
  and trimmed in tiers (sample rows, value lists, tables) until it fits.
- Sampling stops at `extractBudgetShare` of the budget so verifying keeps
  the rest. `.env`, `bareName`, the seconds formatter and the keys-only
  column list each live in one place. Effort bands are two numbers.

Deliberately not done:

- A connection pool for concurrent sampling. It would cut latency on remote
  databases but would need the read-only proof per connection and a
  different budget model. One connection, one session, one proof.
- Grouping several relationship claims on the same source table into one
  statement. It would save scans but complicates the per-claim text fallback
  and the per-claim query a human can rerun.
- Flattening `join` and `effortBands` in config. The spec names `join`.
- A pure-schema "text type" list still exists in `typeFamily`, because the
  key exemption needs it.

Needs Postgres 12 or newer: `MATERIALIZED` common table expressions,
`pg_constraint.conparentid`, `relispartition`.

## 0.1.8: the third review

An external review listed what it thought was wrong; three independent
designs and three judges checked each item against the code. Real, and fixed:

- **Per-table files are rendered, not written by the model.** The spec has
  prompt B produce README.md, ENTITIES.md and one file per table in a single
  reply. Everything in a table file is already in `Verified`: the purpose and
  grain the model wrote in step 2, the key, size and values from step 1, the
  joins and problems with their numbers from step 3. Step 4 could only
  transcribe them, the reply grew with the table count, and on a database
  with hundreds of tables it outgrew `modelMaxOutputTokens` and the run failed
  after the sampling and the contextualize call had been paid for. `write.ts`
  now renders `context/tables/<table>.md` from `Verified` with no model call,
  so every number in them is the measured number, every relation gets a file,
  and nothing unconfirmed passes as a fact. Prompt B writes README.md and
  ENTITIES.md, where the synthesis is, and its reply is validated as those two
  keys, so a missing file is sent back like any other invalid reply. Not done:
  batching per-table calls (the same transcription, N failure modes, N times
  the input, and a batch size would be a new number) and raising the ceiling.
  The README's pasted fixture output predates this change; regenerate it from
  a live run.
- **Nothing to measure, on either side.** A claim into an empty table came
  back with zero hits and was rejected, so a possibly true relationship
  vanished because its target happened to be unloaded; `inconsistent_values`
  and `duplicate_entity` on an empty table ran a statement to learn it. One
  helper now answers from the extract before any statement: a materialized
  view never refreshed, or a relation whose scan counted no rows, on the source
  side ("no non-null rows to test") or the target side ("no rows to match
  against"). A claim naming a column the table does not have is unverifiable
  first, whatever the row count. `dead_table` still counts: there emptiness is
  the finding, and the count is evidence a human can rerun.
- **Claims name tables as the extract does.** The model's spelling of a table
  name is resolved once, when its reply is validated: exact, then regardless
  of case, on the display or the schema-qualified name. Verify and the
  per-table files then compare names exactly, and a relationship the model
  stated twice in two spellings is one claim.
- **A stale catalog estimate of 0 survived a full scan.** A table analyzed
  while empty and loaded since takes the plain LIMIT path; when that scan came
  back full, the catalog's 0 was kept, and every claim on the table would have
  been "empty" without a query. A plain scan that fills the sample proves at
  least that many rows, so the estimate stands only when it agrees, else the
  size is unknown; a random sample keeps the estimate. When the statistics
  statement fails, a catalog 0 is not trusted either: nothing confirmed it.
- **Every sample of a large table came from its oldest pages.** `TABLESAMPLE
  SYSTEM` returns whole pages in file order, and the sample asked for three
  times the rows and cut them with `LIMIT`, so the statistics, the value lists,
  the year ranges and the join hit rates of any table above `sampleRows` were
  measured on roughly its oldest third: a status value added last quarter was
  missing from `values`, a column back-filled only for new rows looked mostly
  null. The sample is now sized to `sampleRows` from the estimate, and the
  LIMIT only caps a sample whose estimate was low by more than
  `sampleOversample`.
- **The join statement counts nulls.** Hit rate, hits and orphans are over
  non-null values as before; `nulls` is the sampled rows with no value, in
  the same statement. A null is an absence an inner join drops silently, an
  orphan is a value that points nowhere; the per-table file and prompt B say
  which is which. Verdicts and exit codes do not move.
- **Two measurements were quadratic on real tables.** The join to a column
  that is not the leading primary-key column used `IN (subquery)`, which the
  planner hashes only while the target fits `work_mem` and rescans per sampled
  row above it; it is now a join to the deduplicated target, read once.
  `duplicate_entity` compared with `IS NOT DISTINCT FROM` in a correlated
  `EXISTS`, one scan of the second table per sampled row; it is now an
  `INTERSECT` of distinct tuples, one scan of each side, nulls still equal.
  The overlap is therefore over distinct sampled rows.

Deliberately not done, from the same review:

- A second sample with another seed, or a sweep over every type-compatible
  target per claim. See "One sample, one target" under Known limits.
- Polymorphic detection from sibling `_type` / `_kind` columns, or filters
  for id-like column names. Both read names for meaning, which the visibility
  rule forbids; the name-free route is the conditional join claim under Known
  limits.
- MySQL and MariaDB: every layer leans on Postgres catalog facts and syntax.
- An external policy layer: `safety.ts` is the policy layer, and
  `structure.test.ts` pins that nothing else can reach the database.

## 0.2.0 (unreleased)

Built from `BUILD_PLAN.md`, one task at a time; each task's iterations are in
`PROGRESS.md`.

- **The score is computed.** Section 4 of the plan scores every task out of
  100, and `scripts/acceptance.mjs` computes it: it runs the checks in
  `acceptance/checks.json`, counts the manual items in
  `acceptance/manual.json`, splits each part's weight evenly over that part's
  checks, and caps a task at 40 when a gate or an invariant fails. A score an
  agent judges for itself is one it can argue up to 100; a script that reruns
  every check cannot be argued with, and a later task that breaks an earlier
  one shows up as the earlier task's score falling. A task with no checks
  scores 0, a part with no checks earns nothing, and scores are floored, so
  100 means that every check and every item passed. The parts are added as
  one exact fraction: thirds added in floating point fell just below a whole
  number, and the floor took a point. A command repeated with the same timeout
  runs once per invocation, because `npm run verify` is the gate of every
  task; with another timeout it runs again, so no check is judged on a run
  killed at another check's limit. The typecheck reads the scripts
  (`allowJs`, not `checkJs`) so the test can import `score()` with its JSDoc
  type. Not done: weights per check (the plan splits them evenly on purpose),
  a list of tasks of its own (the overview table in the plan is read instead,
  leaving out a priority of exactly HUMAN), and running checks in parallel
  (they share the fixture databases and `dist/`).
- **Checks are shell commands that run on both systems.** They run under
  cmd.exe on Windows and sh on Linux, so they use double quotes only and no
  environment variables. `grep` is not portable, so documentation checks take
  a second form that reads a file and matches a regex. Both forms are described
  at the top of `scripts/acceptance.mjs` and nowhere else. A command past its
  timeout is killed with its whole process tree (`taskkill /T` on Windows, the
  process group elsewhere), so nothing it started runs on into the next check.
  A process the kill cannot find, one started detached or orphaned by a shell
  that has already exited, can still hold the output pipe, so at the timeout
  the run also stops reading the output instead of waiting for that process,
  and a kill that failed is named in the check's reason. A check on a
  test runs it with `--test-reporter=tap` and matches the test's own
  `ok N - <name>` line: when `--test-name-pattern` matches nothing, node
  reports the file itself as one passing test, so neither the exit code nor
  the pass count proves the test ran.
- **A2 of T0.1 is a manual item.** "`npm run acceptance -- --task T0.1` prints
  100" cannot be a command check, which would run the script inside itself.
  Its evidence is the score line of a real run, and that line can read 100
  only once the evidence is written, so it is filled in two steps: when every
  other check and item of T0.1 passes, write that run's result as the
  evidence, run again, and replace it with the line that run printed.
- **The sabotage record is the condition of the test points, not a share of
  them.** Section 4.2 earns the tests part "when ... the sabotage check (4.5)
  is recorded", and 4.5 says a task without it "does not get its 20 test
  points". The record is the manual item of the tests part: until its evidence
  is written the part earns nothing, and the part's checks split the 20 points
  among themselves. The first version counted the record as one more share,
  so a missing record cost 20/(n+1) points, less with every test added.
  Manual items belong to acceptance (4.1) or, as the record, to tests; one in
  gates or invariants is refused, because those parts are earned by commands
  and evidence there would pass the gate with prose.
- **Eight test files need no database, not six.** Section 1 of the plan counts
  six; the code has eight (config, extract, model, schemas, structure, verdict,
  verify, write). `safety.test.ts` mixes pure tests with database ones and runs
  under `test:db` with integration and scale. `test:unit` also runs the new
  `acceptance.test.ts`, where a test fails when a test file is in neither list
  or in both. `npm test` still runs every file.
- **The package smoke test reads the usage text, not only the exit code.** On
  Windows an installed bin that has lost its `#!/usr/bin/env node` line exits
  0 and prints nothing; that was found while breaking the smoke test on
  purpose. `--version` (T1.2) and `doctor` (T1.3) join it with their tasks.
  It looks for `test`, `src`, `.env` and `context` in every segment of every
  path in the tarball, not only at its top: `files` in `package.json` keeps
  them out of the top level, and what can still leak is a stray file under
  `dist/`, which no build cleans.

- **CI runs every Postgres the README promises.** `.github/workflows/ci.yml`
  runs `npm run verify` on Postgres 12, 14, 16 and 18 and Node 20 and 22, on
  every push and pull request. 12 is the documented minimum (see 0.1.6) and
  behaves differently where it matters: it reports a never-analyzed table as
  `reltuples = 0` rather than `-1`, which T2.1 depends on. 18 is the newest
  release; 14 and 16 cover the versions between. Node 20 is
  the `engines` minimum and 22 the current LTS. A service container cannot
  mount init scripts, so CI loads the fixture files with `psql` in the order
  `docker-compose.yml` lists them, read from that file rather than repeated;
  `test/ci.test.ts` fails when a fixture file is not mounted there, or when
  the matrix no longer starts at the README's minimum versions. Third-party
  actions are pinned by commit. Not done: caching the fixture databases
  between runs (loading them takes seconds) and a Windows runner (the
  database is Linux in every supported setup; the CLI's Windows paths are
  exercised on the maintainer's machine).
- **`--version` reads `package.json` at run time.** `dbtruth --version`, or
  `-v` as node and npm spell it (commander's default is `-V`), prints the
  version to stdout, the data this command asks for (R6), and exits 0. Tools
  that wrap dbtruth ask for it, HOL Guard's rules among them. `main()` reads
  the `package.json` one directory above the running file, which is the
  package root both from `src/` under tsx and from `dist/` once installed, so
  the number is written once and a version bump cannot leave the binary
  behind. `test/cli.test.ts` runs the source from a directory that has no
  `package.json` and expects exactly that version and a newline; the package
  smoke test runs the installed `node_modules/.bin/dbtruth`, which is what
  `npx dbtruth` runs in a project that has the package, and expects the
  version npm packed. Not done: a module or helper for the version. The
  snapshot (T3.1) and the MCP server (T5.1) need the same value, and
  `cli.ts` will hand it to them.
- **`.env` is found up to the repository root.** In a monorepo `.env` sits at
  the root while the command runs from a package, and 0.1.8 read the working
  directory only, so the user was told "no database URL" with no idea why.
  `findDotEnv` in `safety.ts` walks up from the real path of the working
  directory to the first directory that holds a `.git` (a directory, or a
  file in a worktree or submodule), and searches that root too. Outside a
  repository it searches the working directory only, so an unrelated
  `~/.env` is never read. The nearest `.env` wins and is read whole; two
  files are never merged, so a run's settings are one file a person can open.
  A `.env` that cannot be read is named on stderr with its error and passed
  over, so a file used further up is no surprise; a directory named `.env`,
  such as a Python virtualenv, is not a settings file and is passed over
  without a word. When the file used is not in the working directory, stderr
  says `reading settings from ../../.env` before the disclosure line, never a
  value; that is decided on real paths, so a symlinked directory's own `.env`
  is not announced, while the path shown is relative to the directory as
  given, because Windows resolves `..` as written. Paths found on disk are
  printed as the system spells them, so they paste into its shell. The "no
  database URL" error lists the directories searched and one fix per line.
  `searched` carries each directory with an optional error rather than the
  plan's strings, so `cli.ts` words the error. Precedence is unchanged:
  `--url`, the environment (an empty variable still means unset and hides
  the file's), the file. Not done: a line of its own for that empty variable,
  or for a `--dotenv` file that exists but cannot be read, which stops the run
  with the system's error like any other unreadable file.
- **The option is `--dotenv`, not the plan's `--env-file`.** Node claims
  `--env-file` from anywhere on its command line, after the script name too:
  `node argv.mjs --env-file nope.env` exits 9 with Node's own `nope.env: not
  found` before the script runs (Node 20.20, 22.18, 22.23, 24.21, and through
  `npx`), and with a file that exists Node applies that file's `NODE_OPTIONS`
  before passing the flag on. `npx dbtruth` and `node dist/cli.js` both go
  through Node, so an option of that name can never do what the plan asks;
  `--dotenv` reaches dbtruth untouched. Section 0, item 5 of the plan: the
  platform wins, and the lead decided the name after T1.1 iteration 3. The
  later tasks that take the option use it too: `doctor` (T1.3), `check`
  (T3.2), `mcp` (T5.1) and Appendix E.
- **What "no value from any `.env` is ever printed" (T1.1, A6) covers.** Nothing
  read from a settings file is printed except what 0.1.8 already printed on
  purpose: the model id, which the disclosure line names because it says where
  the data goes, and the database name as the server reports it. Credentials,
  host, user, the API key and every other value never are. A test puts
  `canary-pii` into a `.env`'s password, key and an unrelated variable and
  runs every path T1.1 adds or changes, errors included; no line holds it.
  Since T1.3 a failed connection is told in a sentence of dbtruth's own
  (below), and the test puts the canary in the user, host and database of the
  URL too. dbtruth's own tuning values, which a `.env` can also hold, are
  still printed where the tool reports using or rejecting them.
- **`dbtruth doctor` says what stands between a setup and a full run.** Most
  first runs fail on setup, and a full run meets the problems one at a time.
  `doctor [--url <url>] [--dotenv <path>]` runs the plan's eight checks in its
  order, one line each on stderr, `ok <what>` or `FAIL <what>: <fix>`, nothing
  on stdout, and exits 1 when one of the first six fails: Node, the settings
  source, the URL (never printed, not even its host), the connection, Postgres
  12 or newer, the read-only proof. The last two inform only: how many
  relations the role can and cannot `SELECT`, since a role may be meant to
  read part of a database, and the API key, since `check` and `mcp` need none.
  A key that is set is tried with `model.preflight()`, the full run's own
  first request: the Models endpoint, the model id, no token. The plan's
  check 8 asks for it, so it is read as within R9's allowance for a full run;
  `check` and `mcp` stay offline. A check that needs one that failed is not
  run. How it is built:
  - The settings step moved out of `run()` into `readSettings` in `safety.ts`,
    beside `findDotEnv`, and both commands call it. A `--dotenv` file that
    exists but cannot be read is now a sentence for both, not a raw throw.
  - Check 7 counts over `DESCRIBED_RELATIONS`, the condition `listRelations`
    uses too, less partitions, and only once check 5 has passed:
    `relispartition` does not exist on 9.x, where one combined statement
    failed before the version could be printed.
  - Options before `doctor` are its own as well, with those after its name
    winning (`enablePositionalOptions`); they were dropped, and `dbtruth --url
    X doctor` checked another database. `optsWithGlobals()` lets the
    program's value win, so it was not used.
  - The `WARNING: ` mark moved from `connect()` to `run()`, so check 6 fails in
    the words of the full run's warning and the full run prints what it did.
  - The minimum versions are constants in `doctor.ts`, not tunables: they are
    what the code needs, and the README and CI state the same numbers.
  - `DoctorDeps.preflight` is the test hook. The proof that no token is spent
    is the command run against a local HTTP server given as
    `ANTHROPIC_BASE_URL`: every request it records, for a 200 and for each
    error `explainApiFailure` words, is `GET /v1/models/<id>`, and there is
    none without a key.
  - `test/fixtures/roles.sql` adds a role that can read two of the fixture's
    eleven relations, with a password a URL must escape and the canary.
  - The package smoke test runs the installed `dbtruth doctor` against
    `DATABASE_URL`, else the fixture, as every test does; the plan runs it
    only when `DATABASE_URL` is set, which would leave A5 unchecked.
  - Not done: a line for a check that was not run; `USAGE` on the relation's
    schema in check 7; naming which source the URL came from.
- **A failed connection is told in dbtruth's words, in a full run too.**
  `connect()` appended the driver's message, which names the user, the host or
  the database. It now words the cause, and the full run and `doctor` print
  the same sentence: nothing listening (`ECONNREFUSED`), host not found
  (`ENOTFOUND`), authentication failed (SQLSTATE class 28), no such database
  (3D000), SSL required, timeout; anything else by its code alone.
  `new pg.Client` is inside the same `try`, because the driver parses the URL
  there and its errors quote it.
  - SSL required has no code of its own: a server whose `pg_hba.conf` admits
    only encrypted connections refuses with 28000 from `ClientAuthentication`
    (checked on Postgres 16 and 18). A host or user it does not admit is
    refused the same way, so the sentence says the access rules refused the
    connection and suggests `sslmode=verify-full`. Not `require`:
    pg-connection-string treats it as `verify-full` anyway and prints a
    SECURITY WARNING for it.
  - Connecting is bounded by `statementTimeoutSeconds` (pg's
    `connectionTimeoutMillis`); pg sets no limit, and a host that drops
    packets held a run for the system's TCP timeout. One number says how long
    dbtruth waits on the server; its comment says so, and a separate limit
    would be a number the plan does not ask for. pg's timeout carries no code,
    so its message, `timeout expired`, is what is matched.
  - A server that accepted the connection and then refused `SET` let its raw
    error escape and left the client open. The client is now closed and the
    error reads "the server accepted the connection but refused to set up a
    read-only session (42704)". No real server can be made to refuse `SET`,
    so the test runs a fake Postgres of a few lines over `node:net`, against
    the real driver and the real `connect()`; fakes of the same kind play a
    server that requires SSL, one that never answers, and a 9.x server that
    accepts the proof's write.
  - Not done: a sentence for failures the driver reports only in words, such
    as a URL without a password or `sslmode` against a server without SSL;
    they read `could not connect to the database`. A certificate that cannot
    be verified is named by its OpenSSL code alone; the fixes
    (`sslrootcert=<file>`, `sslmode=no-verify`) belong in the troubleshooting
    table of T1.5.
- **The README opens with the quick start the plan orders, and every error
  has a row.** Requirements; two settings in `.env` at the repository root,
  `npx dbtruth doctor`, `npx dbtruth`; the Monorepos paragraph; a
  troubleshooting table; the commands. The plan offers `npx dbtruth init` as a
  way to write the settings, but it is not built and today prints commander's
  `too many arguments`, so the quick start names it only as coming; the
  commands list marks `init`, `check` and `mcp` with the release the plan's
  T7.1 puts them in. The table shows each message as it is printed, `<...>`
  for a value, so a person can search it for the line they got; messages with
  one fix share a row. Checked by running them as well as by reading the code:
  a `#` in the password gives `ERR_INVALID_URL` and an `@` the authentication
  sentence; a missing `sslrootcert` file gives `ENOENT`; a URL without a
  password, or `sslmode` against a server without SSL, the bare sentence; a
  self-signed certificate under `verify-full` gives
  `DEPTH_ZERO_SELF_SIGNED_CERT`, which `sslrootcert=<file>` and
  `sslmode=no-verify` both get past; a key with a curly quote in it gives
  "could not send a request to the Anthropic API" with `Cannot convert argument
  to a ByteString`; `init`,
  `check` and `mcp` give commander's `too many arguments`. Left for later,
  and done in T3.1 (below): `persist` removed the last run's files outside its
  per-file `try`, so a file it could not remove (held open on Windows,
  `EBUSY`; in a directory this user cannot write, `EACCES`) stopped the run
  after the model calls, with the files removed before it gone. The table gave
  that failure a row in the system's words; reporting it with the other files
  that could not be written was a change of behaviour, not of the README.
- **`test/readme.test.ts` reads the errors out of `src/`.** A list of error ids
  is kept by whoever adds an error, the one person the test is there to catch,
  so it reads the source with regular expressions, as `structure.test.ts`
  does; TypeScript 7 ships no stable parser API. A message reaches the user in
  one of six ways, and the test takes the literal after each: thrown (`new
  Error(`), printed (`err(`), warned (`warn(`), a connection failure's cause
  (`because(`), a sentence a function returns for its caller to throw or print
  (`return`), and the note `fitToContext` returns when it trims the model's
  input (`reduced:`). The plan also names `process.stderr`: `main` wrote its
  last line, `dbtruth: <error>`, there directly, and now hands it to its `err`
  like every other line. A literal without two words in a row is punctuation,
  a prefix such as `FAIL`, or SQL, which this code writes in capitals; doctor's
  `ok` and `note` lines and the full run's progress lines are named as not
  errors. Each
  message must match a whole code span in the table's first column, a
  placeholder standing for any value; a cause need only end one, since it
  follows `could not connect to the database: `, and the read-only warning may
  follow `WARNING: `. A first version looked for the words between the
  placeholders anywhere in the section, and `could not read <path> (<error>)`
  passed on the `--dotenv` row's. The pattern reads a literal up to a template
  nested in it, and `connectFailure`'s last line nested its code in the
  message, which left `could not connect to the database`, the start of every
  connection row; it is now two returns, one per message, printing what it
  printed, and `doctor.test.ts` runs both, which no test did. Two pieces sit
  inside a longer line or a list of lines, where the pattern cannot see them,
  and are listed by hand: the full run's "no database URL" line and "not
  examined"; each must still be in `src/` and in the table's first column. The
  note that the input was trimmed was listed too, by the words its three
  versions share, which let two of them lose their row unnoticed; it is now
  read as the sixth way. The test also fails when one of the six ways matches
  nothing, so an edit that breaks the pattern cannot pass by finding less.
  Not done: a message worded a seventh way, through a new helper
  like `because` or a direct write to `process.stderr`, is not seen until the
  pattern learns it; a message cut short by a nested template, as the
  read-only session's still is, is matched only up to the cut, which no other
  row starts with; a message that is a known start and a value, such as a new
  `could not connect to the database: <detail>`, passes on any row that starts
  the same way; commander's own errors have a row but are not in `src/`; and a
  row whose message is gone is not caught, though a reworded message fails the
  test until its row has the new words.
- **The quick start's `.env` had a comment the parser keeps.**
  `ANTHROPIC_MODEL=claude-sonnet-5     # optional; this is the default`, copied
  as shown, set the model id to the rest of the line, and the key check then
  said that model does not exist. `readEnvFile` reads a value to the end of its
  line, as in 0.1.8. The example now holds the two settings only, and the text
  says a comment goes on a line of its own. `test/readme.test.ts` reads the
  example with `readEnvFile` and fails on a value with a space in it, which no
  setting has; no test did. Not done: dropping a trailing `#
  comment` in the parser, which would cut a password that holds ` #`, and is a
  change of behaviour outside this task.
- **`doctor` has a third marker, `note`, for what only informs.** The plan's
  doctor prints `ok` or `FAIL`, and T1.3 printed a missing key as `ok no API
  key: a full run needs ANTHROPIC_API_KEY; check and mcp do not`. In the
  lead's walkthrough of the quick start (T1.5, A2) a newcomer without a key saw
  every line say `ok`, and the full run then stopped at the key; the line also
  named `check`, which does not exist yet and gave commander's `too many
  arguments`. A missing key is neither a pass nor a failure, and neither are
  relations the role cannot read, the other finding doctor only informs of,
  which the README already named with the key: both are now `note` lines,
  `note no API key: a full run needs ANTHROPIC_API_KEY; doctor does not` and
  `note 2 relations readable, 9 not: measurements on those will be skipped`. A
  key the API rejects is still a `FAIL`, and the exit code is the plan's: 1
  only when one of checks 1 to 6 fails. The quick start's comment for `doctor`
  says what the three markers and the exit code mean. The key's line names
  only commands that exist: `check` (T3.2) and `mcp` (T5.1) add themselves to
  it when they ship, as the plan's sentence has them. Decided by the lead after
  the walkthrough. The package smoke test runs the installed `doctor` without a
  key, so it now takes `ok` and `note` lines and prints "none failing", the
  line T1.3's A5 reads; `test/readme.test.ts` passes over `note` lines as it
  does `ok` ones.
- **Each failure outside the API is told for what it is.** `explainApiFailure`
  ended every failure that did not come from the API in "no API key found. Set
  ANTHROPIC_API_KEY ..." and the SDK's text in parentheses, which was right for
  one of its three causes. The class now decides, never the SDK's wording
  (0.123.0): a plain `Error` is the SDK finding no key, and says only "no API
  key found." with where to put one, without the SDK's sentence, which names
  ways to sign in dbtruth does not document; a `TypeError` is Node refusing to
  build the request, a key with a character a header cannot carry (a curly
  quote) or a bad `ANTHROPIC_BASE_URL`, and says "could not send a request to
  the Anthropic API: <reason>"; the SDK's own `AnthropicError` that is not an
  `APIError` is a reply that broke off while it streamed in (`terminated`,
  `request ended without sending any chunks`), and says so with the SDK's
  words and "Run again". Found in the walkthrough and while fixing it, decided
  by the lead. `integration.test.ts` checks the no-key line has no SDK
  sentence, `cli.test.ts` runs a key with a curly quote, and `model.test.ts`
  ends a streamed reply before its first event.
- **`context/` is written where the command runs.** `persist` joins
  `context/` to the working directory, so from `packages/api` it lands in
  `packages/api/context/`, whichever `.env` was read. The README's Monorepos
  paragraph says so, and to run from the directory whose `context/` the agent
  should read, usually the repository root; the nested-package test in
  `integration.test.ts` checks where the files land. Not done: an option to
  write `context/` elsewhere.
- **A relation the catalog cannot size is still sampled across its whole
  file.** The sample is sized from the row estimate, and with none it took the
  plain `LIMIT`, which reads the oldest pages or the first partition: the bias
  of "Every sample of a large table came from its oldest pages" (0.1.8),
  reached by another door. The plan's reproduction (section 1, defects 1 and
  2, Postgres 16): a 300,000-row table partitioned by year, its leaves
  analyzed and its parent not, as autovacuum leaves it, where `SELECT * FROM
  ev LIMIT 50000` covered 2024 only and `TABLESAMPLE SYSTEM` on the parent
  2024 to 2026; and a table loaded since its last `ANALYZE`, `reltuples = -1`
  and `relpages = 0` over 1,664 pages, where the `LIMIT` read ids 1 to 50,000
  of 300,000. The new `sampling` database holds both, and the edge cases
  below. On it 0.1.8 gave `ev` the years 2024 to 2024 and no `only_2026`, and
  `fresh_big` batches 1 to 5 of 30 and no `introduced_late`, both sized -1.
  Now `ev` is 300,000 rows from its leaves and `fresh_big` 279,812 from a
  pilot over 1,637 pages, both are sampled with `TABLESAMPLE`, and every
  year, batch and value is found, the same on Postgres 12, 16 and 18.
  - `listRelations` reads each relation's pages: `relpages`, which the
    `ANALYZE` that gave `reltuples` counted, or, where there is no estimate
    and `relpages` is 0 as well, the file's size, `pg_relation_size` over
    `block_size`. For a partitioned table it reads its leaves' `reltuples` and
    pages the same way, from `pg_partition_tree`, every level deep. That is a
    subquery in the listing rather than the plan's one more statement per
    parent: the listing already visits every partitioned table, and the
    leaves come back in the shape the rules take. The leaves are the tree's
    ordinary tables, `relkind = 'r'`, without the plan's `isleaf` beside it:
    only a partitioned table has partitions, so the two say the same. The
    tree also lists the partitioned table itself, which an `ANALYZE` of the
    whole database sizes on Postgres 16 and 18 (on 12 it stays 0); the
    fixture's `events` is the test that its 300 rows are not counted twice,
    and `nested`, partitioned two levels deep, that the leaves one level
    further down are counted.
  - A partition tree with a foreign table in it gets no leaves, and the
    parent is sized and sampled by its own `reltuples`, as in 0.1.8. The plan
    expected `TABLESAMPLE` on such a parent to fail and fall back to the
    plain form. It does not fail: Postgres reads a foreign partition whole and
    samples the rest, so a pilot there counts every remote row as a sampled
    one. On the fixture's `mixed`, 1,000 rows a `file_fdw` program prints
    beside 59,000 local rows never analyzed, the pilot read 38% of the local
    pages, counted 24,518 rows, the 1,000 remote ones among them, and made
    64,237; in review a 200,000-row remote partition beside a 300,000-row
    local one made 2,953,127. Now `mixed` is -1, read with the plain form.
  - `estimateRows` applies the plan's five rules in order. An estimate is
    unknown when `reltuples` is -1 (Postgres 14 and later) or 0 over pages on
    disk (12 and 13 before the first `ANALYZE`, and any version for a table
    analyzed while empty and loaded since). The pilot, a count over
    `TABLESAMPLE SYSTEM (min(100, 100 * pilotPages / pages)) REPEATABLE
    (sampleSeed)`, goes through `db.query`, inside the budget; any failure
    leaves the size -1 and the plain path as before. The function takes the
    pilot as an argument, so the rules read in one place and are tested
    without a database, and `extract()` hands it the statement. The pilot's
    count is scaled by 100 / p: the plan's rows per page times the pages, with
    the pages cancelled. A pilot's or an extrapolation's estimate is rounded
    to whole rows. A database restored from a dump has no statistics until
    autovacuum reaches it, so every table in it takes a pilot then: one count
    over about `pilotPages` pages each.
  - A partitioned table with no known leaf is piloted over its leaves' pages,
    with the source `pilot`: rule 3 sends it to rule 4, and the number did
    come from a sample. A known leaf with no pages has no rows per page to
    lend: with only such leaves known, the parent is piloted too.
  - The source travels with the number. `estimateSource` is set with the
    estimate, and `profile()` keeps it only where the estimate stands: a
    random sample, a plain scan that filled up under it, or statistics that
    could not be taken. A plain scan that came back short counted the
    relation, even when the count equals the estimate, as it does after a
    pilot over a table of 100 pages or fewer, which read it all; one that
    filled past a low estimate says "at least the sample size"; a 0 the
    statistics could not confirm becomes -1. Every small table is counted, so
    it has none. No `count` source was added: no source already says "not an
    estimate", and the plan gives three values. The per-table file adds
    `(estimated from a sample)` for `pilot`.
  - The dead-table measurement of a large table with no date column takes its
    count from the estimate, and its label named `pg_class.reltuples`, which
    the leaves or a pilot may now stand in for. No statement reruns an
    estimate, so the label names where to look it up: `pg_class.reltuples`,
    as before, the leaf partitions' `pg_class.reltuples`, or a pilot sample;
    and says when there is no estimate.
  - `DESCRIBED_RELATIONS` leaves out the temporary schemas by catalog facts,
    not a `LIKE` on the name: other sessions' by `pg_is_other_temp_schema`,
    this session's own by `pg_my_temp_schema()`. Other sessions' tables were
    listed, and every read of them failed. dbtruth creates no temporary table,
    but behind a pooler that shares server sessions its session can hold
    another client's. `pg_toast_temp_*` was already left out by `pg_toast%`.
    `doctor` counts over the same condition.
  - The test first asserts, from the catalog, that both estimates are unknown
    on the server it runs on: an index built after the load, or an `ANALYZE`
    of the whole database, would fill them in, and it would prove nothing.
    Postgres 12 reports 0 for both, 16 and 18 report -1.
  - The fixture's `events` is now the sum of its two leaves, 300, the number
    its own `ANALYZE` gave, and the plain scan counts it as before.
  - The listing opens a file only where the catalog has no estimate.
    `pg_relation_size` takes the lock a `SELECT` takes, and called on every
    relation it let one table under an exclusive lock, by a `VACUUM FULL` or a
    long migration, hold the whole listing until the statement timeout, and
    the run stopped with `could not list relations`. An analyzed table, and a
    partitioned table itself, are now sized from the catalog alone, and under
    such a lock lose only their statistics, as any read of them does; the
    test holds `analyzed` and `ev` under one.
  - Not done: analyzing anything, which is a write; and a lock timeout for
    the listing, which would be a new number. The listing still waits on a
    table under an exclusive lock that has no estimate, whose file it must
    read; on a partition under one, since `pg_partition_tree` takes the
    `SELECT` lock on every member of the tree; and on a table a view reads,
    through `pg_get_viewdef`, as it did before. A large partitioned table with
    a foreign partition and an estimate of its own, from an `ANALYZE` of the
    parent on 14 and later, is still sampled with `TABLESAMPLE`, which reads
    that partition whole, as in 0.1.8.

## 0.3.0 (unreleased)

Built from `BUILD_PLAN.md`, one task at a time; each task's iterations are in
`PROGRESS.md`.

- **Every full run writes `context/snapshot.json`.** `check` (T3.2) needs to
  know what the context claimed and what was measured, in a file that lives in
  git next to the markdown. The snapshot holds its format number, `dbtruth` and
  its version, the database's name, `server_version_num`, the settings a
  measurement depends on (`measuredWith`: the sample size, oversampling and
  seed, `pilotPages`, the join bands, `staleAfterDays`, `duplicateOverlap` and
  the two categorical limits; the plan's example has `denseKeyShare` too,
  which comes with T2.2; the schema's `measuredWith` lists them once, and
  parsing the config with it keeps just those), the schema, and `Verified`'s
  claims and verdicts as they are. Nothing from `Verified.tables` goes in, so
  neither the value lists nor the sizes; a test runs with `--reveal
  customers.email`, finds the canary in what the model was sent, and not in
  the file.
  - **The same bytes for the same database and claims.** Keys are sorted at
    every level; entities and table meanings by name, relationships and
    suspicions by id, questions by their text and relations by name, a tie by
    the whole canonical text, all in UTF-16 code-unit order (`B`, `Z`, `a`,
    `b`, `ä`), never `localeCompare`, whose order is the locale's. An array
    inside a claim keeps its order: a suspicion's tables are part of its id,
    and a key's columns and a table's notes mean something in order. Two
    spaces, a final newline, no timestamp. Two offline runs whose replies list
    every kind of claim in opposite orders write the same bytes.
  - **Copies of one claim come to the same claim in any order.** `claimsSchema`
    kept the first copy of a relationship unless a later one was stated, and
    extended the first suspicion's detail with each later one not already
    inside it, so a reply that gave a claim twice in other words wrote other
    bytes in another order. Of two copies of a relationship with one basis,
    the one whose JSON sorts first is kept, and the stated copy still wins; a
    suspicion's details are each kept once and joined in code-unit order, so
    a detail inside another, `empty` beside `empty beside vehicles`, is no
    longer dropped. The byte-stability test gives a relationship and a
    suspicion twice in other words. The details are gathered and joined once:
    extending a string copy by copy took time in the square of the copies,
    22 seconds for forty thousand copies of one suspicion in a hand-edited
    snapshot, and now well under one.
  - **A dead table's age is whole days, rounded up.** The age was a fraction
    of a day that grew with `now()`, so no two runs wrote the same number and
    no snapshot with a dated dead-table claim was byte-stable. Rather than
    accept a snapshot that changes on every run, `deadTableQuery` rounds up in
    SQL, `ceil(EXTRACT(EPOCH FROM (now() - greatest(...))) / 86400)`, so the
    number kept is the one the query reruns to, and a snapshot of an unchanged
    database stays the same until the data is a day older, which is a real
    change. Up, not down: for a whole `staleAfterDays`, the rounded age is
    over it exactly when the age is, so the verdict does not move, and at the
    default of 90 a table 90 days and an hour old is dead, as before; rounding
    down would have kept it alive until 91. A fraction in `staleAfterDays`
    now counts as the whole days below it: 90.5 acts as 90. The
    byte-stability test adds a dead-table claim on `vehicles` and checks its
    age is a whole number.
  - **An age that is not a finite number is left out.** On Postgres 17 and
    later `now()` less an infinite timestamp is an infinite interval, the age
    comes back as `-Infinity`, `JSON.stringify` writes it as `null`, and the
    schema would refuse the file dbtruth had just written. `measureDeadTable`
    keeps an age only when it is finite, as `extract` does for year ranges. A
    defect this task found.
  - **The schema comes from the catalog, not the extract.** Each relation is
    listed with its schema, its kind and its columns as `[name, type]` in the
    table's order; the schema is there so that `check` can look a claim's table
    up with `findTable`, as `verify` does. A relation skipped over budget or
    dropped to fit the model is listed too, marked `"examined": false`, so that
    `check` does not call it missing; a partition is not listed, its parent
    stands for it. The extract has no columns for a skipped relation, so
    `toSnapshot` takes the catalog, not the plan's extract.
  - **The fingerprint** is `sha256:` and the hex SHA-256 of the canonical JSON
    of `schemaOnly()` over the whole catalog, sorted by name. The budget, the
    fitting and a role that may only read cannot move it: a test compares a
    full run with a run that examined nothing, one that sent the model only
    some, and one as the `reader` role, which also prints no warning, as
    section 5.3 of the plan asks of every new output. The same test checks
    `serverVersionNum` against the server's own setting and `toolVersion`
    against `package.json`. A comment, a view's text, whether a materialized
    view is populated and a partition count do move it; rows, statistics, and
    a foreign key dropped and added again under its name do not, tested on a
    copy of `fixture_template`.
  - **`readCatalog(db)` and `extract(db, cfg, catalog, opts)` stand for the
    plan's `extractRelations`.** The three catalog statements moved out of
    `extract()` into `readCatalog`, unchanged and in the same order, which
    returns each relation as the catalog describes it, its size still to be
    estimated; `extract` profiles the entries it is given. A full run reads the
    catalog once, for the extract and the snapshot; `check` (T3.2) and `mcp`
    (T5.1) will hand `extract` the entries their claims name, so there is one
    way to call it. The new signature reaches five test call sites, each now
    reading the catalog first with no assertion changed, as the lead approved:
    `sized` and `tablesOf` in `extract.test.ts`, and three in
    `sampling.test.ts`. Inside a `Table` the row estimate now comes after the
    keys; no test depends on the order, and only the JSON sent to the model
    shows it.
  - `schemaOnly` moved to `schemas.ts`, typed over the catalog's relations,
    since `snapshot.ts` imports only `schemas` and `config`; `extract` imports
    it back for `schemaTokens`. `RelationKind` and `Verdict` are now inferred
    from the zod schemas the snapshot is read with, so their literals are
    written once.
  - `listKeys` reads `ORDER BY conrelid, conname`. It had no order, so the rows
    came back as they lay in `pg_constraint`, and a foreign key dropped and
    added again moved to the end of its table's list and changed the
    fingerprint. Constraint names are unique per relation and compared in the
    C collation. On Postgres 16 the fingerprint test fails without the order;
    a planner that read through the index on the name would keep it green.
  - The full run reads `SELECT current_setting('server_version_num')::int`
    once, through `db.catalog`, after the catalog and before anything is sent
    to the model; a failure stops it with doctor's sentence, `could not read
    the server version: <message>`, which has a row. The package version is
    read once, at module scope in `cli.ts`, and handed to `.version()` and to
    the snapshot, as the note on `--version` said it would be.
  - `cli.ts` adds the serialized snapshot to the files it hands `persist`, so
    `write.ts` does not import `snapshot.ts`. `write: 13 files` on the fixture
    still counts what the model and the renderer wrote; `files written` counts
    the snapshot too, 14. `--json` still prints `Verified` alone.
    `snapshot.json` is one of the last run's files `persist` knows, as the
    plan asks, so it is cleared like the others when a run does not write it
    again; a full run always does, and a failure to write it is reported like
    any other file's.
  - **A file of the last run that cannot be removed no longer stops the run.**
    T1.5 left it undone (above), and the lead asked for it here, where
    `previousOutputs` changes anyway. The removal was outside the per-file
    `try`, so a file held open on Windows (`EBUSY`) or in a directory this
    user cannot write (`EACCES`) threw after both model calls. Only a file
    this run does not write again, a renamed or dropped table's, is removed
    now; one it writes again is replaced by the write. Removing those too
    reported one problem twice, once as found on disk and once as written, and
    a writable file in a directory this user cannot write was replaced and
    still reported as not removed. A file that cannot be removed is reported
    in `failed`, as a file that cannot be written is, by the path as found on
    disk, and the other files are still written. The line is `could not write
    <path>: <error>`, whose error names `unlink` or `rm`, and the README's row
    for the system's error went into that line's row. The tests put a
    directory with a file in it where a table's file was, which `rmSync`
    without `recursive` refuses on every system, once for a table the run no
    longer has and once for one it writes again.
  - **Reading it back.** `parseSnapshot` and `readSnapshot` land here, since
    the full run's test reads the file it wrote; `check` prints their
    sentences. `readSnapshot` looks at the path before it reads a byte:
    missing, not a file (a directory, or a device a symbolic link points at),
    larger than 10 MB, or unreadable, each with its own sentence.
    `parseSnapshot` then refuses text that is not JSON without the parser's
    message, which quotes the text, and a snapshot can be a link to any file; a
    format newer than it knows, with its number; and anything `SnapshotSchema`
    refuses, naming the path to the first wrong value. Unknown keys are
    dropped, so a key an older reader would misread must raise
    `SNAPSHOT_FORMAT`. `check` will measure with `measuredWith`, so those
    settings go through `resolveConfig` as flags would: a value outside its
    range, or join bands out of order, is refused with the flag's own
    sentence after `measuredWith:`. `sampleRowsShown` goes in as 0: the
    snapshot does not record it and `check` shows no rows, and at its default
    of 15 its rule would refuse a snapshot written with `--sample-rows 10`.
    `sampleOversample` and `sampleSeed` have no range in `config.ts` (T2.1),
    so any finite number passes, until T3.2 (below) holds the oversampling to
    at least 1; a number prints as a numeric literal, so it cannot become
    other SQL. Claims are read with the model reply's own
    schema, so a claim stated twice is one. Each sentence has a
    troubleshooting row, as `test/readme.test.ts` requires, worded for
    `check`, which is coming.
  - The 10 MB limit and the format number are constants, an exception to R5,
    which puts every number in `config.ts` with a variable and a flag. The
    plan sets the limit in T3.2's rule for untrusted input and lists no
    tunable for it in Appendix C, and the file is written on one machine and
    read on another, where a limit set on one would refuse what the other
    wrote. The fixture's snapshot is 6 KB, and the `scale` database's 145 KB
    for 300 tables of five columns: about half a kilobyte a relation, so the
    limit is reached at some twenty thousand relations, whose snapshot `check`
    refuses with its own sentence.
  - **`fixture_template` lands in T3.1, not T3.2,** since the fingerprint test
    needs a copy to change. `test/fixtures/template.sql`, mounted last as
    `90-template.sql`, connects to `postgres` and runs `CREATE DATABASE
    fixture_template TEMPLATE fixture IS_TEMPLATE true ALLOW_CONNECTIONS
    false`: a template that `DROP DATABASE` refuses and no session can connect
    to, so none can hold it while a copy is made. No step ends other sessions
    first: `CREATE DATABASE` signals the autovacuum workers in its source and
    waits for other sessions, and during init there are none. `test/copies.ts`
    makes a copy under a random name, runs each statement on a connection of
    its own, and drops the copy after the test without `FORCE`, which Postgres
    12 lacks, so a session a test leaves open fails that test. `ci.test.ts`
    checks the file is mounted last, by line, the order CI loads in, and by
    name, the order the image runs them in. A volume made before this has no
    template: `docker compose down -v && docker compose up -d --wait`, as the
    helper's error says.
  - Not done: storing the value lists; a warning when a run writes a snapshot
    over the limit, which would still leave no way to check it; and any
    history of snapshots, which is git's.
  - Not done either: a schema text that does not depend on the session's
    `search_path`. `format_type` and `pg_get_viewdef` qualify only what the
    path cannot see, so a role whose path differs, such as one set to `app,
    public`, writes other column types and another fingerprint for the same
    schema. Fixing the path in `connect`, to `public` say, would change more
    than the text. On a scratch database on the fixture server with `citext`
    in an `extensions` schema, as Supabase installs it, a column's type then
    reads `extensions.citext`, which `typeFamily` does not take for text, so a
    `citext` key column would be shown to the model; and `=` between two
    `citext` columns resolves to text equality, which found 0 of 1 matching
    rows where `citext`'s own found 1, a relationship reported broken. Left
    for T3.2, where `check` compares a snapshot with the database.
- **`dbtruth check` re-measures the snapshot without a model.** Every pull
  request can measure again what the context claims, with no model and no API
  key, and fail the build when the data contradicts it. `check [--snapshot
  <path>] [--fail-on regression|change|never] [--url <url>] [--dotenv <path>]`
  also takes every tunable after its name, which `doctor` does not. `--dotenv`
  is the plan's `--env-file`, as since T1.1. As for `doctor`, options given
  before `check` are the program's and are merged under its own; a spawned
  test gives options on both sides. It reads the settings as a full run does (`setup()` in `cli.ts`, the full run's
  first step moved as it was and now shared by both), then the snapshot,
  before anything connects, then connects with the read-only proof;
  `remeasure` in `check.ts` reads the whole catalog, profiles only the
  relations the claims name, with `samples: false`, verifies the snapshot's
  claims, decides their verdicts with `verdicts()` (the plan's flow says
  `assemble`, which adds only what the writer needs) and compares them with
  `diff`. The report goes to stderr; stdout stays empty. On
  the fixture it takes a tenth of a second, and the command 1.2 seconds
  started through `tsx`. Exit 0 when it passes under
  `--fail-on`, 2 when it fails, 1 when it cannot run.
  - **Stored queries are never run, or printed.** A pull request can edit the
    snapshot, so it is untrusted input (R8): every statement is built again by
    `extract` and `verify` from the catalog read now, through `q()` and
    `qualified()`, as in a full run, and a name a claim holds is only a key
    `findTable` looks up there. A name the catalog lacks is unverifiable
    without a statement, as it always was. A test turns a real snapshot
    hostile, a relationship from `orders"; DROP TABLE customers; --` and a
    suspicion on the column `status" FROM orders; SELECT pg_sleep(60); --`,
    both confirmed, and every stored query `SELECT pg_sleep(60)`; of the
    statements `remeasure` sends, none holds `pg_sleep`, `DROP` or either name,
    both claims are stale, and the check exits 2 in well under the statement
    timeout. The plan's `extractRelations` is `readCatalog` and `extract` over
    the entries the claims name (T3.1); a second test checks a single claim and
    finds only `orders` and `customers` in every statement inside the budget.
  - **Measured with the snapshot's settings; everything else is this run's.**
    `measuredWith` is laid over this run's config, so a default changed in a
    later release cannot pass for a change in the data; the budget, the
    statement timeout, `extractBudgetShare` and `checkHitRateTolerance` come
    from this run. The plan asks for a note when `measuredWith` differs from
    the current defaults; it is compared with this run's resolved settings
    instead, which are what the claims would be measured with without the
    snapshot's: a team that runs with `--join-confirmed 0.9` everywhere would
    otherwise read the note on every pull request. The note names each setting
    with both values. `parseSnapshot` holds each setting a flag sets to that
    flag's range (T3.1). Two have no flag: the seed stays any number, as
    `REPEATABLE` takes any, and the schema now holds the oversampling to at
    least 1, since at 0 every sample was `LIMIT 0` and every claim on a
    sampled table read as empty, a change no default build fails on. All of
    them reach SQL only as numbers, as flags do.
  - **The rules, in the order that resolves the plan's table.** A claim is
    stale when the database lacks a table or column it names, unless the model
    invented it (next bullet); then the same status is unchanged, or drift
    once a join's hit rate moved by `checkHitRateTolerance` (0.01; R5, with its
    range, variable and flag; a tolerance of 0 still needs a move, and only
    relationships have a hit rate). The move is given `Number.EPSILON` of
    slack: each rate is a quotient rounded to a double, and 410/500 - 405/500,
    one point from 81% to 82%, comes out a hair under 0.01. Then the plan's
    regressions (a relationship
    confirmed to broken or rejected, or broken to rejected; a suspicion
    rejected to confirmed) and improvements (the reverse moves); then a status
    unverifiable on either side is not measured; any other move is changed.
    Where the table has gaps or overlaps: a relationship rejected before and
    confirmed or broken now is changed; a suspicion marked broken, which only a
    hand edit can write, is changed both ways; unverifiable wins over the
    table's "empty to anything"; and a claim the full run could not measure
    (its budget ran out, or the claim's table was dropped to fit the model)
    that `check`, profiling fewer relations, can measure is not measured, not
    changed, since under `--fail-on change` that would fail every build on an
    unchanged database and no rerun could fix it. The unit tests hold the
    plan's table row by row, and the five by five matrix of statuses for each
    kind of claim.
  - **Stale needs a name that was there.** Read as written, "a claim naming
    something that does not exist is stale" fails every check, forever, for a
    table the model invented, which the full run already reported as
    unverifiable. So a claim with a name missing now is stale unless the
    snapshot's schema lacked one of its names too and the snapshot could not
    measure it. A claim the full run could not measure on names its schema
    had, past the statement timeout on a large table or over budget, is stale
    once one of them is gone; and one the snapshot says it measured is stale
    on a missing name even when its schema lacks the name, which only a hand
    edit writes, as the hostile test does.
  - **A relation gone from the database is stale too.** The plan's table has a
    relation in the database that the snapshot lacks; its mirror, one in the
    snapshot that the database lacks, is stale as well, since the context still
    describes it. Names are compared exactly, and a relation the full run
    listed without examining it (T3.1's `examined: false`) is in the context
    all the same.
  - **One line per item that is not unchanged.** The plan prints a line per
    regression and stale item. `--fail-on change` fails on drift and
    improvements as well, and a failed build must say which claim, so every
    item but the unchanged ones gets its line: the class, the claim, its status
    and hit rate in the snapshot and now, and why it could not be measured now
    when it could not. The line holds no query, and a suspicion's line no
    numbers: the verdict measured now carries both in `CheckReport` (R7), for
    T3.3's `--json`, and a full run writes them into `context/`. Then the
    count of each class, and the fix, `run npx dbtruth and commit context/`,
    when anything but unchanged or not measured was found, which is what
    `--fail-on change` fails on. Another database's name, other settings and a
    changed fingerprint are `note` lines, which never fail.
  - `CheckReport` lands here as a TypeScript type in `schemas.ts`; T3.3 makes
    it a zod schema for `--json`.
  - `check.ts` imports `type Db` from `safety`, so `safety` joins its entry in
    `structure.test.ts` for that type alone, as `write.ts` imports `model` for
    its types; decided by the lead. A new structure test walks the imports from
    `check.ts` and `snapshot.ts` and fails if either reaches `model.ts`.
  - This path has no transport for the plan's "a transport that throws" to
    replace. A spawned `check` with `ANTHROPIC_BASE_URL` set to a local server
    that records every request exits 0, and the server records none. It runs
    with a key, as in a CI job that also runs a full run, since without one the
    SDK sends nothing whatever `check` does; a second run with no key exits 0
    too. With the structure test, that is the proof of R9.
  - `doctor`'s line for a missing key is now `note no API key: a full run needs
    ANTHROPIC_API_KEY; doctor and check do not`, as the entry on doctor's
    `note` marker said it would be (0.2.0), and `NO_KEY` in `doctor.test.ts`
    with it.
  - Test changes, none to an assertion: the canned claims, files and fake model
    moved from `integration.test.ts` to `test/canned.ts`, which the new
    database tests share; `copyOfFixture` also returns the copy's name, which
    the report's last line prints; the structure map and `NO_KEY` above; and
    the two test lists in `package.json`. In `acceptance/checks.json`, T1.5's
    check of the commands list no longer expects `check` to be coming. One
    assertion is added to `snapshot.test.ts`: an oversampling of 0 is refused.
  - The session's `search_path`, left here by T3.1: `check` looks names up to
    decide what is stale and never compares types, which enter only the
    fingerprint, so a role whose path spells a type another way gets the note
    that the schema changed, never a failure. The path itself is still not
    fixed.
  - Not done: escaping names on stderr, where a name holding a newline could
    forge a report line (T3.3's Markdown must escape them); a note when the
    server's version differs; `verify` saying that a relation was not examined
    rather than `unknown table <name>` when the budget skipped it, a reason
    every `not measured` line of a budget-starved check now prints; `--json`
    and `--markdown`, which are T3.3's. Two limits stay: the pull request
    controls the snapshot it is checked against, which the README says to
    review like code, and a claim the snapshot never measured fails a build
    only once a name it uses is gone, so any other break on it waits for the
    next full run.
- **The README says what a team will pay for, with the price and the waitlist
  left to a person.** The paid tier of the plan's section 2 is the GitHub
  Action on private repositories. A section, "Team tier", says so before the
  Action exists, so the line between free and paid is written down before
  anyone depends on either side: what the Action will do there (the pull
  request comment and the regression gate), what stays free forever (the
  CLI, the skill, the Action on public repositories), and that no database
  content passes through a server of ours, since users bring their own model
  access and `check` needs none. The Action, `init`, `mcp` and the skill are
  planned and not built, so each is called coming, as the Commands list calls
  `init` and `mcp`, and nothing is named that the plan does not have. It also
  says what the license check of T6.2 will send, the key and the repository's
  id, and that an outage of it will not fail the job: that check is the one
  call the paid tier adds, and the promise would be incomplete without it.
  - **Where it sits.** The plan puts it after a "CI" section, which T4.1
    writes with the Action and which does not exist yet. It sits after
    "Keeping context true: dbtruth check", the nearest section, and T4.1
    moves it after its CI section.
  - **HUMAN, not done:** deciding the price, making the waitlist form (email
    only), and replacing `PRICE_TBD` and `WAITLIST_URL` in the README with
    them. Until then the section shows both placeholders, and nothing records
    these as done.
  - **Tested where a script can judge.** `test/readme.test.ts` fails when the
    section is missing; when it has no price per team per month or no
    waitlist link, a placeholder or, once a person sets them, an amount and an
    `https` link, so that edit needs no change to the test; when it names a
    command that `cli.ts` does not define and the Commands list does not mark
    as coming, or leaves one out of the sentence on what stays free forever,
    even `check`, which other sentences name too; and when a clause
    names a command not built without "coming" before it, or a built one
    after it, such as one built since and still called coming here. A command
    is named in a code span, with or without `npx dbtruth` before it and
    options after it. The word marks every command after it in its clause and
    none before, so "`mcp` is coming" fails where "the coming `mcp`" passes.
    The rest of "nothing promises a feature that is not built or planned",
    the sentences about the Action, the skill and the license check, was
    checked by hand against the plan, sentence by sentence (PROGRESS.md,
    T6.1).
  - Not done: a release number for what is coming. The Commands list gives
    one for `init` and `mcp`, and the Action is versioned in its own
    repository.

- **A failed check keeps its whole output.** The acceptance script prints
  the first 20 lines of a failed check, as the plan says; for `npm run
  verify` those are npm's preamble, and a rare failure of that gate (three
  times in some forty runs, never outside an acceptance run) was cut off each
  time. The whole output is now also written to a file in the temporary
  directory, and its path printed beneath the 20 lines.

## Where string matching does appear, and why it is syntax, not meaning

- `typeFamily` in `safety.ts` names the Postgres type families whose values
  are free text or dates. It decides visibility by type, which the spec
  allows; it never reads a column's name or values.
- `schemas.ts` matches a claim's table name to an extracted table (exact,
  then case-insensitive, on the display or the qualified name) when the
  model's reply is validated, and spells it as the extract does from then on.
- `safety.ts` checks that a statement begins with SELECT or WITH, quotes
  identifiers, and parses one line of `.env`.
- `verify.ts` recognises timestamp types for the dead-table measurement.
- `write.ts` normalises output paths into `context/`.
- Verdict ids are prefixed `relationship:` / `suspicion:` so the exit code and
  the summary can tell them apart.

## Known limits, deliberately not fixed

- **The join measurement is unconditional.** It asks whether every non-null
  value of the from-column exists in the to-column. A polymorphic column
  (one that points at different tables depending on a sibling column) can
  therefore hit 100% against several tables by coincidence of small integer
  ids, and each would be stated as a fact. The first live run did exactly
  that. Prompt A now defines a relationship as unconditional and sends
  polymorphic references to a suspicion of kind `other`, which is labelled
  inferred, and every run since has behaved. The measurement itself still
  cannot express "only where entity = x"; that would be a conditional join
  claim, allowed fix 3, and was not added because the prompt fix held.
- `WITH` is accepted by the statement guard because verify uses CTEs. A
  data-modifying CTE would be refused by the read-only session anyway.
- Structured outputs (`output_config.format`) could replace JSON extraction
  for both prompts now that prompt B returns two fixed keys. One mechanism
  (extract, validate, retry once) still serves both.
- **One sample, one target.** Every measurement over a table larger than
  `sampleRows` reads the same `TABLESAMPLE` pages (`sampleSeed`), so the
  statistics the model saw, the value lists and the join hit rate agree, and
  the query in every verdict reruns to the same numbers. A second sample would
  measure sampling variance, which at this sample size moves a 95% proportion
  by about a tenth of a point, and would not catch a coincidental match: a
  dense small-integer column (quantities, years, small lookup ids) that hits
  100% against an unrelated key does so on every sample, because the
  coincidence is in the data. Sweeping every type-compatible target per claim
  would multiply statements by the table count and report joins nobody
  claimed. The defence is the claim: prompt A proposes joins from names, types
  and constraints, and routes polymorphic references to a suspicion.
- **The value-length gate is a length, not a shape.** A text column is
  categorical only if it has few distinct values and none longer than
  `categoricalMaxValueLength`. That hides MD5 (32), SHA-1 (40), bcrypt (60)
  and tokens, and it also hides a genuine enum whose labels run long. The
  model still sees the column's name, type, null rate, distinct count and
  longest value, so it loses little. Judging values by character class or
  entropy would be closer to "what does this value mean", which the rules
  forbid.

## Timing

- The spec asks for the fixture run to finish in under 60 s. At the default
  effort (`high`) live runs took 101 s, 68 s and 86 s; `medium` took 79 s;
  `low` took 40 s with identical findings on the fixture. The database took
  0.1 s every time; the rest is two calls to `claude-sonnet-5`.
- 0.1.4 replaced the fixed default with effort by schema size. Measured at
  the defaults afterwards: fixture 51 s and 47 s (effort low, 1,125 schema
  tokens), so the 60 s target is met; Pagila 81 s at low (3,842 tokens) with
  the same findings as the earlier runs at high (162 to 241 s), including all
  21 declared foreign keys confirmed and the partition, activebool and
  original_language_id observations. The bands stay at 4,000 and 12,000
  tokens until a database shows that low is too shallow for its size.

## README

- Section 5 of the spec is rendered for a reader rather than pasted with its
  build instructions ("build first", "put this in the README"). Every rule in
  it is present, in the same order, above the fold.
- The fixture output is pasted from a live run.
- `docs/demo.gif` is rendered by `scripts/render-demo.py` from the real
  terminal output of a fixture run and the real query results on the fixture
  (440 orders with an inner join, 500 with a left join, 60 in `unknown`). It
  is not a screen capture; every line in it is genuine.
