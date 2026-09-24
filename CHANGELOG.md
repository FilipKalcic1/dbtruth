# Changelog

Releases from 0.2.0 on. What earlier releases changed, and why, is in
`NOTES.md`.

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
- README: a quick start that runs `doctor` before the first run, a
  troubleshooting table with a row for every message dbtruth prints when
  something is wrong, and the commands, with those not built yet marked as
  coming. The Monorepos paragraph says where `context/` is written. The `.env`
  example no longer has a comment on the model's line, which became part of
  the model id when copied.
- Development: `npm run verify` runs the typecheck, every test, the build and
  a smoke test of the packed package; `npm run acceptance` scores the tasks of
  `BUILD_PLAN.md`. Nothing changes for users of the CLI.
