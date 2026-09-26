# Changelog

Changes since 0.1.8. What earlier releases changed, and why, is in
`NOTES.md`.

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
