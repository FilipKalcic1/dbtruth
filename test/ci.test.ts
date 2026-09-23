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
