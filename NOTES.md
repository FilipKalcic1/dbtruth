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
- **`dbtruth init` writes a `.env` to fill in, and says what to do next.** A
  first run needs a settings file with the right lines in the right place;
  `init` writes it, so the next command, `doctor`, has a file to read and to
  name. It writes at the repository root, found by T1.1's rule
  (`repositoryRoot` in `safety.ts`, now exported, so there is one walk), or in
  the working directory outside a repository; says what it did on stderr,
  stdout staying empty (R6); and exits 0, or 1 when it could not write.
  `runInit` is one function, so it sits in `cli.ts` beside `runCheck` rather
  than in a module of its own; the plan's module map (Appendix B) has none
  for it.
  - **The file is the quick start's, commented out.** `DATABASE_URL` and
    `ANTHROPIC_API_KEY` as the quick start writes them, and `ANTHROPIC_MODEL`
    set to the default, `DEFAULT_MODEL`, so that uncommenting it changes
    nothing; each behind `# `, under two comment lines of their own.
    `readEnvFile` reads a value to the end of its line (above, "The quick
    start's `.env` had a comment the parser keeps"), so no comment shares a
    line with a setting. `test/init.test.ts` reads the file as written with
    `readEnvFile` and finds no setting; then it uncomments one line at a time,
    as found whole after `# `, and finds that setting alone, with the quick
    start's value.
  - **It changes no file that exists.** A `.env` file already there is left
    as it is, and `init` says so and goes on. Otherwise the file is opened
    with `wx`, which fails rather than open anything that is there: a file
    that appeared since the check, a dangling link, or a directory named
    `.env`, such as a Python virtualenv. That directory is not a settings file
    (T1.1), and none can be written in its place, so `init` stops with `could
    not write .env: EEXIST: ...` and exits 1; the row for that message says to
    rename it or use `--dotenv`. The tests compare every file under the
    repository, `.git` included, byte for byte, before and after.
  - **Git judges whether `.gitignore` ignores `.env`.** `init` runs `git -c
    core.excludesFile= check-ignore --quiet --no-index .env` on the directory
    it writes to and never reads `.gitignore` itself. Its patterns are easy to
    read wrong by hand: `*.env` and `.env*` cover `.env`, `.env/` covers only
    a directory, and a later `!.env` takes an earlier pattern back. The plan
    asks about `.gitignore`, the file every clone shares, so the user's own
    ignore file (`core.excludesFile`, by default `~/.config/git/ignore`) is
    left out: a rule there covers one machine, and a teammate who writes a
    `.env` in a clone without it would commit the file. `--no-index` judges
    the patterns alone: without it, a `.env` git already tracks counts as not
    ignored even when `.gitignore` lists it, and the warning would ask for a
    line that is there. Exit 1 gives `WARNING: .gitignore does not ignore
    .env; add this line to it: .env`, with both paths relative to the working
    directory. No answer gives a warning that git could not say, with the same
    line: outside a repository, where the plan makes no exception and the
    directory may become one with the `.env` in it; with git missing from the
    `PATH`; or in a repository git refuses, such as one owned by another user.
    Git is started in the temporary directory and pointed at the repository
    with `-C`: on Windows a bare command name is looked for in the working
    directory before the `PATH`, unless `NoDefaultCurrentDirectoryInExePath`
    is set, as Git Bash sets it, so started at the root it would run a
    `git.exe` the repository holds. The tests make real repositories with `git
    init --template=` and cover no `.gitignore`, `.env`, `/.env` with CRLF,
    `.env*`, `*.env`, `.env.local`, `.env/`, `.env*` then `!.env`, a personal
    ignore file that lists `.env`, a tracked `.env` that `.gitignore` lists,
    an empty `git.exe` at the root, git missing from the `PATH`, and no
    repository.
  - **The next steps are the README's.** The plan's list without what is not
    built: fill in `.env`, run `npx dbtruth doctor`, run `npx dbtruth`, and
    add the line for `CLAUDE.md` under "Giving it to your agent". The quick
    start shows them as `init` prints them, in the block after its paragraph
    on `init`, and `test/init.test.ts` takes that block as the expected output
    and checks that its line for `CLAUDE.md` is the one under "Giving it to
    your agent", so none of the three can change alone. `init` keeps its own
    copy rather than read `README.md` at run time: the file ships in the
    package, but reading it would put a Markdown parser in the CLI, and a
    failure no user could fix.
  - **Not built here: `--skill` and the `claude mcp add` line.** They need the
    skill file of T5.2 and the MCP server of T5.1; each task adds its part to
    `init` when it lands. No option or placeholder stands for them now, so
    `init --skill` is refused as an unknown option.
  - Changed with it: the quick start, the Commands list and the Team tier's
    sentence on what stays free forever no longer call `init` coming, and the
    row for an unknown command names only `mcp` as not built;
    `test/readme.test.ts` reads what is built from `cli.ts`, which now defines
    `init`. In `acceptance/checks.json`, T1.5's two checks that expected
    `init` to be coming, `readme-init-coming` (now `readme-init`) and
    `readme-commands`, expect it built. The row for `could not write <path>:
    <error>` covers `init`'s, and each new message has its own.
  - Not done: editing `.gitignore`, which the plan rules out; leaving out
    `.git/info/exclude`, which is one clone's too but which `check-ignore`
    has no option to skip, so a `.env` listed only there gets no warning;
    saying that a `.env` git already tracks is committed, which `git rm
    --cached` settles, not this command; from a package that has a `.env` of its own, saying that
    a run there reads that one and not the root's; and a `.env` anywhere but
    the root.
- **A polymorphic reference is measured one branch at a time.** A column
  such as `comments.commentable_id` points at `posts` where
  `commentable_type` is `post` and at `photos` where it is `photo`. Measured
  whole, its matches are split over the targets, or a coincidence of small
  ids passes for a join: on the new `polymorph` database,
  `comments.commentable_id -> posts.id` matches all 480 rows, since every
  photo id from 1 to 60 is also a post id, while the photo branch is broken,
  120 of 180. Until now prompt A sent such a column to a suspicion of kind
  `other`, which nothing measures. A relationship may now carry `"when":
  {"column": ..., "equals": ...}`, and each branch is a claim with its own
  verdict.
  - **The id ends in `[column=value]`,** the plan's raw form:
    `relationship:comments.commentable_id->photos.id[commentable_type=photo]`.
    Names are already printed raw, and nothing reads an id back. With the
    condition in the id, `claimsSchema` needs no change: two branches stay
    two claims, and one branch given twice is one. `when` is optional, not
    nullable, so a `null` goes back to the model like any other invalid
    reply. The value is free text, from the model or from a snapshot, and is
    printed raw on stderr as a name is, which T3.2 left not done; T3.3's
    Markdown must escape it.
  - **The condition filters the one sample.** Where the join read the
    sample, it reads `(SELECT * FROM <sample> w WHERE w."<column>"::text =
    $1)`, so a branch is measured on the pages every other claim on its table
    reads, and its numbers are over its own rows. Both forms of the join take
    the filter: the probe of the key, and the comparison as text. The column
    is compared as text, the form its values were listed to the model in: on
    `polymorph`, `invoices.account_id` equal to `5` selects 4 rows and `05`
    none, where a comparison of integers would take both for 5.
  - **The value is only ever `$1`.** `querySampled` and
    `runWithTextFallback` take bind parameters and send them with every
    attempt: the plain form after a refused sample, and the comparison as
    text after a datatype mismatch. Without any, pg keeps the simple
    protocol, as before. The value comes from the model, in `check` from a
    snapshot a pull request can edit, and in T5.1 from an agent (R8); the
    column must be one of the from-table's in the catalog, and is quoted with
    `q()`. A test gives a
    branch the value `x'; DROP TABLE posts; --`: it is empty, no statement
    holds the text, and `posts` keeps its 100 rows. In `check`, a snapshot
    edited to name the column `commentable_type" = 'x' OR true; --` makes
    that branch stale with no statement run, and a NUL in a value, which no
    Postgres text holds, is refused by the server (22021): unverifiable.
  - **The stored query ends with the value.** The statement run has no
    comment. The query kept in the verdict is that statement and one line
    after it, as the plan has it, `-- $1 = 'photo'`, the value written as SQL
    writes a string: quotes doubled, and a value with a line break in the
    `E''` form, its backslashes, `\n` and `\r` escaped, so the note stays one
    line and cannot end early (`sqlString` in `schemas.ts`, which `verify.ts`
    and `write.ts` both import; the fixture server read each form back as
    its value). A test reruns a kept query as it is, its value bound, and
    gets the verdict's numbers: the query still starts with `SELECT`, which
    is all `safety.ts` lets through, and Postgres skips the closing comment.
    The per-table file writes the condition with the same literal, which an
    agent can paste into a `WHERE`: `comments.commentable_id -> photos.id
    when commentable_type = 'photo'`.
  - **A condition must be on a categorical column.** On a column the
    from-table lacks, a branch is unverifiable, as for any unknown column; on
    one that is not categorical on the sample, too, with `<table>.<column> is
    not categorical, so no condition on it is measured`. The column must be
    visible, with no more than `categoricalMaxDistinct` values, none longer
    than `categoricalMaxValueLength`, as the columns prompt A is given a
    `values` list for are. A count under a guessed value of a hidden column
    would say whether that value exists, and a snapshot's `when.equals`, or
    T5.1's `measure_join`, could ask one guess at a time (R3). A key is
    visible without being categorical, and a condition on it narrows the
    join to one row, whose hidden from-column the counts then describe: on
    `polymorph`, `id = '42'` selects one comment. The bounds keep out a key
    with more values than `categoricalMaxDistinct`. The key of a table no
    larger than that, and a value that one row alone holds in a categorical
    column, narrow as far and get through; that is not closed. Leaving out
    declared keys instead would also leave out a foreign key that is itself
    the discriminator, such as a `commentable_type_id` with a few values.
    The plan is silent on all this. An empty table is empty before its
    condition is judged, since none of its columns shows a value. A column
    shown with `--reveal` is visible only in the run that reveals it, and
    counts only within the same bounds, so a full run and `check` differ on
    it only when no value repeats on its sample: a branch on it is then `not
    measured` in `check`, which fails no build.
  - **In `check`, a snapshot cannot widen what is categorical.** There the
    snapshot's settings decide what looks categorical, and a pull request
    can edit them: under `categoricalMaxDistinct` 1000000 the guess
    `comments.commentable_id = '57'` was measured, 6 sampled rows, and a
    smaller `sampleRows` does the same, since on a few rows most short
    columns repeat a value. So when the snapshot's bounds are wider than
    this run's, or its sample smaller, `remeasure` takes no column as
    categorical and every branch is `not measured`; the note on settings
    names what differs. Every other claim is measured as before: only a
    condition reads whether a column is visible in `check`. The seed, the
    oversampling and the pilot pages move which rows a sample reads more
    than how many, and stay the snapshot's.
  - **A dropped condition column makes the branch stale.** `check` counts
    the column a condition names among a claim's names, so a pull request
    that drops `commentable_type` fails the build, as one that drops the
    from-column does. T3.2 named only a join's two columns.
  - **Prompt A.** The bullet that read "A relationship must hold
    unconditionally: every non-null value of the from-column should be a key
    of the to-table. A column that points at different tables depending on
    another column (a polymorphic reference) cannot be tested as a join.
    Report it once as a suspicion of kind "other", naming the column,
    instead of one relationship per possible target." now reads "A
    relationship holds on every row it covers: every non-null value of the
    from-column should be a key of the to-table. A column that points at
    different tables depending on another column of its table (a polymorphic
    reference) is one relationship per value of that other column, each to
    the table that value selects, with "when": {"column": that other column,
    "equals": the value, exactly as its "values" list shows it}; each is
    measured on its own rows. When that column has no "values" list, the
    reference cannot be tested: report it once as a suspicion of kind
    "other", naming the column, instead of one relationship per possible
    target." One per value, as the plan asks, not one per target: two values
    can select one table, and each covers rows of its own. The schema at its
    end gains `"when"?`. Prompt B is told that a relationship with `when`
    holds on those rows only, and to give each branch with its own verdict
    and numbers, never merged.
  - **The snapshot format stays 1.** `when` is a key that a reader of format
    1 without it would drop, reading each branch as the whole join, and such
    a key raises `SNAPSHOT_FORMAT` (0.3.0). No release that writes snapshots
    has shipped, so no such reader exists; decided by the lead. Were one to
    ship first, the format would be 2, and the reader would take both.
  - **The `polymorph` database** (`test/fixtures/polymorph.sql`, mounted as
    `60-polymorph.sql`, before the template) holds the reference above, and
    two of the tables T2.4 adds to it: `accounts`, with ids 10 to 19 missing,
    and `invoices`, pointing at all 50, whose `account_id`, an integer with
    50 values, is here the condition on a column that is not text. Its text
    columns hold `canary-pii` and are hidden.
    A volume made before it loads it with `docker compose down -v && docker
    compose up -d --wait`, or, into the running server, `docker compose exec
    -T db psql -v ON_ERROR_STOP=1 -U dbtruth -d fixture <
    test/fixtures/polymorph.sql`. Its tests are in `test/joins.test.ts`,
    under `test:db`.
  - One test helper changed, and no assertion: `fakeDb` in `verify.test.ts`
    records each statement's parameters beside its text.
  - Not done: a condition on the target's side; one on several columns, or
    on a list of values; one on a column that is not categorical; and
    finding polymorphic columns in code, from a sibling named like `_type`,
    which reads names for meaning (R4). The model proposes the branches, and
    the database measures them.
- **A broken join into an integer key says where its orphans fall.** An
  orphan count said how many rows point nowhere, not where they point, and
  each place asks for a different fix: past the highest key, parents never
  loaded or ids from another sequence; inside the key's range, deleted
  parents; below the lowest key, ids from another source. On the fixture
  all 60 orphans of `orders.customer_id -> customers.id` are above the
  highest `customers.id`; on `polymorph` the 40 of `invoices.account_id ->
  accounts.id` are inside its range, the 5 of `refunds.account_id ->
  accounts.id` below it, and the 60 of the photo branch above the highest
  `photos.id`.
  - **Two counts in the join's own statement.** Where the key is probed,
    the statement also returns `count(*) FILTER (WHERE col > (SELECT
    max(t.<key>) FROM <target> t)) AS orphans_above`, and the same with
    `min` and `<` as `orphans_below`. The plan writes `<orphan> AND col >
    max`; a value past either end of the key matches no row of it, so it is
    an orphan already and needs no second probe. Each end is a subquery
    that does not depend on the row, which Postgres runs once, as a lookup
    in the key's index. The ends are compared inside the database and only
    the counts come back (R3): a test reads every row such a statement
    returns on `polymorph` and finds exactly `total`, `nulls`, `hits`,
    `orphans_above` and `orphans_below`. The query kept is the statement
    run, so it reruns to the same counts.
  - **Only integers, and only where the key is probed.** Both columns must
    be `smallint`, `integer` or `bigint` as the catalog writes their types
    (`isIntegerType` in `safety.ts`), and the target column must lead the
    target's primary key, which is when the join probes it and when its
    `min` and `max` are index lookups.
  - **Two numbers, not three.** `orphansAbove` and `orphansBelow` join the
    measurement when the row the statement returned has them; the orphans
    inside the range are the rest, worked out where they are written. Every
    join measured that way carries them, whatever its verdict, in the JSON,
    the snapshot and what prompt B is sent; `check` still compares a
    verdict's status and hit rate only.
  - **The file states the place, and prompt B gets the hint.** A broken
    line's orphan count says where they fall, as the plan writes it: "60
    orphans, all above the highest customers.id", "40 orphans, all inside
    the accounts.id range", "5 orphans, all below the lowest accounts.id",
    or, when they fall in more than one place, "60 orphans, 48 above the
    highest customers.id and 12 inside the customers.id range", before
    "(inferred)". It gives no cause, and a test holds every per-table file of both runs to
    that. Since A3 changes this line, two existing assertions change with
    it: the `orders` line in `test/integration.test.ts` and the photo
    branch's in "the per-table files show each branch with its condition"
    (`test/joins.test.ts`) now read the count with its place. Prompt B is
    told what the two numbers count, and a rule: where a broken
    relationship's orphans fall is a hint, not a proven cause, with what
    each place usually means.
  - **`polymorph` gains `refunds`,** for orphans below a key:
    `refunds.account_id` holds -1 to -5, below account 1, and 21 to 35,
    which all exist, so 15 of 20 match (75%). It has no key. It was
    designed with the rest of the fixture, for this task, and T2.3 left it
    out, since nothing of T2.3 read it. A volume made before it is rebuilt
    with `docker compose down -v && docker compose up -d --wait`; loading
    `polymorph.sql` into the running server fails once `polymorph` exists.
    In `test/joins.test.ts`, `offline()` now takes the URL and the claims,
    `polymorph` and T2.3's claims unless told otherwise, so this task's
    tests run the fixture and claims of their own.
  - The README's fixture output predates this and is regenerated at release
    (T7.1).
  - Not done: where the orphans fall against a key of text, uuid or dates,
    or of more than one column.
- **A join confirmed on inference says when its values would fit other keys
  too.** A column of small integers matches any key that holds those
  numbers, so its hit rate alone cannot tell a join from a coincidence. On
  the fixture, `order_items.quantity -> products.id`, a quantity from 1 to 5
  against 80 products, matches all 1,200 sampled rows and was reported
  confirmed, and the fixture's five other single-column integer keys hold 1
  to 5 as well (section 1 of the plan, defect 3). The join keeps its verdict
  and now says so: `candidates` 5 and `alsoFits` 5, the per-table line
  `confirmed, 100.0% of 1200 sampled rows match (inferred; the same values
  would also match 5 other keys, so the match alone does not prove this
  join).`, prompt B's rule that such a join is not stated as fact, and the
  summary `relationships: 3 confirmed (1 on weak evidence), ...`. Verdicts
  and exit codes do not move.
  - **Neither a second sample nor a sweep.** A second sample repeats the
    coincidence, which is in the data, and trying every compatible target
    per claim multiplies the statements by the tables and reports joins
    nobody claimed ("One sample, one target", under Known limits). This asks
    one question of each join the model claimed: how many keys that exist
    would hold every value it holds.
  - **Which joins.** Basis `inferred`, measured at `join.confirmed` or above,
    from a `smallint`, `integer` or `bigint` column (`isIntegerType`), and not
    a declared foreign key, which Postgres enforces whatever basis the claim
    gives it: the model can call a declared key inferred, and
    `order_items.product_id -> products.id` would otherwise read 4 of 5,
    since `products_legacy` stops at 70. So `verify.ts`, which read no
    threshold, reads `join.confirmed`, to pick the joins worth weighing and
    for nothing else; its header says so, and `decide` is unchanged.
  - **Which keys.** The first `weakEvidenceMaxCandidates` relations, in
    catalog order, keyed by one integer column and holding rows, sized as
    `extract` sizes them (`integerKeys` in `extract.ts`, `estimateRows` with
    the same pilot): a key the catalog cannot size, never analyzed or loaded
    since, is piloted, and a partition never analyzed that has no pages holds
    nothing. Sized by the catalog alone, a database loaded since its last
    `ANALYZE` would weigh a join against no key, or against the few analyzed,
    and an `alsoFits` of 0 would read as strong evidence. From the catalog,
    not the extract: `check` profiles only the relations its claims name,
    and a full run's extract depends on the budget and on fitting, so the
    two would weigh against different keys; the pilot takes the seed and
    `pilotPages` the snapshot was measured with, so both size a key alike.
    `verify` is handed a function that returns the keys, so that they are
    sized, as they are probed, only when a join is weighed. The cap is
    applied before the target is left out, so every join of a run is
    weighed against the same probed keys. A key counts when its rows fill
    `denseKeyShare` of the values from its lowest to its highest: one probe
    per key, once per run, that returns the span, how many values that is,
    and never an end, as in `SELECT max("id")::numeric - min("id") + 1 AS
    span FROM "public"."customers"`. The share and the key's size are
    compared in Node, as in the plan, so no setting becomes SQL text (R8).
    The span is taken in numeric: the plan's `(max - min + 1)::float8`
    overflows a bigint key before the cast. A key that is empty, that the
    role cannot read (42501), that times out or is past the budget drops out
    alone, where one statement over every key would fail whole on one table
    the role cannot read. A join is compared with neither its target nor its
    from-column's own key.
  - **Two counts, compared in the database.** One statement per weighed
    join, over the rows its join statement read: the same sample and, for a
    branch (T2.3), the same condition with the same `$1`. It pairs the
    column's `min` and `max` on those rows with each key's, one `SELECT
    min(key), max(key)` per key joined by `UNION ALL`, and returns
    `candidates`, the keys compared, and `also_fits`, those whose range holds
    both. No end of any column leaves the database, a key's included, and a
    bigint key's ends are compared as bigints. Out of budget, or refused, the
    measurement stays as it was, and nothing is claimed either way.
  - **Not the plan's statement.** The plan reads each key's `lo` and `hi`
    once per run, which R3 allows for a key, and binds the dense ranges back
    as numeric parameters in a `VALUES` list, the stored query naming the
    keys in a comment. This statement reads every key's ends again in each
    weighed join, two index lookups per key, and its stored query is longer:
    4,540 characters at 49 keys, where a pair of parameters and a name per
    key would take about half. In exchange it reruns as it is (R7), where
    the plan's needs each named key's range looked up and bound by hand, and
    it binds no value but a branch's, so T2.3's test that `check` under
    wider settings binds none holds unchanged; the plan's ranges would fail
    it. Put to the lead (PROGRESS, T2.2, iteration 2).
  - **Last.** The weighing runs after every claim is measured, so a note on
    one join never costs another claim its measurement.
  - **The query kept** is the join's statement, `;`, then the weighing. A
    branch's note stays last, as T2.3 has it, and gives the value both
    statements bind: `-- $1 = 'post'`. A test splits the post branch's
    query at the `;`, reruns each statement with `post` bound, and gets the
    verdict's numbers. The rows and the note of a branch come from one
    helper again, `claimRows`, which T2.3 folded into its one caller.
  - **`check` weighs alike.** `remeasure` hands `verify` the keys of the
    whole catalog: on the fixture with the quantity claim, `check fixture:
    14 unchanged`, each verdict the snapshot's, queries included. Both
    settings go into `measuredWith`, optional, since a snapshot written
    before them has neither and is weighed with this run's; `parseSnapshot`
    holds them to their flags' ranges. `diff` reads status and hit rate
    only, so `alsoFits` moves no class.
  - **Tunables (R5).** `denseKeyShare`: 0.9, from 0 to 1,
    `DBTRUTH_DENSE_KEY_SHARE`, `--dense-key-share`. `weakEvidenceMaxCandidates`:
    50, a whole number of at least 0, 0 turning the weighing off,
    `DBTRUTH_WEAK_EVIDENCE_MAX_CANDIDATES`, `--weak-evidence-max-candidates`.
  - **Measured.** On the edge cases, in a copy of `fixture_template`: a key
    never analyzed is piloted to its 1,000 rows and counts; an emptied key,
    one filling 100 of 991 values and a bigint key from its lowest to its
    highest value are left out by default, and the last two count at
    `denseKeyShare` 0; ids from 2^53 do not fit a key starting at 2^53 + 1;
    a cap of 3 probes the first three keys that hold rows, in catalog order,
    and compares the two that are not empty. On
    `polymorph`, `accounts`, with 40 of its 50 ids, is left out, and the
    photo branch is broken, so not weighed; the whole join, the post branch
    and `invoices.account_id = '5'` are, 2 of 3, 2 of 3 and 4 of 4.
  - **Test changes.** Two the lead approved. `verify()` takes the keys as a
    fifth, required argument, a signature change flowing to its callers as
    T3.1's catalog argument did, here a function that returns them: the 21
    calls in `verify.test.ts` gain `, noKeys`, a function that returns none,
    with no assertion changed, and with no key nothing is weighed. The
    deep-equal of `measuredWith` in `snapshot.test.ts` gains the two
    settings. And two the weighing brings. A weighed branch binds its value
    to a second statement, so "a discriminator value is always a bind
    parameter, ..." (`joins.test.ts`, T2.3), which lists every statement
    that binds one, expects two more, the weighing of the `post` and `5`
    branches, each with its own value; `offline()` there takes the tunables
    to set. And `write()` holds what prompt B is sent itself (below), so it
    takes the model's limits and returns the files with the note: the two
    calls in `write.test.ts` ("the model writes README and ENTITIES; ..."
    and "a reply without both files ...") pass `config` and read `files`,
    with no assertion changed.
  - Not done: a note on a broken join; keys of uuid, text or more than one
    column; a hit rate per key compared. Almost every inferred integer join
    will carry the note, since a larger table's ids usually cover a smaller
    one's: the plan's own five include `order_items.id`, the quantity's own
    table's key. Accepted by the lead, and to be judged on Pagila at release
    (section 5.5 of the plan).
    The README's fixture output, written by the model, shows the note only
    if the model claims such a join when it is regenerated at release
    (T7.1); until then A4 of T2.2 is judged on the per-table file, prompt
    B's rule and what prompt B is sent.
- **What prompt B is sent is held to the model's input ceiling.** `write()`
  sent `Verified` whole, and nothing held it to `modelMaxInputTokens`; the
  weighing makes it much larger. A weighed join's query is about 4.6 KB at
  the default cap. On `scale`, whose 300 claimed joins are each weighed
  against 49 keys, `Verified` is 1,652,576 characters, 413,144 tokens at four
  characters a token, against 271,484 characters with the weighing off: a
  database that size would fail at the API after contextualize was paid
  for. `fitForWriter` in `write.ts` measures it as `fitToContext` measures
  prompt A's extract. Over the ceiling, the copy prompt B is sent has every
  verdict's query empty, 141,496 characters, 35,374 tokens on `scale`; every
  number is sent, every query stays in `--json` and the snapshot, and the
  per-table files show none. If that is still over the ceiling, prompt B is
  not called: the per-table files and the snapshot are written, README.md and
  ENTITIES.md are not, and the last run's are removed. Not sent, rather than
  the run stopped: the measurements are paid for by then, and `check` needs
  only the snapshot. The line that starts `write:` ends with the note, as
  the disclosure line does for prompt A, and both notes share a
  troubleshooting row. Prompt B is told a query may be empty. `write()`
  fits what it sends itself, and renders the per-table files from
  `Verified` whole, whatever prompt B was sent.
  - The snapshot keeps the queries: 1,859,232 bytes on `scale`, against
    470,939 with the weighing off. At about 4.6 KB a weighed join, `check`'s
    10 MB limit is reached near two thousand weighed joins at the default
    cap. The default stays 50, as the lead decided; a lower
    `--weak-evidence-max-candidates` shortens every weighed query.
  - Not done: trimming the claims or the tables' values as well, which would
    change what prompt B writes about; a ceiling of prompt B's own.

## 0.3.0 (unreleased)

Built from `BUILD_PLAN.md`, one task at a time; each task's iterations are in
`PROGRESS.md`.

- **Every full run writes `context/snapshot.json`.** `check` (T3.2) needs to
  know what the context claimed and what was measured, in a file that lives in
  git next to the markdown. The snapshot holds its format number, `dbtruth` and
  its version, the database's name, `server_version_num`, the settings a
  measurement depends on (`measuredWith`: the sample size, oversampling and
  seed, `pilotPages`, the join bands, `staleAfterDays`, `duplicateOverlap` and
  the two categorical limits; since T2.2 also `denseKeyShare` and
  `weakEvidenceMaxCandidates`, optional (0.2.0); the schema's `measuredWith` lists them once, and
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
    refuses with its own sentence. Each weighed join adds about 4.6 KB more
    (T2.2, 0.2.0).
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
  relations the claims name, with `samples: false` (since T2.2 it also sizes
  and probes the integer keys of the whole catalog when a join needs
  weighing, with a pilot only for a key the catalog cannot size, 0.2.0),
  verifies the snapshot's
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
- **`check --json` prints the report, and `--markdown` writes it as a pull
  request comment.** `diff()` returns one `CheckReport`, and it is shown three
  ways from one ordering: `rows`, `notes` and `tally` in `check.ts` give the
  items that are not unchanged, most serious first, the notes and the counts;
  `reportLines` prints them on stderr, byte for byte as before, and
  `reportMarkdown` writes them as the comment; `--json` prints the object
  itself. The comment is written first, then the JSON printed, then check
  exits 0 or 2 as before.
  - **The report has a schema and a format.** `CheckReportSchema` in
    `schemas.ts` replaces the TypeScript types, which are now inferred from it,
    as the T3.2 entry said, and its `report` field is `CHECK_REPORT_FORMAT`,
    1, raised as `SNAPSHOT_FORMAT` is, whenever a reader of an older format
    would misread the report. Nothing parses the report at run time: the
    schema is the contract for the Action (T4.1), `mcp` (T5.1) and the tests.
    One checks that the reports `diff` returns for a regression and for a
    stale claim, and the fixed report the rendering tests use, each equal
    their own parse, so none holds a key the schema lacks; the integration
    test parses a real `--json` report the same way.
  - **`--json` is the report whole,** each verdict with its query, its
    numbers and the reason it was not measured, as a full run's `--json`
    prints them (R7; R3 lets query text out). Here T3.3's first bullet, the
    `CheckReport` on stdout, and R7 conflict with its third, that both
    formats hold only names, statuses, counts and rates: `--json` follows the
    first two, the comment the third. Put to the lead (PROGRESS, T3.3,
    iteration 2). stdout holds JSON exactly when check exits 0 or 2: nothing
    when it cannot run, and nothing when the comment cannot be written
    (below).
  - **The comment, and why it is laid out so.** The first line is the marker,
    `<!-- dbtruth-check -->`, by which the Action will find its comment; then
    one line of counts. The table holds what fails the default build,
    regressions and stale items; a `<details>` block holds the rest: drift
    and improvements, as T3.3 says, and changed and not measured, the other
    classes of T3.2's table that fail no default build, which T3.3 does not
    place. The columns are Class, Claim, Before and After, with the hit rate
    inside each side. A stale claim's Before is its status in the snapshot,
    which T3.2's line on stderr leaves out; a relation added or dropped has
    none. At most 50 rows, counted over the whole comment in class order,
    then `and <n> more`. The notes, which the plan does not place, come after
    the rows, so that the parts it names keep its order, and are never
    folded, so that the note on other settings, the only sign that a pull
    request edited `measuredWith`, stays in view. Then the fix line when
    there is one. A report whose claims are all unchanged, or that has none,
    with nothing to note gives the marker and the counts alone, the all-clear
    an older comment is updated to; a note or a claim not measured still
    shows.
  - **No query and no reason.** A reason can be the server's words, and a
    comment is mailed to everyone who watches the pull request. The log and
    `--json` keep both.
  - **Names are code spans.** A claim's id carries free text since T2.3, a
    condition's value from the model or from a snapshot a pull request edited,
    and a relation or a database can have any name Postgres takes quoted. In
    code GitHub makes no mention, issue reference, emoji or link, and reads no
    HTML. The fence is one backtick longer than the longest run in the name,
    with a space inside each end, which CommonMark strips; a line break becomes
    a space. The longest run is found in one pass over the runs, not by
    spreading them into `Math.max`, which overflows the stack at about
    150,000 runs, a name of 300 KB in a snapshot that can hold 10 MB. A pipe inside a table cell is escaped with a backslash, because
    cmark-gfm, GitHub's renderer, ends a cell at any other pipe, inside code
    too: in `ext_scanners.re` a cell is `(escaped_char|[^|\r\n])+` and re2c
    takes the longest match, so a pipe right after a backslash never ends a
    cell, even after a second backslash, and `unescape_pipes` in `table.c`
    then drops one backslash before each pipe. Checked with cmark-gfm
    compiled to wasm: a name with a line break and pipes, one with a
    backslash before a pipe and two backticks in a row, and `</details><img
    src=x>@octocat` each stay text in one cell of one row. The escape is made
    in the table's cells, not in the code span: in a note, outside a table, a
    pipe ends nothing, and the backslash would be shown (`shop\|ci` for
    `shop|ci`, also checked). This closes, for the comment, the raw names
    T2.3 and T3.2 left; stderr still prints them raw, as the lead decided.
  - **50 rows is a constant,** part of the comment's format, an exception to
    R5 like the snapshot's 10 MB: GitHub refuses a body over 65,536
    characters, and stderr and `--json` keep every item. At the lengths
    Postgres allows, 63 bytes to an identifier, `schema.table.column` on both
    sides of a join and a condition's value of 30 characters, the longest a
    categorical column holds by default, an id is 493 characters. A hundred
    such claims, stale, each naming the column it lost, give a comment of
    38,021 bytes, and 75,508 without the cap; a hundred regressions, 27,976.
    A condition with a longer value, a suspicion over many tables, or a
    snapshot edited by hand can pass the limit; the Action is to cut such a
    body (T4.1).
  - **A comment that cannot be written exits 1.** A check that cannot write
    it has not done what it was asked, so it prints no JSON: a job that reads
    stdout finds nothing, not a pass without its comment. The line is `could
    not write <path>: <error>`, whose row the README extends. Only the write
    is caught: the comment is rendered before it, so a fault in rendering
    reaches `main` as itself, not as a file that could not be written. A
    connection error still reaches `main`, which prints it after `dbtruth: `.
  - `CheckOptions` gains `json`, `markdown` and `out`, as `RunOptions` has
    `json` and `out`. A program-level `--json` given before `check` is merged
    in, as `--url` is.
  - Test changes, none to an assertion, approved by the lead: the four
    in-process `runCheck` calls (`checked` in `check.test.ts`, `checkIn` in
    `remeasure.test.ts` and two in `joins.test.ts`) pass `json: false` and an
    `out`; the fixed report of "reportLines: notes, ..." and its `claim`
    helper move to module scope as `MOVED`, and `MOVED` and `quiet` gain
    `report: 1`. After review, `quiet` is built by `reportOf`, the helper of
    the new tests, to the same value; put to the lead (PROGRESS, T3.3,
    iteration 2).
  - Not done: shortening long names; `--fail-on` in the comment's first
    lines; queries or reasons in the comment; escaping names on stderr; a
    Markdown renderer in the tests, which compare the text; `--markdown -`,
    since stdout holds JSON only (R6).
- **The GitHub Action runs `check` on every pull request and keeps one comment
  on it.** Teams do not run a CLI by hand on every pull request; the Action is
  what a team installs, sees on each one, and on a private repository pays
  for. It lives in a public repository of its own,
  FilipKalcic1/dbtruth-action, since the Marketplace takes one `action.yml`
  at a repository's root.
  - **Its shape.** A composite action of two steps. The first is
    `actions/setup-node`, pinned by commit SHA to v7.0.0 as in `ci.yml`, with
    Node 22 and `package-manager-cache: false`, which setup-node's README
    recommends in a job that holds secrets. The second is one bash step,
    `scripts/check.sh`, which calls `scripts/comment.sh` when it comments;
    the plan's "every step `shell: bash`" cannot hold for a `uses:` step.
    Every input reaches the scripts as an environment variable `action.yml`
    sets, and the step's `run` text holds no `${{ }}`, so no input is pasted
    into a script as code. Inputs: `database-url`, required, from a secret;
    `working-directory`, `.`; `fail-on`, `regression`; `comment`,
    `on-change`, `always` or `never`; `dbtruth-version`. Outputs: `result`,
    `regressions` and `stale`.
  - **`dbtruth-version` is anything npm takes after `dbtruth@`,** 0.3.0 by
    default, run with `npx -y`. The Action's tests pass `file:` and a tarball
    packed from dbtruth at `DBTRUTH_REF`, the commit they test against, since
    0.3.0 is not published yet; until it is, the default gets npm's 404. The
    order is npm 0.3.0, then the `v1` tag, then the Marketplace, all HUMAN,
    and T7.1 adds a scenario on the published default.
  - **Results.** Exit 0 is `pass` and 2 is `fail`, with the counts read from
    `--json`. Any other exit code is `error`, not only the plan's 1, and so is
    an unknown `comment` value or a report whose `report` field is not 1 or
    that cannot be parsed. An empty `database-url`, as on a pull request from
    a fork, is `skipped` with a notice and exit 0. The step exits with
    check's own code. A step that never starts, as on a `working-directory`
    that does not exist or after setup-node failed, runs no script of the
    Action and so sets no `result`; the Action's README and `action.yml` say
    so.
  - **One comment per pull request.** On `pull_request` only, the Action's
    comment is the first whose author is github-actions[bot] and whose body
    starts with the marker. It always comments with the workflow's token, so
    its comments are that bot's, and a person's comment that quotes the
    marker is never edited. That comment is updated in place; with none, one
    is created when an item is not unchanged or check could not run, and
    always under `comment: always`, while `never` makes no call. The plan's
    "skips creating a comment when everything is unchanged" is read
    literally: a claim not measured creates one, a note alone does not. An
    existing comment is always updated, so the all-clear replaces an old
    failure.
  - **A check that could not run gets a comment too.** dbtruth writes none
    then, so the Action writes the marker, `dbtruth check could not run
    (exit N)` with a link to the job log, and check's stderr indented four
    spaces, an indented code block no line can break out of. Markdown ends a
    line at a carriage return as well as a line feed, and check's stderr can
    quote a name from the snapshot, which can hold one, so each carriage
    return is made a line break before the indent; without that, the text
    after one leaves the block as a paragraph, with live mentions, images
    and links.
    dbtruth's messages never hold the URL.
  - **A body over 65,536 bytes is cut** to its first two lines, the marker
    and the counts, and a sentence saying the job log has every line. T3.3's
    row cap keeps a comment of the names Postgres produces far under it; a
    snapshot edited by hand can pass it.
  - **A missing `gh` fails the job; a refused call only warns.** Without the
    GitHub CLI on the runner, as on some self-hosted ones, the step fails
    with what to do: install it, or set `comment: never`. A list, update or
    create GitHub refuses, such as a 403 without `pull-requests: write`,
    prints a warning naming that permission, and the job's result stays
    check's.
  - **dbtruth's lines are printed with workflow commands stopped.** The
    runner reads a workflow command in any line of stdout or stderr, the
    older `##[` form anywhere in the line, and check prints names from the
    snapshot, which the pull request can edit: one could set an output of
    the step, `result` among them. The Action prints `::stop-commands::`
    with a random token, then check's stderr, then the token, all on
    stdout, since stdout and stderr are read through separate pipes and
    would not keep the three in order. A report the Action cannot parse is
    read after commands resume, so node's error, which quotes the report, is
    dropped; the Action's own error says what went wrong.
  - **The password.** GitHub masks a secret wherever it is printed, and
    prints any other `with:` or `env:` value in the log, so the plan's "the
    password is absent from the log" holds for a URL given as a secret, which
    is what both READMEs require. The Action never prints the URL, and
    dbtruth's connection errors are its own sentences. The error scenario
    builds a URL with a wrong password at run time, masks it as GitHub masks
    a secret, and fails if the password is in any file the Action wrote or in
    the job's real log, fetched through the API; the literal is in no
    workflow text.
  - **The tests take the fixture from dbtruth.** In place of the plan's
    vendored SQL, committed snapshot and `test/regress.sql`, the scenarios
    check out dbtruth at `DBTRUTH_REF`, load its `seed.sql`, make the
    snapshot with `scripts/make-fixture-snapshot.mjs`, and apply the T3.2
    regression inline, so nothing is copied that could drift. T7.1's
    "committed fixture snapshot" becomes the one the script makes.
  - **`scripts/make-fixture-snapshot.mjs <dir>`** runs `run()` on the
    fixture, or on `DATABASE_URL`, with the canned claims of `test/canned.ts`
    in place of the model, and writes `<dir>/context/`, snapshot included. It
    exits 0 when the run exits 0 or 2, as the fixture's broken join makes
    it, and 1 only for a run that failed. It imports TypeScript from `src/` and
    `test/`, so it runs under `node --import tsx`; it is not in the package,
    and typecheck reads it. "the fixture snapshot script writes a context/
    that check passes on" runs it into a directory that does not exist yet,
    with no API key, on a copy of the fixture, and check then finds 12
    unchanged. "the fixture snapshot script fails when the run does, and says
    why" runs it with `DATABASE_URL` set and empty, as a step whose variable
    is missing sets it: the run finds no URL and exits 1, and the script
    exits 1 too, with the run's reason on stderr. Both start the script with
    `command`, the helper of `remeasure.test.ts` that starts the CLI, which
    now takes the script to run, `src/cli.ts` by default; no other test
    changes.
  - **R9 governs the data sent (the lead's decision).** R9 lets the Action
    call the GitHub API and, from T6.2, the license endpoint, "nothing
    else". The Action sends data to the GitHub API alone; setup-node and npx
    download Node and dbtruth from their servers, installation traffic the
    plan's own steps need, which R9 is read to allow. The Action's README
    says so too.
  - **The Team tier moves after CI,** where the plan puts it. Its sentences
    on the Action are in the present tense, as `check`'s are, since 0.3.0
    ships both; the license check stays in the future until T6.2. The
    CHANGELOG's Team tier bullet no longer calls the Action coming.
  - Not done: the `license-key` input (T6.2); two databases on one pull
    request; Windows and macOS runners; GitHub Enterprise Server; a comment
    on a skipped run or on `pull_request_target`; dbtruth's dependencies
    locked under `npx`; removing setup-node's problem matchers, which stay
    for the rest of the job.
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
  directory, and its path printed beneath the 20 lines. The first failure
  whose output was kept (T1.4) named its cause: the scale test "300 tables:
  the budget is respected and output still renders" gives the run 0.3 s and
  asserts some claim runs out of it, but with sampling at its default 60% share
  a server slow to sample and quick to measure left few claims, which all fit
  in the rest (5 of 45 runs with three test files side by side). The test now
  gives sampling the whole budget (`extractBudgetShare: 1`), which 300 tables
  always exhaust, so the claims run out by construction; its assertions are
  unchanged. A change to an earlier task's test, decided by the lead.

## 0.4.0 (unreleased)

Built from `BUILD_PLAN.md`, one task at a time; each task's iterations are in
`PROGRESS.md`.

- **`dbtruth mcp` lets an agent measure a join before it writes one.** An
  agent in Claude Code or Cursor starts `dbtruth mcp` and gets four tools,
  `context`, `describe_table`, `measure_join` and `check` (T5.1). No model is
  called on dbtruth's side, so no API key is needed: the agent's own model does
  the thinking. `mcp [--project <dir>] [--url <url>] [--dotenv <path>]` also
  takes every tunable after its name, as `check` does; `--dotenv` is the plan's
  `--env-file`, as since T1.1, read relative to the project.
  - **The SDK is `@modelcontextprotocol/server` 2.1.0 (the lead's decision).**
    The plan names `@modelcontextprotocol/sdk`, pinned. On 2026-09-25 npm gave
    `sdk` 1.30.1 and `server` 2.1.0, each as `latest`, and the server
    package's README says v2 "is the stable release line" and "replaces the
    monolithic `@modelcontextprotocol/sdk`". Installed with zod, `sdk` brings
    94 packages, express, hono, cors and jose among them; `server` brings its
    core and zod, which dedupes onto the zod dbtruth already has. The server is
    a dependency and `@modelcontextprotocol/client` 2.1.0, which the tests and
    the package smoke test drive it with, a dev dependency, both pinned
    exactly. R2 holds for the package the code imports: only `mcp.ts` imports
    `@modelcontextprotocol/server`. v2 loads in about 0.2 s once zod is loaded,
    and `cli.ts` imports `mcp.ts` statically, where the structure test sees
    it, so every CLI start pays that.
  - **Served with `serveStdio`,** which the v2 serving guide gives in place of
    `new StdioServerTransport()` and `connect()`. The server stops when its
    client closes stdin, or on SIGINT or SIGTERM, which close the handle; then
    the connection is closed and `mcp` exits 0. `serve` listens for the end of
    stdin itself, not for a server instance's `onclose`: a client that opens
    with `server/discover` and then `initialize` makes the SDK answer the first
    from a probe instance and close it, and the server stopped there, exit 0,
    with the client's next request unanswered (found in review, reproduced; a
    test now opens that way). A statement still running then is not cancelled:
    pg's `end()` drops the socket without a CancelRequest, so the backend runs
    on until it tries to answer or reaches the statement timeout.
  - **One connection, one call at a time.** The settings are read and the
    connection opened by the first call that needs the database, through
    `setup()`, which the full run and `check` share, and `connect` with its
    read-only proof; and again after a call that failed, so a `.env` filled in
    after the server started is read by the next call. Once connected, the
    settings stay until the server is restarted. The SDK dispatches calls
    concurrently (measured: A started, B started, B ended, A ended), so the
    queue is dbtruth's: each call that uses the database waits for the one
    before; `context` reads files and waits for nothing. Each call has a budget
    of its own, `mcpCallBudgetSeconds`, 20 by default (R5, with its variable and
    flag; at least a millisecond, 0.001, like `statementTimeoutSeconds`), given
    by `resetBudget` on the `Connection` that `connect` now returns: a `Db` with
    `resetBudget` and `lost`, so the five `Db` fakes of the tests stay as they
    are. It is not a measurement setting, so the snapshot does not record it.
    The catalog is read on every call, outside the budget, so a schema changed
    during a session is seen.
  - **The project is `--project`, else `CLAUDE_PROJECT_DIR`, else the working
    directory (the lead's decision).** The plan has `--project`, else the
    working directory. Claude Code's MCP page (code.claude.com/docs/en/mcp,
    read on 2026-09-25) says that it "sets `CLAUDE_PROJECT_DIR` in the spawned
    server's environment to the project root, so your server can resolve
    project-relative paths without depending on the working directory", so one
    entry at user scope serves every project. Cursor's page
    (cursor.com/docs/context/mcp) documents neither the working directory nor
    such a variable, so the README's `.cursor/mcp.json` passes `--project
    ${workspaceFolder}`. A `--project` that is not a directory stops the server
    with exit 1 before it serves.
  - **`claude mcp add --transport stdio dbtruth -- npx -y dbtruth mcp`** is the
    form Claude Code's page gives, `claude mcp add [options] <name> --
    <command> [args...]`. `init` prints it as its last next step, which the
    plan left to T5.1 ("Not built here", 0.2.0), and the README shows it under
    "Giving it to your agent", a line a test holds equal. The page says
    nothing of Windows or `cmd /c`; the README gives `cmd /c` as the fallback
    for a server shown as failed with "Connection closed" on native Windows,
    and the manual run of T5.2 is to say whether `init` prints it.
- **Names from an agent are keys, never SQL (R8).**
  - The SDK checks every call against a closed schema, `z.strictObject`: a key
    a tool does not take is refused with its `Input validation error`, never
    dropped. `measure_join` keeps the plan's flat input, `from_table`,
    `from_column`, `to_table`, `to_column`, `when_column` and `when_equals`
    (the lead's decision, over the brief's nested claim), since a flat list of
    arguments is what an agent's tool call handles best. One refinement holds
    the pair together, "when_column and when_equals go together: give both, or
    neither", since half a condition would measure the whole join; its message
    has a row, and `readme.test.ts` lists it with the words printed inside
    another line.
  - Each name is looked up in the catalog that same call reads: a table with
    `findTable`, by its name or `schema.table`, exact first, then regardless of
    case, and a column exactly; the claim takes the catalog's spelling. A name
    not found is refused, with the closest names, before any statement is
    built: the plan's "no statement was issued" is read as none built from the
    input, since the three statements of `readCatalog` run first to find the
    names, and a test holds that nothing else runs and that none holds or binds
    the name. The refusal is an answer, not an error, so the connection stays.
  - The closest names are those the fewest single-character edits away,
    ignoring case, every tie, in the order the catalog or `context/tables/`
    lists them, with no bound on how many or on a name's length, which would be
    numbers of their own. Names are schema, not data (R3).
  - A condition's value is only ever `$1`, and a condition is measured only on
    a categorical column, as since T2.3: on a hidden column it is refused,
    with the same answer for a value that exists and one that does not.
  - `basis` is `stated` when the from-table declares exactly this foreign key,
    as prompt A is told to claim it, so the answer reads as a table's file
    does; otherwise `inferred`. The test is `declares` in `schemas.ts`, which
    `verify` asks too before it weighs a join against other keys, so that the
    two cannot come to disagree.
- **What each tool answers.**
  - `measure_join` builds a claims object of one join and runs `extract` on its
    two relations only, `verify`, with `integerKeys` over the whole catalog as
    `remeasure` has it, and `decide`, with the settings of a full run. It
    answers with two blocks: the line a table's file shows for the join, and
    the verdict as JSON with its claim id, its query and its numbers, which a
    test holds equal to a full run's for every canned join. The line is
    `joinLine`, moved out of `tableFile` in `write.ts`, which now calls it, with
    a wording for a rejected join ("these columns do not relate; find the right
    key"), which only `measure_join` reaches: a table's file leaves a rejected
    join out. A relation the budget skipped is refused as not examined, where
    `verify` would call it unknown.
  - `describe_table` runs `extract` on the one relation with
    `sampleRowsShown` 0, so no sample row is read, and answers with a
    projection written field by field, never a `Table` spread: the name, kind,
    populated, partitions, row estimate and its source, `unmeasured`, the keys,
    and per column the name, type, nullable, null rate, distinct count and the
    values of a categorical column. Comments, view definitions, year ranges and
    longest values are left out; R3 lists none of them.
  - `context` answers with `context/README.md` or `context/tables/<table>.md`,
    the name made a path by `tableFileName`, also moved out of `write()`, and
    `confine`. The file must be listed under that name exactly, so that on a
    filesystem that ignores case `Orders` does not open `orders.md`, nor
    `users` another table's `Users.md`; a name not listed is refused with the
    closest listed, and with no file the answer says to run `npx dbtruth`. The
    directory is read once, with each entry's type: an entry listed as a link
    or a directory is not read. Paths in its messages are absolute, so they say
    where the server looked.
  - `check` reads the snapshot first, as `dbtruth check` does, and without one
    refuses before connecting. It answers with the lines `check` prints, then
    the `CheckReport` as JSON. The brief answered with the lines alone, since
    T3.3's JSON did not exist when it was written; T3.3 has since landed, and
    "returns the report" is read as T3.2's `CheckReport`, which T3.3 gave a
    schema. A regression is an answer, not an error.
- **`Table.unmeasured` says why a relation has no statistics (the lead's
  decision).** A relation the role cannot read, or a materialized view never
  refreshed, reached prompt A, and would have reached `describe_table`, with
  null rates and distinct counts of 0, as if measured. `profile` in
  `extract.ts` now sets `unmeasured` to the reason: the server's message when
  the statement of statistics failed ("permission denied for table vehicles",
  a timeout, the budget), or that a materialized view never refreshed cannot
  be read. `describe_table` then shows no null rate or distinct count. Prompt
  A's input carries the key for those relations, and the prompt says what it
  means; `TableFacts`, `schemaOnly` and the snapshot do not take it.
- **A statement that fails on a value in the data is told by its code alone
  (R3).** `run` in `safety.ts` passed the server's message on as the
  statement's, and Postgres quotes the value a data exception (class `22`:
  `invalid input syntax for type integer: "<value>"`, a value out of range, a
  date it cannot read) failed on, as a function's `RAISE` or `ASSERT` (class
  `P0`) can. A view such as `SELECT email::bigint AS phone FROM customers`,
  with one row that does not cast, sent that row's hidden value to prompt A
  through `unmeasured`, and through a verdict's `skipped` to the table files,
  the snapshot, prompt B, `check`'s report and the MCP answers: the second
  way since verify first reported a statement's message, the first and the
  answers since T5.1 (found in review, reproduced on the fixture's server).
  Such a message is now `a value could not be read (SQLSTATE <code>)`, set
  once where the error is caught, as a failed connection is told in a sentence
  of dbtruth's own; every other error keeps the server's words, which name
  objects, such as `permission denied for table vehicles`, and a timeout keeps
  its own. The sentence says "a value", not "a value in the data": a
  condition's own value that the server refuses, a NUL byte in `when_equals`
  (22021), is told the same way, and T2.3's test of it in `joins.test.ts` now
  expects this sentence with 22021 where it expected the server's `0x00`, the
  same fact, that the server refused the bound value, in other words. Tested
  where the error is caught, on a copy of the fixture with a cast and with a
  function that raises with its argument, and from end to end on a view that
  casts `customers.email`: its `describe_table`, `measure_join`, `context` and
  `check` answers, the snapshot, `--json` and both prompts hold no
  `canary-pii`. Not done: a function that raises under a code of its choosing
  (`USING ERRCODE`), or an extension that words its own errors, is passed on
  as the server gives it; class `22` is where Postgres puts an error over a
  value, and `P0` is PL/pgSQL's own.
- **A declared join that could not be measured is not called inferred.** The
  line of a join that is empty or unverifiable read `(inferred, <reason>)`
  whatever the claim's basis, since 0.1.8, where a confirmed or broken join's
  line leaves `inferred` out for a stated one. `measure_join` answers with
  that line and calls a join the database declares `stated`, so an agent
  would have read a declared key it could not measure as a guess. A stated
  join's line is now `(not measured: <reason>)`, or its status alone; an
  inferred one's is as before (found in review).
- **A connection closed while idle no longer ends the process (the lead's
  decision).** pg reports a connection the server or the network closed as an
  `'error'` event on its client, and with no listener Node ends the process;
  `connect()` attached none. Reproduced with pg 8.23: `pg_terminate_backend` on
  an idle session ended the test process. A restart, `idle_session_timeout` or
  a serverless database that suspends would have ended an idle MCP server, and
  a full run whose session was closed while the model answered died with
  Node's stack trace. `connect()` now listens and keeps the first reason, and
  the next statement throws `database connection lost: <reason>`, the message
  whose row the README has. The MCP session asks `lost()` before a call and
  replaces such a connection without a word, and closes the connection after
  any call that failed. Tested for a full run, for `connect` alone, and for the
  session.
- **`doctor`'s key line names `mcp`**: "doctor, check and mcp do not". The
  troubleshooting row of `no API key found` keeps its words, which still hold
  and which T3.2's `readme-rows` pins.
- **Test and check changes, none to what an assertion means (the lead's
  decision):**
  - `readme.test.ts`: `WAYS` gains `refuse`, the way an MCP tool answers that
    it could not; `REPORT` gains a join's line, which starts with `${edge}` or
    `**BROKEN** ${edge}` and is a `return` literal now that `joinLine` holds it,
    an answer and not an error; `UNSEEN` gains the words of the pairing
    refinement.
  - `doctor.test.ts`: `NO_KEY` is the new line.
  - `structure.test.ts`: the map gains `mcp.ts` and `cli.ts`' import of it, and
    two tests: only `mcp.ts` imports the MCP SDK, at exact versions, and
    `mcp.ts` never loads `model.ts` at run time. The existing walk from
    `check.ts` and `snapshot.ts` counts type imports too, and `mcp.ts` imports
    `write.ts`, which imports `model.ts` for its types only, so the new walk
    follows the imports that load a module.
  - `acceptance/checks.json`: T1.5's `readme-commands` takes any comment on the
    `mcp` line of the Commands list, where it took `coming in 0.4.0`, and
    T1.4's `readme-team` finds `mcp` in the free list without "the coming".
    T1.4's `help` changes with T5.2, when `init` takes options. T5.1's own
    `A4-installed` is `installed`, under the tests: the package smoke test
    drives the installed server through the SDK's client, which passes over a
    line on stdout that is not JSON, so it could not fail for A4. A4 rests on
    the stdout test, which now makes the server log each way it can (no URL
    yet, the `.env` then read from the repository's root, a message the SDK
    cannot read) and counts whole lines, a stray newline among them.
  - Tests that close a session or a server on a copy of `fixture_template`
    close it in the test, not after it: `node --test` runs after-hooks in the
    order they are added, and the copy's drop, added first, fails while a
    session is open.
- **Not done:** cancelling a statement on stop; reading the settings again once
  connected; tool annotations such as `readOnlyHint`, output schemas,
  resources, prompts and server instructions; answers over Claude Code's
  25,000 tokens, which it saves to a file for the agent to read; reaching by
  name the files a case collision names `~2`; a bound on a name's length for
  `closest`; the skill and `init --skill` (T5.2).
- **Known limit:** `measure_join` makes the count behind T2.3's categorical
  rule interactive. An agent can ask for any value of a categorical column,
  and a value that one row alone holds narrows a join to that row. The README
  says to give the server a role that reads only what an agent may learn.
- **`close()` ends the connection, then waits for the calls in flight.**
  The handlers' `close()` ended the connection it found at once, so a call
  still opening its connection opened it after `close()` had found none, and
  the open socket kept the process alive. Found by the lead after T5.1: a
  rescoring run left a test process of `test/mcp.test.ts` holding two idle
  sessions for two and a half hours, which blocked the next `npm run verify`
  until its 600 s timeout. The first fix queued `close()` behind the calls,
  and that made SIGTERM wait for a call held by a lock: CI failed "SIGTERM
  during a call ends the server and leaves no session behind" on every
  Postgres and Node, since only Linux runs the signal handler. `close()` now
  ends the connection first, so a call waiting on the database fails at once
  with the connection's error, then waits for the calls already made; a call
  that opens its connection after `close()` throws before using it and ends
  it in its own turn. Two tests with a fake connection hold both on every
  platform: one opens slowly and counts one close by the time `close()`
  returns, one reads the catalog until its connection is closed and needs
  `close()` to return while it waits.
- **`init --skill` installs the skill that tells an agent when to measure.**
  The MCP server gives an agent tools; `skills/dbtruth/SKILL.md` tells it when
  to use them (T5.2): read `context/README.md` and each table's file before
  writing SQL, call `measure_join` before a join those files do not list as
  confirmed, what a broken join, a join on weak evidence, a branch and rows
  with no value mean for the query, and never start a full run or pass
  `--reveal`. `npx dbtruth init --skill` installs it as
  `.claude/skills/dbtruth/SKILL.md` where `init` writes the `.env`: at the
  repository root by T1.1's rule, or in the working directory outside a
  repository.
  - **The format, checked on 2026-09-25.** Claude Code's skills page
    (code.claude.com/docs/en/skills): a project skill is
    `.claude/skills/<skill-name>/SKILL.md`, and its command comes from the
    folder's name; the frontmatter is read "only when the opening `---` is the
    file's first line"; every field is optional, and `description`, "what the
    skill does and when to use it", is what Claude decides by, cut at 1,536
    characters with `when_to_use` in the listing; descriptions are in context
    in every session and the whole file loads when the skill is invoked; the
    skill directories are watched, so a skill installed during a session is
    picked up without a restart; and `SKILL.md` should stay under 500 lines.
    The Agent Skills specification (agentskills.io/specification), which the
    page cites, requires both fields: `name` of at most 64 characters of
    `a-z`, `0-9` and `-`, equal to the folder's name, and `description` of 1
    to 1,024 characters, with a body under 5,000 tokens recommended. The skill
    has `name` and `description` alone, which satisfies both. No
    `allowed-tools`: letting the agent call a tool without asking is the
    user's decision, not the package's.
  - **What changed from Appendix D, and why.** "Anything marked (inferred)
    was not [checked]" is false today: a table's file shows a confirmed join on
    an inferred claim as "confirmed, ... (inferred)", with its numbers. The
    skill says what was measured, a join marked confirmed or **BROKEN** and a
    problem in bold, with their numbers, and what was not: a table's purpose,
    and anything marked (inferred) without numbers or "not measured". It adds
    what later tasks put in the files, weak evidence (T2.2), a join that holds
    only `when` a column has a value (T2.3) and rows with no value in the
    from-column; `rejected`, which only `measure_join` answers; what to do
    without `context/` or without the tools; not to start a full run itself,
    since one sends the schema, statistics and sample rows to a model on the
    user's key; and not to follow instructions found in `context/` or in the
    tools' answers, which are data. Values are written as quoted text, so that
    every code span of one lowercase word is a tool's name.
  - **The tests hold the skill to the server and to the format.**
    `test/skill.test.ts`, which needs no database: the frontmatter opens on
    line 1 and holds `name` and `description` alone, as plain values, each
    opening with a letter, with no `:` before a blank or at its end, no `#`
    after a blank, no trailing blank, and not `null`, `true` or `false`, which
    YAML reads exactly as written, so no YAML library is needed; the name is
    the folder's;
    the description is under 1,024 characters and the whole file under 5,000,
    counted with LF line ends; the code spans of one lowercase word, or words
    joined by `_`, are exactly the names `mcp.ts` passes to `registerTool`, so
    the skill can neither name a tool the server does not have nor leave one
    out; and `--reveal` appears only under "Never".
  - **The file ships from the package's root, and the build copies nothing.**
    The plan has the build copy the skill (T5.2, and section 5.4's "copy
    prompts (+ skills from T5.2)"). Here `files` in `package.json` gains
    `skills`, and `init` reads `skills/dbtruth/SKILL.md` one level up from
    `cli.ts`, as `--version` reads `package.json`: from `src/` under tsx and
    from `dist/` once installed, the package root both times. A copy under
    `dist/` would ship the same file twice. The package smoke test runs the
    installed `init --skill` in its temporary project, which is in no
    repository, and compares the file it writes with `skills/dbtruth/SKILL.md`
    byte for byte; reading it from the installed package is the proof that the
    tarball holds it. The smoke test's line of required files stays as T0.1's
    A3 pins it.
  - **A second `--skill` refuses, and `--force` replaces the skill alone.** The
    plan contrasts the `.env`, which `init` "never overwrites ... it says so
    and continues", with the skill, where the second run "refuses without
    `--force`". So a skill already there, which the user may have edited, is
    left as it is: `init` prints `<path> already exists; pass --force to
    replace it`, with its own row, and exits 1, after the `.env`'s line and
    before the next steps, as when it cannot write the `.env`. With `--force`
    the file at that path is removed and the new one written with `wx`: `rm`
    removes a link, never what it points at, and `wx` opens nothing that is
    there, so nothing is written through a link or into a file that appeared
    since. A directory at that path is never removed; `init` exits 1 with
    `could not write <path>: EEXIST ...`, or `EISDIR` with `--force`.
    `--force` never reaches the `.env`, and without `--skill` does nothing.
    With nothing at that path, `--force` installs the skill as `--skill` does.
    The test of a link uses a hard link, since Windows makes a symbolic one
    only with privileges; a write through either reaches the other name.
    One function, `create`, writes both files and says what it did, so the two
    are written and reported alike.
  - **A `.env` that cannot be written does not keep the skill out.** A
    directory named `.env`, such as a virtualenv, is a setup the README
    supports: the settings go in a file of another name, read with
    `--dotenv`. There `init` still prints `could not write .env: EEXIST ...`,
    judges no `.gitignore`, prints no next steps and exits 1, as in T1.4, but
    installs the skill first when `--skill` asks for it; stopping at the
    `.env` left such a project no way to get the skill from `init`.
  - **Test and check changes, none to what an assertion means.** T1.4's
    `help` in `acceptance/checks.json` expects `init [options]`, which
    commander prints once `init` has options (the lead's decision D6, as
    NOTES said under T5.1). T1.5's `readme-commands` takes the Commands list's
    new line, `npx dbtruth init --skill`, between `init` and `check`. The row
    for `could not write <path>: <error>` names the skill's path too, the row
    for an unknown option says a dbtruth older than 0.4.0 has no `init
    --skill`, and the Team tier no longer calls the skill coming. The quick
    start's "It never changes a file that is already there", and the `.env`'s
    row, now name the `.env` and `.gitignore`, since `--force` replaces a
    skill. T1.4's command test in `test/init.test.ts` calls the file's one
    `command`, which the `--skill` command test shares, with the same call and
    the same assertions.
  - **Not done:** installing for another agent, or in `~/.claude/skills` for
    every project; telling whether an installed skill is the one this dbtruth
    ships; line ends: the file ships as the working copy has it, LF from a
    checkout on Linux and CRLF from one on Windows with `core.autocrlf`, as the
    prompts do, and the tests read either. T5.2's A3, the transcript of Claude
    Code with the server and the skill, is the lead's, since this machine has
    no `claude`; that run also decides whether `init` prints the `cmd /c` form
    for native Windows (T5.1).
- **What the first live run since 0.1.7 got wrong (the lead's scope).** A run
  with the real model on the fixture wrote `context/`, and an audit checked
  every statement in it against the database and `snapshot.json`. Twenty
  findings survived refutation, several of them one problem found twice, and
  nine did not. Under the plan's standard anything false that dbtruth writes
  blocks a release, so the lead chose these fixes:
  - **A confirmed problem's numbers are the fact, and its detail is not.**
    `tableFile` printed a confirmed suspicion as `**<kind> <subject>**:
    <detail> (<numbers>).`. The detail is prompt A's free text. In
    `tables/orders.md` it said the `status` values "mix case and spacing",
    but the data has no spacing, and the measurement cannot tell case from
    spacing: it compares `count(DISTINCT status)` with `count(DISTINCT
    lower(btrim(status)))`. So the file printed an unmeasured guess in bold,
    against its own docstring ("nothing unconfirmed passes as a fact"). The
    line is now `**<kind> <subject>**: <numbers>.<hint> <detail>
    (inferred)`: the numbers come first, as the fact, and the detail follows
    them with the label the same function gives the model's purpose of a
    table. A first draft wrote `Inferred, not measured: <detail>`, which
    three reviews rejected: everywhere else in `context/tables/` what
    follows `not measured: ` is the reason nothing was measured, as the
    README's troubleshooting says twice, and the skill tells an agent that
    anything "not measured" is unverified, so an agent could have dropped a
    confirmed dead table. The skill describes the line as it is now: a
    problem in bold was measured, with its numbers, and what is marked
    (inferred) without numbers was not.
  - **Numbers measured over one of two tables name it.** Every kind of
    suspicion that is measured is measured over the first table its claim
    names: a `duplicate_entity`'s `total` is that table's distinct sampled
    rows on the shared columns, and `matched` how many of them are also in
    the second. Both tables' files showed these numbers bare.
    `tables/products_legacy.md` read "total 80, matched 70, ..., overlap
    0.875" under "~70 rows", which suggests that ten of eighty legacy rows,
    an eighth, are missing from `products`; in fact all 70 are there, and
    `products` has 10 more. `tables/products.md` read "**duplicate_entity
    products_legacy**: ... total 80", a line that names the other table
    alone. Now the numbers of a suspicion over more than one table end
    `(measured over <first table>)` in every file the line is in.
  - **Prompt B files a suspicion by its verdict.** The README listed the
    unverifiable `customers.api_token` suspicion under "Confirmed
    suspicions", with a label it made up, "(unverifiable further)". The
    `(inferred)` rule now says "in that word and no other", and its "Never
    launder a guess into a fact" goes on to the headings: only a claim whose
    verdict is confirmed goes under a heading that says confirmed. The
    README's open questions now take the unverifiable suspicions, since what
    such a claim needs is a person's answer, and the `(inferred)` rule
    labels them there.
  - **A confirmed suspicion confirms its numbers, not the words of its
    detail.** The README repeated the detail's "casing/spacing". The writer
    had never been told what an `inconsistent_values` suspicion's numbers
    are; now it is, and that they cannot tell case from spacing. A rule
    tells it to say what the numbers and the values of categorical columns
    show, both of which were measured, and to label anything beyond them
    "(inferred)". On the fixture the values of `status` differ by case
    alone.
  - **The overlap is one way.** `write.md` explained a relationship's numbers
    but not a `duplicate_entity`'s. ENTITIES.md then attached "87.5% overlap"
    to `products_legacy`, although every `products_legacy` row is in
    `products`. The prompt now explains `sharedColumns`, `total`, `matched`
    and `overlap` where it explains a relationship's numbers, and a rule says
    the share is of the first table's rows, never of the second's.
  - **A broken join on inference says the analysis found no declared key.**
    The README gave `orders.customer_id -> customers.id` without
    "(inferred)" and never said that no foreign key is declared (seed
    problem 1). Prompt B receives each relationship's `basis` and `reason` as
    prompt A gave them, and no list of declared keys, since `TableFacts` has
    none. Prompt A is told to propose every declared foreign key with basis
    "stated", but nothing holds it to that: the model can call a declared key
    inferred (T2.2, above), which is why `verify` asks the catalog, not the
    basis, before it weighs a join. So the broken-relationship rule tells
    prompt B to label such a join "(inferred)" and to say that the analysis
    found no declared foreign key for it, which is what prompt B knows. A
    first draft had it say that no declared foreign key backs the join; a
    declared `NOT VALID` key that is broken, and that the model called
    inferred, would have made that false.
  - **"[hidden]" hides nothing from the database.** Prompt A wrote the table
    note "entity_id is hidden so cannot be tested directly" and the detail
    "entity_id values are hidden which limits verification", and `tableFile`
    prints both as they are. The note sat above three joins on `entity_id`,
    each measured at 100 of 100. Prompt B then wrote that `entity_id` "is
    hidden from direct inspection". Both prompts now say that a hidden
    column's values were withheld from the analysis model only, that the
    database holds them and the measurements read them, and, in the same
    words, never to call a column or its values hidden, nor to write that a
    column cannot be inspected, tested or verified. An earlier draft banned
    only hiding given as the reason, so as not to silence what is truly not
    measured; it let the live note through with its reason cut, "entity_id
    cannot be tested directly". What is truly not measured is a claim, not a
    column: a condition on a column that is not categorical, which `verify`
    refuses so that no hidden value can be guessed, or a suspicion of a kind
    with no measurement. The ban leaves the model free to say so of the
    claim. Prompt A's rule for a polymorphic reference whose column has no
    "values" list no longer says the reference "cannot be tested", words
    the ban contradicts: it says that no condition on that column is
    measured, which is what `verify` does. Prompt B meets the word only in
    prompt A's notes, details and reasons, since `Verified` holds no sample
    row, and its rule is worded so.
  - **Tests.** In `write.test.ts`, "a table file carries the measured
    numbers, ..." asserts a confirmed problem's line in two places. Both
    assertions change with the line, because this entry changes that
    behavior (section 4.4 of the plan), and both gain messages. A new test
    checks that both files of a duplicate pair give `products` as the table
    the numbers were measured over. No test read the prompts before; docs
    checks of T2.2, T2.3, T2.4 and T5.1 in `acceptance/checks.json` pin some
    of their lines, and the new text leaves those lines as they were. Two new
    tests pin each new rule's key sentence, reading the prompt with its
    whitespace folded, so rewrapping the text or the checkout's line ends do
    not break them. They hold the words, not what the model does with them.
    The model's behavior is judged on a live run, which the lead does. The
    README's fixture output predates these changes and is regenerated from
    that run.
  - **Not done:** making "no declared foreign key" a fact about the database
    rather than the analysis's word, by giving prompt B the declared keys or
    by setting a claim's basis to "stated" wherever the catalog declares its
    key: that changes what every claim carries, the snapshot's included, and
    is the lead's call. A guard in `tableFile` against a note or detail about
    hidden values, since the prompt rule is the lighter fix. Explaining a
    `dead_table`'s numbers in the prompt, since nothing false in this run
    came from them. A rule that nothing labelled "(inferred)" goes under a
    heading that says fact: the rule that a relationship is stated as fact
    only when it is confirmed with no `alsoFits` already covers it, and this
    run kept those joins apart. And `tableFile` still prints prompt A's notes
    and grain with no label, and a purpose marked "stated" too.
  - **Known limits (the lead's decision, not fixed):** prompt A did not claim
    `audit_log`'s missing primary key, so the README leaves it out, and only
    `tables/audit_log.md` says "primary key: none"; the grain is prompt A's
    wording (`order_totals` "one row per customer", `events` "one row per
    event per day"); ENTITIES.md left `order_totals` out of Customer's
    references, although prompt A listed it there and it carries the
    customers' key; a view does not inherit its base table's relationships,
    so `shipped_orders.customer_id`, read from `orders.customer_id` and
    matching `customers.id` on 160 of its 200 rows, has no claim and no join
    line; and `inconsistent_values` counts case and whitespace collisions
    together, so its numbers cannot say which one caused them.
- **What the three live runs after those fixes still got wrong (the lead's
  scope).** Three more runs on the fixture, r2a, r2b and r2c, were audited
  the same way. Two statements were false, both in r2c's README, and the
  lead chose to fix those two; the rest are known limits, listed at the end.
  - **A suspicion's numbers name the table they were measured over.** The
    README said "87.5% of products_legacy's sampled rows (70/80... actually
    measured as matched 70 of total 80 on products) also appear in
    products_legacy". The 87.5% is the share of `products`' 80 rows found in
    `products_legacy`; all 70 rows of `products_legacy` are in `products`.
    Prompt B had been told that the numbers are over "the first of its two
    tables", and still read the order of the names wrongly, so the table is
    now named in the data, beside the numbers. `verify` gives a measurement
    `over`, the first table the suspicion names, which is the table every
    kind is measured over, when the suspicion names more than one and the
    measurement has numbers, as one left empty by a sample that held no
    rows still does; `decide` copies it into the verdict's `measurement`.
    Prompt B is told that such numbers are over the table named in "over",
    what a `duplicate_entity`'s `total` and `matched` count in those words,
    and to give the overlap as a share of that table's rows, by its name.
    `tableFile`'s "(measured over <table>)" reads the same field, so the
    table files and prompt B have one source for it. Every kind gets it,
    not `duplicate_entity` alone: r2b's `missing_key` over `order_totals`
    and `shipped_orders` was looked up on `order_totals` only. A suspicion
    over one table, one with no numbers, and a relationship, whose numbers
    are named by its from and to, carry none.
  - **The snapshot keeps it, and one without it checks as before.** The
    verdict's `measurement` in `SnapshotSchema` takes an optional `over`, so
    the snapshot keeps it, and `check --json` and the MCP server's `check`
    give it in each verdict measured again. A table's name is what `Verified`
    already carries (R3). A snapshot written before it existed has none and
    parses as it did; `check` reads only a verdict's status and hit rate,
    so its claims are classed as before. r2c's own snapshot, which has
    neither this change nor the next, checks "13 unchanged" against the
    fixture. No snapshot has been published, since 0.4.0 is the first
    release with one, and the format stays 1.
  - **A materialized view never refreshed is not counted.** The same README
    said that `order_totals` is dead because "reading it returns nothing";
    reading it raises `materialized view "order_totals" has not been
    populated`, with the hint to refresh it. `measureDeadTable` gave such a
    view `{ count: 0, exact: 1, populated: 0 }` without running anything, a
    count of rows no one read, and `decide` found it dead by that count. Its
    numbers are now `{ populated: 0 }`, what the schema says, and `decide`
    confirms a dead table on `populated` 0 in its own right, before it looks
    for a count or an age. Prompt B is told, after the per-relation facts
    that carry `populated`, that a materialized view with `populated`
    false, or `populated` 0 in a `dead_table` suspicion's numbers, has
    never been refreshed, that reading it, even in a join, raises an error
    until it is, and that its row estimate of 0 is not a count. A rule says
    never to say that such a view has no rows or returns nothing, and the
    rule on "empty", which listed such a view beside a table with no rows
    and which the audit named as a likely source of "returns nothing", now
    says that it cannot be read. The entry above left a `dead_table`'s
    numbers unexplained, since nothing false had come from them; this is
    what did.
  - **Its table file no longer says "no rows".** `tables/order_totals.md`
    read "materialized view, no rows", from the row estimate of 0 that
    `extract` gives such a view without reading it. `TableFacts` now carries
    `populated`, which `assemble` copies from the extract, and the line reads
    "materialized view, never refreshed (reading it raises an error)". The
    problem line reads "**dead_table**: populated 0." before the analysis's
    detail. A materialized view that was refreshed and holds nothing still
    has "no rows". Prompt B receives `populated` with the other per-relation
    facts.
  - **Every other reader of these numbers is unaffected.** `check` classes a
    claim by its status and hit rate, so a snapshot holding the old numbers,
    or no `over`, checks unchanged against the new ones; the pull request
    comment in the README shows a join only; `measure_join` measures joins,
    which carry no `over`; no check in `acceptance/checks.json` pins these
    numbers or the prompt sentences that changed. The README's "How it
    works" now says that a dead table's measurement includes whether a
    materialized view was ever refreshed, and that a duplicate's overlap is
    a share of one table's sampled rows, the table the verdict names in
    `over`. Its pasted fixture output predates both rounds and is
    regenerated from the lead's next run.
  - **Tests.** New: in `verdict.test.ts`, a dead table on `populated` 0
    alone, and a verdict that names the table its measurement names; in
    `verify.test.ts`, a never-refreshed view's numbers without a count, and
    `over` on a suspicion over two tables that has numbers, one from a
    sample that held no rows among them, and on no other; in
    `write.test.ts`, the file of a never-refreshed view, `over` still sent
    to prompt B when the verdicts' queries are left out, and prompt B's
    sentences on `populated`, on "empty" and the rule that such a view is
    never said to have no rows; in `snapshot.test.ts`, `over` through
    serialize and parse, and a verdict without it; in `remeasure.test.ts`, a
    snapshot with the old numbers and no `over` checked unchanged against
    the fixture, a guard that passed before the change too. Changed, since
    this entry changes that behavior (section 4.4 of the plan): the
    duplicate test of `write.test.ts` gives its verdict `over`, its
    assertions as they were, and gains one that a verdict naming the other
    table puts that one in the file, so the file cannot take the table
    from the order of the names; the prompt test's two sentences on a
    `duplicate_entity` are replaced by the three that say it now;
    `integration.test.ts` asserts
    `order_totals`' numbers whole, `{ populated: 0 }`, where it asserted
    `populated` alone, and its file's line "never refreshed (reading it
    raises an error)" where it asserted "no rows", and it gains two
    assertions on what prompt B is sent.
  - **Not done:** `extract` still gives a never-refreshed materialized view
    a row estimate of 0, which prompt A and `describe_table` show beside
    `populated` false and the reason it was not sampled; changing it reaches
    prompt A and the MCP server, outside this scope, and prompt B is told
    that the 0 is not a count. A `duplicate_entity` that names three tables
    or more is measured over its first two, as before, and prompt B's "the
    other table" takes it to name two, as prompt A is told a duplicate
    does. Measuring the overlap both ways, or giving prompt B a sentence to
    copy, both of which the audit offered: naming the table is the smaller
    change, and whether the model now names the right one is for the lead's
    live run to show.
  - **Known limits (the lead's decision, not fixed):** in some runs prompt B
    left out "(inferred)", or that the analysis found no declared foreign
    key, most often in ENTITIES.md (the broken `orders.customer_id ->
    customers.id` in r2a's README and in r2b's and r2c's ENTITIES.md, and
    the `audit_log` branches without the reason for their label); r2b's
    README put the empty `cars.customer_id -> customers.id` under
    "Confirmed suspicions"; the same README wrote "order_totals and
    shipped_orders (a view and a materialized view)", kinds in the reverse
    order of the names; in r2a prompt A called the empty `cars` "all
    columns unmeasured", the word for a relation that could not be sampled,
    and its file prints that note as written; and the relations string "9
    tables, 1 view, 1 materialized view, 1 partitioned" counts the
    partitioned table among the nine, so r2a's README, which wrote "1
    partitioned table", reads as twelve relations where there are eleven.
- **What a run on a real database and three more fixture runs still got
  wrong (round 3, the lead's scope).** After round 2 the lead ran the
  fixture three more times, r3a, r3b and r3c, and dbtruth once on Pagila, a
  real database of 23 relations (15 tables, `payment` among them partitioned
  55 ways, 7 views and 1 materialized view never refreshed), and audited
  them the same way. The Pagila run sent 3,842 schema tokens at effort low;
  prompt A took 41.8s and made 29 claims, `verify` took 0.8s, prompt B
  27.4s; 50,585 tokens in and 8,370 out in 2 calls; database time 6.4s,
  model time 69.3s. Its verdicts: 22 relationships, 21 confirmed (3 on weak
  evidence) and 1 empty; 7 suspicions, 1 confirmed, 5 unverifiable and 1
  empty; 13 entities, 5 questions, 26 files. Its audit checked 244
  statements and six findings stood, the fixture runs' three. The maintainer
  chose one last round that removes the systematic causes, then the release,
  with what remains recorded as known limits, merged at the end of this
  entry.
  - **A duplicate between two views is decided by their definitions.** On
    Pagila prompt A claimed that `rental_by_category`, a materialized view
    never refreshed, duplicates `sales_by_store`, while its own detail named
    `sales_by_film_category`, whose definition is the same as
    `rental_by_category`'s; `sales_by_store` is another query, one row per
    store and manager. `nothingToMeasure` found `rental_by_category`
    unpopulated and left the claim empty, so nothing met the wrong pair:
    both table files printed it, and prompt B made it the advice to use
    `sales_by_store` instead. Rows cannot decide such a pair, since one side
    cannot be read, and two views are the same relation when they are the
    same query. So `measureDuplicateEntity`, when both relations are views
    or materialized views, asks the catalog first, before the shared columns
    and before `nothingToMeasure`: `SELECT (pg_get_viewdef($1::regclass,
    true) = pg_get_viewdef($2::regclass, true))::int AS same_definition`,
    which Postgres answers for a materialized view never refreshed, with
    `true` as `extract` reads the definition prompt A is shown. It runs
    through `db.catalog`, outside the budget, as the extract's catalog reads
    do: it reads no rows, and suspicions are measured after every join, so
    joins that spent the budget would leave the pair unverifiable, printed
    in both table files and sent to prompt B. The names are those
    `qualified()` gives the relations found in the extract, bound and never
    SQL text (R8): as a `regclass` literal a name would be a string in the
    statement, and with `standard_conforming_strings` off a backslash in it
    could end the string early. The query kept is the statement and a note
    that gives `$1` and `$2`, as a branch's note gives its value, so that a
    person can rerun it (R7). Its number is `sameDefinition`, 1 or 0, and
    `verify` gives it `over`, the first table, as it does every suspicion
    over two tables that has numbers. `decide` confirms on 1 and rejects on
    0 before it looks for an overlap: a wrong pair is rejected, so it is in
    no table file, and prompt B leaves rejected claims out. On Pagila,
    read-only in psql, the statement gives 1 for `rental_by_category` and
    `sales_by_film_category` and 0 for `rental_by_category` and
    `sales_by_store`. Prompt B is told what `sameDefinition` means where it
    is told a duplicate's other numbers. A pair with a table in it is
    measured by its rows, as before, and one beside a materialized view
    never refreshed is still empty. Two plain views, which were measured by
    their rows, are now compared by definition too, as the lead chose, and
    their rows are not read: two queries written differently are two
    relations even when they always return the same rows, such as a
    materialized view that caches a view with `SELECT *` from it, or one
    query with other aliases, another order of joins or an ORDER BY. Review
    offered to read the rows when the definitions differ and both sides can
    be read; the lead's scope is definitions, not rows, so it is a known
    limit below. A snapshot written before holds such a pair as empty, or by
    its overlap; `check` measures it by definition, so it may report it
    changed or improved. No snapshot has been published, since 0.4.0 is the
    first release with one.
  - **Prompt B is sent each relation's comment.** r3b's README said that
    the comment on `cars` says it was replaced by `vehicles`; the comment is
    on `vehicles`, and `cars` has none. Prompt B had never seen a comment:
    `TableFacts` had none, and it reworded prompt A's detail. `TableFacts`
    now carries `comment`, which `assemble` copies from the extract only
    when the relation has one; prompt B is told it among the per-relation
    facts, and a rule says that a comment belongs to the relation whose
    facts carry it. R3 holds: a comment is schema text, not a value, and
    `Verified.tables` is assembled from the extract prompt A was sent, the
    one `fitToContext` returns, so every comment in it had already gone to
    the model, and a relation dropped to fit is in neither. It now also
    appears in `--json`'s `tables`, which prints `Verified`. The snapshot
    takes nothing from `Verified.tables`, and `check`, the pull request
    comment and `describe_table` do not read it, so none of them changes.
    Table files do not print the comment: the lead's scope is what prompt B
    is sent.
  - **Two rules for prompt B, one for prompt A.** Pagila's ENTITIES.md said
    "Only store_id values 1 and 2 are actually used" right after listing
    `staff.store_id`, which holds 475 values; the unverifiable suspicion
    behind it named `customer.store_id` and `inventory.store_id` alone. Its
    README gave "payment is partitioned, which hides FKs from tooling" as
    fact; the relationship's reason was prompt A's "no declared FK likely
    due to partitioning", and 49 of the 55 partitions, 73% of the rows,
    declare no foreign key at all. Both go into the rule on "(inferred)",
    not new bullets: a cause the analysis gives is a guess and is labelled
    "(inferred)", and an unverifiable claim or a suspicion's detail is
    restated only for the relations and columns it names. The lead's words
    were "a cause or reason"; review found that every relationship and
    entity prompt B receives carries a reason, and a stated one is a fact:
    each of Pagila's 18 stated relationships gives "Declared foreign key".
    Every reason labelled "(inferred)" would set the rule against the one
    that states a confirmed relationship as fact, so it names the cause
    alone. Prompt A is told that a duplicate_entity's "tables" are exactly
    the two relations its detail says duplicate each other, which is where
    the Pagila pair went wrong; the check of definitions rejects such a pair
    if it comes again, but cannot supply the pair the detail meant. These
    are words, and whether the model keeps them is for the lead's live runs
    to show.
  - **The README says what the model's files are.** Under what a run
    writes: `context/README.md` and `context/ENTITIES.md` are the model's
    summary of the verdicts and can misstate them; what was measured is in
    the numbers of the files in `context/tables/` and each verdict's numbers
    and query in `context/snapshot.json`. "How it works" says that two views
    are compared by definition.
  - **Tests.** New: in `verify.test.ts`, a duplicate between two views, one
    a materialized view never refreshed, measured by their definitions, with
    the names bound and the note, confirmed for the same definition and
    rejected for another; two views compared by definition whatever would
    stop a comparison of rows, no column name in common or a budget the
    joins spent; and a duplicate between a table and a view still measured
    by its rows, one beside a materialized view never refreshed still empty,
    a guard that passed before. The fake database there now answers a
    statement sent outside the budget from its script, as it answers any
    other, where it used to return no rows. In `verdict.test.ts`,
    `sameDefinition` 1 and 0, and `assemble` carrying a comment only for the
    relation that has one; in `write.test.ts`, the prompt sentences on
    `sameDefinition`, the comment, the two rules, and prompt A's; in
    `integration.test.ts`, on a copy of `fixture_template` with a view of
    `order_totals`' own query under a name that needs quoting, the pair
    confirmed with `sameDefinition 1` and `order_totals` beside
    `shipped_orders` rejected and in neither file. The whole loop gains one
    assertion: prompt B is sent the comment on `vehicles`, and none for
    `cars`. No existing assertion changed.
  - **Not done:** a check in code that a suspicion's detail names only the
    relations in its `tables`, which the audit offered: that reads meaning
    from free text (R4). Printing the comment in a table's file. Comparing a
    view with a table by definition: a table has none, and its rows are what
    the overlap measures. Deciding the pair from the definitions the extract
    already holds, which review offered: the verdict would carry a statement
    dbtruth never ran, and prompt B is told that each query is the one that
    was run. A role without USAGE on a view's schema cannot resolve its name
    as a `regclass`, so the pair is unverifiable with Postgres's message, as
    its rows were before; a lookup by schema and name would answer it, at
    twice the parameters, for a role that can read nothing in that schema.
  - **Known limits (the lead's decision), rounds 1 to 3 in one list.** This
    list replaces those of the two entries above. By cause, each with the
    runs it was seen in: r1 is the first run, then r2a to r2c, r3a to r3c
    and Pagila.
    - Prompt B leaves out "(inferred)", or the reason for it, most often in
      ENTITIES.md: the broken `orders.customer_id -> customers.id` without
      "no declared foreign key" (every fixture run) and the `audit_log`
      branches without the reason for their label (r1, r2b, r2c, r3a, r3b,
      r3c). Recurs in every round.
    - Prompt B puts an empty or unverifiable claim under a heading that says
      confirmed, or calls it confirmed: `customers.api_token` (r1), the
      empty `cars.customer_id` join (r2b, r3b), the empty `cars`/`vehicles`
      duplicate (r3b, r3c), the empty `rental_by_category` duplicate
      (Pagila). Recurs. Pagila also listed its two empty claims one by one,
      against the rule to give the count once (once).
    - Prompt B labels an unverifiable claim or an open question
      "(unverifiable)", "(unverifiable further)" in r1 or
      "(inferred/unverifiable)" in r2a and r3a, not "(inferred)": every
      run's README, flagged in r1, r3a, r3b, r3c and Pagila. Recurs.
    - ENTITIES.md places the views that read an entity's table
      inconsistently: `order_totals`, which carries the customers' key, is
      under Order and not Customer in r1, r2c and r3c, and under both in the
      other fixture runs; Pagila's Payment is "not referenced elsewhere"
      though three views read it. Recurs.
    - Prompt A never claims `audit_log`'s missing primary key, so README.md
      and ENTITIES.md leave it out and only `tables/audit_log.md` says
      "primary key: none" (every fixture run). Recurs.
    - Prompt A's grain wording, printed as written: `order_totals` "one row
      per customer", `events` "one row per event per day" or "per event id
      and date" (every fixture run). Recurs.
    - Prompt A marks a purpose "stated" where nothing is stated, and a
      table file prints a stated purpose with no "(inferred)": Pagila has
      no comment at all, and all 15 of its table purposes are "stated".
      Seen once (Pagila).
    - A table's notes print with no label, whatever prompt A based them
      on: the empty `cars` "all columns unmeasured" (r2a), and Pagila's
      notes on six tables, among them `customer`'s calling `activebool` and
      `active` redundant. The round-1 entry left the unlabelled notes as
      not done. Recurs.
    - Seen once, prompt A: `events` "timestamped" though `happened_on` is a
      date (r3b); `customer.active` a duplicate of `activebool`, which
      disagree on 43 of 999 rows, an "other" suspicion nothing measures
      (Pagila; a suspicion kind for redundant columns is outside this
      round). Seen once, prompt B: "a view and a materialized view" for
      `order_totals` and `shipped_orders`, the kinds in the reverse order of
      the names (r2b).
    - A view does not inherit its base table's relationships, so
      `shipped_orders` has no join line (every fixture run), nor Pagila's
      `film_list` and `nicer_but_slower_film_list`. Recurs.
    - Categorical values are shown quoted whatever the column's type, since
      `extract` reads them as text: `vehicles.model_year` (flagged in r3c,
      in every run's output), Pagila's `release_year` and `store_id` among
      others. Recurs.
    - The relations string "9 tables, 1 view, 1 materialized view, 1
      partitioned" counts the partitioned table among the tables, and
      prompt B repeats it so that it reads as one relation more (r2a, r3c,
      Pagila). Recurs.
    - `inconsistent_values` counts case and whitespace collisions together,
      so its numbers cannot say which caused them. Seen once (r1).
    - Two views or materialized views are decided by their definitions
      alone, so a pair whose queries are written differently but always
      return the same rows is rejected and left out: a materialized view
      that caches a view with `SELECT *` from it, or one query with other
      aliases, another order of joins or an ORDER BY. Found in review, not
      in a run.

## Where string matching does appear, and why it is syntax, not meaning

- `typeFamily` in `safety.ts` names the Postgres type families whose values
  are free text or dates. It decides visibility by type, which the spec
  allows; it never reads a column's name or values.
- `schemas.ts` matches a claim's table name to an extracted table (exact,
  then case-insensitive, on the display or the qualified name) when the
  model's reply is validated, and spells it as the extract does from then on.
- `safety.ts` checks that a statement begins with SELECT or WITH, quotes
  identifiers, and parses one line of `.env`.
- `verify.ts` recognises timestamp types for the dead-table measurement, and
  `isIntegerType` in `safety.ts` the integer types, by declared type, for
  where a join's orphans fall. It also picks the joins that are weighed
  against other keys, and those keys.
- `write.ts` normalises output paths into `context/`.
- `closest` in `mcp.ts` suggests the spellings nearest to a name the catalog,
  or `context/tables/`, does not have. It decides nothing: the name is refused
  whatever the suggestion.
- Verdict ids are prefixed `relationship:` / `suspicion:` so the exit code and
  the summary can tell them apart. A branch's id ends in `[column=value]`,
  its condition as the claim gives it, so that each branch is a claim of its
  own; nothing reads the value back out of an id.

## Known limits, deliberately not fixed

- **A join is unconditional unless its claim names a condition.** It asks
  whether every non-null value of the from-column exists in the to-column,
  over the rows the claim covers. A polymorphic column, one that points at
  different tables depending on another column, can hit 100% against a
  table by a coincidence of small integer ids, and the first live run
  stated such a match as a fact. Since 0.2.0 prompt A claims such a column
  one branch at a time, each measured on the rows its value selects ("A
  polymorphic reference is measured one branch at a time", 0.2.0). A
  discriminator that is not categorical cannot be branched on, and is still
  sent to a suspicion of kind `other`, labelled inferred. And a claim with
  no condition is measured whole, so a coincidental match still reads
  confirmed: on `polymorph`, `comments.commentable_id -> posts.id` does,
  though since T2.2 it says that its values would also match 2 other keys.
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
  and constraints, and claims a polymorphic reference one branch at a time.
  What the hit rate cannot tell apart is said beside it: since 0.2.0 a join
  confirmed on inference from an integer column says how many other keys its
  values would fit ("A join confirmed on inference says when its values
  would fit other keys too").
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
