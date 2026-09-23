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
- Development: `npm run verify` runs the typecheck, every test, the build and
  a smoke test of the packed package; `npm run acceptance` scores the tasks of
  `BUILD_PLAN.md`. Nothing changes for users of the CLI.
