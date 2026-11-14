# Changelog

Changes since 0.1.8. What earlier releases changed, and why, is in
`NOTES.md`.

## 0.4.4 (2026-11-14)

One fix, released alone: dbtruth is safe behind a pooler in transaction mode.

- A pooler in transaction mode is safe (Supabase's port 6543, a Neon host
  ending in `-pooler`, PgBouncer with `pool_mode = transaction`). dbtruth sets
  nothing on the session: each statement runs in a read-only transaction of
  its own, with its timeout, and is rolled back at once. Up to 0.4.3 the
  session's read-only mode and timeout stayed on the pooled server connection
  for the next client, whose writes then failed with 25006, and dbtruth's own
  statements could run on another server connection without them.
  Statements started together on one connection, as two MCP tool calls can,
  take turns. From Postgres 13 the transaction travels with its statement in
  one message, so a run on a distant server takes as long as before (300
  relations at a 20 ms round trip: 14.5 to 14.8 s, against 14.5 to 14.6 s
  with 0.4.3); on Postgres 12, and for the few statements with bind
  parameters, it takes three round trips. Connecting takes four round trips,
  down from seven.
- A statement's text with a semicolon in it is never sent, so no text can end
  the read-only transaction it runs in and write after it. No statement
  dbtruth builds holds one; a table or column with a semicolon in its name is
  described from the catalog and reported unmeasured.

## 0.4.3 (2026-11-12)

Five changes from a review of 0.4.2's code against what a user meets first,
and a cleanup.

- Value visibility: a column's values are shown only when they repeat in
  earnest: on top of at least one repeated value, at least two non-null
  sampled rows per distinct value on average
  (`--categorical-min-rows-per-value`, `DBTRUTH_CATEGORICAL_MIN_ROWS_PER_VALUE`;
  1 is the old rule). The known gap of 0.4.2, 25 employees' first names shown
  once two shared one, is closed. A key or revealed column lists its values
  by its own non-null count, not the sample's row count. The snapshot records
  the setting, and `check` measures no condition under a snapshot whose
  setting is lower than this run's.
- `dead_table`: the age is taken over values up to now, so a date still to
  come, such as an expiry, keeps no table alive. A table confirmed dead by
  age alone, with rows in it, is reported as unchanged, not unused: its line
  in `context/tables/` says that no row is newer than that many days and that
  this does not show it unused; prompt B is told never to call such a table
  unused or removable, prompt A not to propose a reference table as dead for
  its age, and the skill reads such a table as reference data.
- `duplicate_entity` is measured both ways: the first table's sampled rows
  against all of the second, as before, then the second's against all of the
  first (`totalReverse`, `matchedReverse`, `overlapReverse`), from the same
  cast; the verdict is confirmed when either share reaches
  `--duplicate-overlap`, so a table that holds a copy of a smaller one is its
  duplicate whichever the analysis named first. An other way that could not
  be measured leaves the first way's numbers as they were.
- Joins on weak evidence are counted apart: the summary reads
  `relationships: 2 confirmed, 1 on weak evidence, ...`, and such a join's
  line in `context/tables/`, and `measure_join`'s answer, lead with
  "confirmed on weak evidence". The verdict stays `confirmed`, as before.
- Relations are read most joined first, by how many foreign keys each
  declares or is pointed at by, then in catalog order, so a budget too small
  for every relation covers the joins the schema declares rather than the
  start of the alphabet; the output keeps the catalog order. The summary adds
  `not examined: <names>, and <n> more` when any was left out.
- Cleanup, no behavior change: `errorMessage` shared from `safety.ts`;
  `profile`, `tableFile` and the MCP tool handlers split into named parts;
  nested ternaries replaced; the CLI's `--url`, `--dotenv` and tunable flags
  declared once; step comments renumbered.

## 0.4.2 (2026-09-27)

- `init`'s next steps leave out those already done: `fill in .env` once the
  `.env` it found sets both `DATABASE_URL` and `ANTHROPIC_API_KEY`, and `run
  npx dbtruth` once `context/snapshot.json` is beside that `.env`; `run npx
  dbtruth doctor` stays, since it checks each person's own `.env`.
  On native Windows its `claude mcp add` line starts the
  server through `cmd /c`, as PowerShell and cmd take it (typed in Git Bash,
  `cmd //c`); WSL gets the plain form.
- README: what each of the three steps needs, with the Anthropic API key
  from console.anthropic.com, which a Claude subscription does not include;
  in step 1, removing the `#` before each setting and running `doctor`
  before the run; on native Windows (Git Bash included, WSL not), the server
  started through `cmd /c` always, not only after "Connection closed", and
  in Git Bash typed with `//c`, since Git Bash turns a lone `/c` into `C:/`;
  both `.mcp.json` forms written out, the one for native Windows through
  `cmd`; the line in `CLAUDE.md` optional with the skill, and how to see that
  the agent uses dbtruth; where the Action's secret goes; and in CI, which
  database a pull request's check should get (a copy of the measured data
  with the pull request's migrations applied), with a job that runs Postgres
  as a service container for a database GitHub's runners cannot reach.

## 0.4.1 (2026-09-27)

- License: from 0.4.1, dbtruth is under the PolyForm Shield License 1.0.0
  instead of MIT. It is free to use for any purpose, at work included, except
  to provide a product that competes with dbtruth. 0.4.0 and earlier stay
  under MIT, and `NOTICE` keeps the MIT notice for code contributed under it.
- README: a section "In three steps" before the quick start; the Team tier's
  price ($29 per team per month, or $290 per year) and its waitlist, the
  pinned issue #14; the Action runs on private repositories for free until
  the Team tier opens.

## 0.4.0 (2026-09-26)

0.4.0 also carries the two sections below: 0.3.0 and 0.2.0 were not published.

- `npx dbtruth mcp` serves an agent four tools over MCP, with no model and no
  API key: `context` returns the files in `context/`, `describe_table` a table
  as the database holds it now, `measure_join` measures a join as a full run
  does, and `check` reports what `dbtruth check` reports. A name the database
  does not have is refused with the closest names. `--project` names the
  project; else Claude Code's `CLAUDE_PROJECT_DIR`, else the directory the
  server starts in. Each call has 20 seconds (`--mcp-call-budget-seconds`).
- `init`'s next steps end with the `claude mcp add` line.
- `npx dbtruth init --skill` also installs the dbtruth skill for Claude Code,
  `.claude/skills/dbtruth/SKILL.md` at the repository root, which tells the
  agent to read `context/` and to call `measure_join` before a join `context/`
  does not list as confirmed. A skill already there is left as it is and
  `init` exits 1; `--force` replaces it, and never the `.env`. The package
  ships the skill in `skills/`.
- A connection the server closes while dbtruth waits, such as during the
  model's answer, is now `database connection lost: <reason>` on the next
  statement, not a crash with Node's stack trace.
- `doctor`'s line for a missing key says that `mcp` needs none either.
- A relation dbtruth could not sample, one the role may not read or a
  materialized view never refreshed, now says why (`unmeasured`) in what the
  model is sent, next to its null rates and distinct counts of 0, and
  `describe_table` shows neither number for it.
- A statement that fails on a value in the data, such as a view whose cast
  fails on a row, is now reported as `a value could not be read (SQLSTATE
  <code>)`, never in the server's words, which quote the value.
- The line of a declared join that could not be measured no longer calls it
  inferred.
- A table's file states a confirmed problem by its numbers, then gives the
  analysis's description of it marked `(inferred)`. The numbers of a problem
  over two tables, such as a duplicate table's overlap, name the table they
  were measured over, in the table's file and as the verdict's `over` in
  `--json`, the snapshot and `check --json`. The model, which writes
  `README.md` and `ENTITIES.md`, is told to list under a confirmed heading
  only what was confirmed, to say what a confirmed problem's numbers show
  rather than repeat the analysis's description, to give a duplicate
  table's overlap as a share of the rows of the table named in `over`, by
  its name, and to say that the analysis found no declared foreign key
  behind a broken join it inferred. Both prompts now say that values
  withheld from the model are still read by the measurements, and tell the
  model never to call a column hidden, nor to write that one cannot be
  inspected, tested or verified.
- A materialized view that has never been refreshed is no longer given a
  count of 0 rows, since reading it raises an error: a dead table's numbers
  for it are `populated 0`, which confirms it dead on its own, and its file
  says `never refreshed (reading it raises an error)` where it said `no
  rows`. `--json` gives every materialized view's `populated` in `tables`.
  The model is told what `populated` means, and never to say that such a
  view has no rows or returns nothing.
- A duplicate table suspicion between two views or materialized views is
  decided by their definitions, compared in the catalog: `sameDefinition 1`
  confirms it and `sameDefinition 0` rejects it, so no table file lists a
  wrong pair, and the model is told to leave it out. It was measured by
  their rows, and was empty beside a materialized view never refreshed,
  which cannot be read. Two views whose queries differ are now rejected
  even when they return the same rows. A pair with a table in it is
  measured by its rows, as before.
- `--json` gives each relation's comment in `tables`. The model that writes
  `README.md` and `ENTITIES.md` is sent it too, and told that a comment
  belongs to the relation that carries it, to restate an unverifiable claim
  or a suspicion's detail only for the relations and columns it names, and
  to label a cause the analysis gives `(inferred)`. The analysis is told to
  name in a duplicate table suspicion exactly the two relations it says
  duplicate each other.
- The README says that `context/README.md` and `ENTITIES.md` are the model's
  summary of the verdicts and can misstate what they summarize, and where
  the measured numbers are.

## 0.3.0 (not published: shipped in 0.4.0)

- Every full run also writes `context/snapshot.json`: the claims, each
  verdict with its query and numbers, the settings they were measured with,
  and the schema with a fingerprint, for `check` to measure again. It is
  written in a fixed order and without a timestamp, so it changes only when
  the data, the schema or the claims do; commit it with the rest of
  `context/`. A dead table's age is now counted in whole days, rounded up, so
  that it stays the same from run to run until the data is a day older; a
  table is dead, as before, once its newest row is more than `staleAfterDays`
  days old.
- `npx dbtruth check` measures again what `context/snapshot.json` claims, with
  no model and no API key, and exits 2 when the database now contradicts it: a
  relationship that broke, a suspicion that came true, a table or column a
  claim names that is gone, or a relation added or dropped since. It prints a
  line for each claim that moved and each relation added or dropped, then the
  count of each class, on stderr.
  `--fail-on change` also fails on drift, improvements and other changes, and
  `--fail-on never` only reports; `--snapshot <path>` checks another file, and
  `--check-hit-rate-tolerance` sets how far a hit rate may move before it is
  drift. It measures with the settings the snapshot was measured with and never
  runs a query stored in the file. `doctor`'s line for a missing key now says
  that `check` needs none either.
- `check --json` prints the report on stdout (its `report` field is the
  format, 1), and `check --markdown <path>` writes it as a pull request
  comment: the counts, what fails the default build in a table, the rest
  folded, at most 50 rows, names as code, no query or reason. A comment file
  that cannot be written exits 1.
- The GitHub Action FilipKalcic1/dbtruth-action runs `check` on every pull
  request, keeps one comment updated in place, fails the job on a regression
  or a stale item by default, and skips a pull request from a fork, which gets
  no secrets. The README has a CI section.
- A file of the last run under `context/` is replaced by the new one, and
  only a file this run does not write again, such as a renamed table's, is
  removed. One that cannot be removed, held open by another program on
  Windows or in a directory this user cannot write, is reported like a file
  that cannot be written, and the other files are still written. It used to
  stop the run, after the model calls.
- README: a Team tier section. It says what a team will pay for (the GitHub
  Action on private repositories), what stays free forever, and that no
  database content passes through a server of ours. The price and the
  waitlist link are placeholders for now.

## 0.2.0 (not published: shipped in 0.4.0)

- `npx dbtruth --version`, or `-v`, prints the version.
- Runs from anywhere inside a repository: the `.env` nearest to the current
  directory is read, looking up to the repository root, and a file further up
  is named on stderr, as is a `.env` that could not be read.
  `--dotenv <path>` reads a settings file elsewhere. The "no database URL"
  error lists where it looked and how to fix it.
- `npx dbtruth doctor` checks the setup a full run needs, one line per check,
  `ok`, `FAIL` with what to fix, or `note` for what is worth knowing, such as
  a missing API key, without spending a token, and exits 1 when something must
  be fixed.
- `npx dbtruth init` writes a `.env` with the settings commented out at the
  repository root, or in the current directory outside a repository, and
  prints the next steps. It leaves a `.env` that is already there as it is,
  never edits `.gitignore`, and warns, with the line to add, when `.gitignore`
  does not ignore `.env`.
- A failed connection is told in one sentence per cause (nothing listening,
  host not found, authentication failed, no such database, SSL required,
  timeout), never in the driver's words, which could quote the user, the host
  or the database. Connecting is bounded by the statement timeout, and a
  server that refuses to set up a read-only session is disconnected.
- A missing API key is told in dbtruth's words only: "no API key found" is no
  longer followed by the SDK's sentence, which named ways to sign in dbtruth
  does not use. A key that is set but cannot be sent keeps its reason.
- A table never analyzed, and a partitioned table, which autovacuum never
  analyzes, are sampled across all their pages and partitions. Their size was
  unknown, and the sample then read the oldest rows or the first partition;
  their size now comes from the partitions' estimates or is scaled up from a
  count over a few pages (`--pilot-pages`), and the per-table file says when
  it was estimated from a sample. Temporary tables are no longer listed.
- A column that points at different tables depending on another column, such
  as `commentable_id` beside `commentable_type`, is measured one branch at a
  time: when that column is categorical, the model claims one relationship
  per value of it, each is measured on the rows that hold its value and gets
  its own verdict, and the per-table files give the condition, as in `when
  commentable_type = 'photo'`. The value is sent to the database as a
  parameter, never as SQL.
- A broken join from an integer column into an integer primary key says
  where its orphans lie: how many above the key's highest value, how many
  below its lowest, and the rest inside its range. The per-table files give
  the place with the count, as in "60 orphans, all above the highest
  customers.id"; the model, which writes `README.md`, is told what each place
  usually means, and to give it as a hint, not a cause.
- A join inferred from an integer column that the data confirms is compared
  with the other integer keys that fill most of their range
  (`--dense-key-share`), among the first `--weak-evidence-max-candidates`
  that hold rows. When its values would also fit one or more of them, as a
  quantity from 1 to 5 fits every table's id, it stays confirmed: the
  per-table files and the model say how many, and that the match alone does
  not prove it, and the summary line counts it (`3 confirmed (1 on weak
  evidence)`).
- What the model is sent to write `README.md` and `ENTITIES.md` is held to
  `--model-max-input-tokens`, as the schema is: over it, the verdicts'
  queries are left out, and when even that is too large, those two files are
  not written. The line that starts `write:` says so.
- README: a quick start that runs `doctor` before the first run, a
  troubleshooting table with a row for every message dbtruth prints when
  something is wrong, and the commands, with those not built yet marked as
  coming. The Monorepos paragraph says where `context/` is written. The `.env`
  example no longer has a comment on the model's line, which became part of
  the model id when copied.
- Development: `npm run verify` runs the typecheck, every test, the build and
  a smoke test of the packed package; `npm run acceptance` scores the tasks of
  `BUILD_PLAN.md`. Nothing changes for users of the CLI.
