import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CI runs the oldest Postgres and Node the README promises, and the newest", () => {
  const ci = read(".github/workflows/ci.yml");
  const readme = read("README.md");
  const postgres = JSON.parse(/^\s+postgres: (\[.*\])$/m.exec(ci)![1]!) as string[];
  const node = JSON.parse(/^\s+node: (\[.*\])$/m.exec(ci)![1]!) as string[];
  assert.deepEqual(postgres, ["12", "14", "16", "18"]);
  assert.deepEqual(node, ["20", "22"]);
  assert.equal(/Postgres (\d+) or newer/.exec(readme)?.[1], postgres[0], "the README's minimum Postgres is the first in the matrix");
  assert.equal(/Node (\d+) or newer/.exec(readme)?.[1], node[0], "the README's minimum Node is the first in the matrix");
});

test("every fixture file is an init script of docker-compose.yml, which CI loads in the same order", () => {
  const mounted = [...read("docker-compose.yml").matchAll(/test\/fixtures\/([A-Za-z0-9_]+\.sql)/g)].map((m) => m[1]);
  const files = readdirSync(new URL("./fixtures/", import.meta.url)).filter((f) => f.endsWith(".sql"));
  assert.deepEqual([...mounted].sort(), files.sort(), "a fixture file that is not mounted is loaded neither by docker compose nor by CI");
  assert.match(read(".github/workflows/ci.yml"), /grep -o 'test\/fixtures\/\[A-Za-z0-9_\]\*\\\.sql' docker-compose\.yml/, "CI reads the order from docker-compose.yml");
});

test("fixture_template is created last, from postgres, after every other fixture file", () => {
  // CI loads the files in the order the lines list them, the image in the order of the names they are mounted as.
  const mounts = [...read("docker-compose.yml").matchAll(/test\/fixtures\/([A-Za-z0-9_]+\.sql):\/docker-entrypoint-initdb\.d\/([^:]+):ro/g)];
  assert.equal(mounts.at(-1)?.[1], "template.sql", "the last line");
  const names = mounts.map((m) => m[2]!);
  assert.deepEqual([...names].sort(), names, "and the last name");
  // A database cannot be copied while a session is connected to it, and each file starts connected to fixture.
  assert.match(read("test/fixtures/template.sql"), /^\\connect postgres\r?\nCREATE DATABASE fixture_template TEMPLATE fixture IS_TEMPLATE true ALLOW_CONNECTIONS false;$/m);
});

test("the release workflow is started by hand on main, publishes with npm's trusted publishing, and tags after", () => {
  const release = read(".github/workflows/release.yml");
  const on = /^on:\n((?:[ \t].*\n|\n)*)/m.exec(release)?.[1] ?? "";
  assert.match(on, /^\s+workflow_dispatch:/m, "started by hand");
  assert.doesNotMatch(on, /^\s+(push|pull_request|release|schedule):/m, "and by nothing else");
  assert.match(release, /^\s+if: github\.ref == 'refs\/heads\/main'$/m, "only from main");
  assert.match(release, /^\s+id-token: write(\s+#.*)?$/m, "npm trusts the workflow by its OIDC token");
  assert.doesNotMatch(release, /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|secrets\./, "so no npm token is stored anywhere");
  assert.match(release, /require\("\.\/package\.json"\)\.version/, "the version typed must be package.json's");
  const publish = release.indexOf("npm publish");
  const tag = release.indexOf("gh release create");
  assert.ok(publish > 0 && tag > publish, "the tag is made only once the package is on npm");
  // The same pinned actions as ci.yml, so one bump moves both.
  const pins = (file: string) => [...read(file).matchAll(/uses: (\S+@[0-9a-f]{40})/g)].map((m) => m[1]).sort();
  assert.deepEqual(pins(".github/workflows/release.yml"), pins(".github/workflows/ci.yml"));
});
