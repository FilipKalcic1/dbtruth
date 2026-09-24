# Changelog

Releases from 0.2.0 on. What earlier releases changed, and why, is in
`NOTES.md`.

## 0.3.0 (unreleased)

- Every full run also writes `context/snapshot.json`: the claims, each
  verdict with its query and numbers, the settings they were measured with,
  and the schema with a fingerprint, for `check` to measure again. It is
  written in a fixed order and without a timestamp, so it changes only when
  the data, the schema or the claims do; commit it with the rest of
  `context/`. A dead table's age is now counted in whole days, rounded up, so
  that it stays the same from run to run until the data is a day older; a
  table is dead, as before, once its newest row is more than `staleAfterDays`
  days old.
- A file of the last run under `context/` is replaced by the new one, and
  only a file this run does not write again, such as a renamed table's, is
  removed. One that cannot be removed, held open by another program on
  Windows or in a directory this user cannot write, is reported like a file
  that cannot be written, and the other files are still written. It used to
  stop the run, after the model calls.

## 0.2.0 (unreleased)

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
- README: a quick start that runs `doctor` before the first run, a
  troubleshooting table with a row for every message dbtruth prints when
  something is wrong, and the commands, with those not built yet marked as
  coming. The Monorepos paragraph says where `context/` is written. The `.env`
  example no longer has a comment on the model's line, which became part of
  the model id when copied.
- Development: `npm run verify` runs the typecheck, every test, the build and
  a smoke test of the packed package; `npm run acceptance` scores the tasks of
  `BUILD_PLAN.md`. Nothing changes for users of the CLI.
