// Writes into <dir> the context/ a full run writes on the fixture, snapshot.json included, with the canned claims of
// test/canned.ts in place of the model, so the Action's tests have a snapshot to check without a model or an API key.
// Not in the package; typecheck reads it. Run it under tsx, which reads the TypeScript it imports:
//
//   node --import tsx scripts/make-fixture-snapshot.mjs <dir>
//
// The database is DATABASE_URL, else the fixture.

import { mkdirSync } from "node:fs";
import { run } from "../src/cli.js";
import { fakeModel } from "../test/canned.js";

const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const code = await run(
  {
    url: process.env.DATABASE_URL ?? "postgres://dbtruth:dbtruth@localhost:54329/fixture",
    samples: true,
    reveal: [],
    json: false,
    flags: {},
    cwd: dir,
    env: {},
    out: () => {},
    err: (line) => process.stderr.write(line + "\n"),
  },
  { transport: fakeModel().transport },
);
// The fixture's broken join makes a full run exit 2, which is what it should find here; 1 is a run that failed.
process.exitCode = code === 1 ? 1 : 0;
