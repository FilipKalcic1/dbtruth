import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../src/config.js";
import type { Catalog } from "../src/extract.js";
import { relationshipId, suspicionId, type CatalogRelation, type Claims, type Snapshot, type TableFacts, type Verdict, type Verified } from "../src/schemas.js";
import { parseSnapshot, readSnapshot, schemaOf, serialize, toSnapshot } from "../src/snapshot.js";

const FILE = "context/snapshot.json";
const meta = { toolVersion: "0.2.0", serverVersionNum: 160004 };

const relation = (name: string, columns: [string, string][] = [["id", "integer"]]): CatalogRelation => ({
  name,
  schema: "public",
  kind: "table",
  primaryKey: ["id"],
  foreignKeys: [],
  columns: columns.map(([column, type]) => ({ name: column, type, nullable: false })),
});

const verdict = (status: Verdict["status"]): Verdict => ({ status, measurement: { query: "SELECT 1", numbers: { hit: 1 } } });

/** Verified over the given claims, each with a verdict, and the given relations examined. */
function verifiedOf(claims: Partial<Claims>, tables: TableFacts[] = []): Verified {
  const all: Claims = { entities: [], tables: [], relationships: [], suspicions: [], questions: [], ...claims };
  const ids = [...all.relationships.map(relationshipId), ...all.suspicions.map(suspicionId)];
  return { version: 1, database: "shop", relations: "", claims: all, verdicts: Object.fromEntries(ids.map((id) => [id, verdict("confirmed")])), fitsInContext: true, tables };
}

const facts = (name: string, categorical: Record<string, unknown[]> = {}): TableFacts => ({ name, kind: "table", rowEstimate: 10, primaryKey: ["id"], categorical });

const joins = (...pairs: [string, string][]): Claims["relationships"] =>
  pairs.map(([from, to]) => ({ from: { table: from, column: `${to}_id` }, to: { table: to, column: "id" }, basis: "inferred", confidence: 0.5, reason: "name" }));

/** A snapshot as the full run writes it, read back as plain JSON so a test can spoil one value of a copy. */
const valid = JSON.parse(serialize(toSnapshot(verifiedOf({ relationships: joins(["orders", "customers"]) }), [relation("orders")], config, meta))) as Snapshot;
const JOIN = "relationship:orders.customers_id->customers.id";

test("serialize writes sorted keys at every level, two-space indent and a final newline", () => {
  // Keys in no particular order at every level: the file has one spelling whatever order they were built in.
  const snapshot: Snapshot = {
    verdicts: { "suspicion:dead_table:cars": { skipped: "no rows", measurement: { numbers: { exact: 1, count: 0 }, query: "SELECT count(*) FROM cars" }, status: "confirmed" } },
    tool: "dbtruth",
    snapshot: 1,
    schema: { relations: [{ schema: "public", name: "cars", kind: "table", columns: [["id", "integer"]], examined: false }], fingerprint: "sha256:00" },
    serverVersionNum: 160004,
    toolVersion: "0.2.0",
    measuredWith: {
      staleAfterDays: 90,
      sampleSeed: 1,
      sampleRows: 50000,
      sampleOversample: 3,
      pilotPages: 100,
      join: { confirmed: 0.95, broken: 0.5 },
      duplicateOverlap: 0.7,
      categoricalMaxValueLength: 30,
      categoricalMaxDistinct: 50,
    },
    database: "shop",
    claims: { tables: [], suspicions: [{ tables: ["cars"], kind: "dead_table", detail: "empty" }], relationships: [], questions: [], entities: [] },
  };
  assert.equal(
    serialize(snapshot),
    `{
  "claims": {
    "entities": [],
    "questions": [],
    "relationships": [],
    "suspicions": [
      {
        "detail": "empty",
        "kind": "dead_table",
        "tables": [
          "cars"
        ]
      }
    ],
    "tables": []
  },
  "database": "shop",
  "measuredWith": {
    "categoricalMaxDistinct": 50,
    "categoricalMaxValueLength": 30,
    "duplicateOverlap": 0.7,
    "join": {
      "broken": 0.5,
      "confirmed": 0.95
    },
    "pilotPages": 100,
    "sampleOversample": 3,
    "sampleRows": 50000,
    "sampleSeed": 1,
    "staleAfterDays": 90
  },
  "schema": {
    "fingerprint": "sha256:00",
    "relations": [
      {
        "columns": [
          [
            "id",
            "integer"
          ]
        ],
        "examined": false,
        "kind": "table",
        "name": "cars",
        "schema": "public"
      }
    ]
  },
  "serverVersionNum": 160004,
  "snapshot": 1,
  "tool": "dbtruth",
  "toolVersion": "0.2.0",
  "verdicts": {
    "suspicion:dead_table:cars": {
      "measurement": {
        "numbers": {
          "count": 0,
          "exact": 1
        },
        "query": "SELECT count(*) FROM cars"
      },
      "skipped": "no rows",
      "status": "confirmed"
    }
  }
}
`,
  );
});

test("claims and relations are ordered by code units, whatever their order", () => {
  // Upper case before lower, and a letter with a diacritic after both: the order of UTF-16 code units, never a locale's.
  const names = ["b", "ä", "B", "a", "Z"];
  const inOrder = ["B", "Z", "a", "b", "ä"];
  const claims: Claims = {
    entities: [
      ...names.map((name) => ({ name, primaryTable: name, referencedIn: [], basis: "inferred" as const, confidence: 0.5, reason: "r" })),
      // Two entities of one name: the tie goes by their whole text.
      { name: "a", primaryTable: "Z", referencedIn: [], basis: "inferred", confidence: 0.5, reason: "r" },
    ],
    tables: names.map((name) => ({ name, purpose: "p", grain: "g", basis: "inferred", confidence: 0.5, notes: ["second", "first"] })),
    relationships: joins(["b", "a"], ["ä", "a"], ["B", "a"], ["a", "b"], ["Z", "a"]),
    suspicions: names.map((name) => ({ kind: "dead_table", tables: [name, "a"], detail: "d" })),
    questions: names,
  };
  const reversed = Object.fromEntries(Object.entries(claims).map(([key, list]) => [key, [...list].reverse()])) as Claims;
  const text = serialize(toSnapshot(verifiedOf(claims), names.map((name) => relation(name)), config, meta));
  const parsed = JSON.parse(text) as Snapshot;

  assert.deepEqual(parsed.schema.relations.map((r) => r.name), inOrder);
  assert.deepEqual(parsed.claims.entities.map((e) => e.name), ["B", "Z", "a", "a", "b", "ä"]);
  assert.deepEqual(parsed.claims.tables.map((t) => t.name), inOrder);
  assert.deepEqual(parsed.claims.relationships.map((r) => r.from.table), inOrder);
  assert.deepEqual(parsed.claims.suspicions.map((s) => s.tables[0]), inOrder);
  assert.deepEqual(parsed.claims.questions, inOrder);
  assert.deepEqual(parsed.claims.tables[0]!.notes, ["second", "first"], "an array inside a claim keeps its order");
  assert.deepEqual(parsed.claims.suspicions[0]!.tables, ["B", "a"]);
  assert.equal(serialize(toSnapshot(verifiedOf(reversed), [...names].reverse().map((name) => relation(name)), config, meta)), text, "the same claims and relations in reverse give the same bytes");
});

test("claim text with newlines, quotes and non-ASCII characters survives serialize and parse", () => {
  const detail = 'first line\nsecond "quoted" \\ line\ttabbed — žluťoučký kůň \u{1F40E}';
  const text = serialize(toSnapshot(verifiedOf({ suspicions: [{ kind: "other", tables: ["orders"], detail }] }), [relation("orders")], config, meta));
  const parsed = parseSnapshot(text, FILE);
  if (typeof parsed === "string") assert.fail(parsed);
  assert.equal(parsed.claims.suspicions[0]!.detail, detail);
  assert.equal(serialize(parsed), text);
});

test("the fingerprint is sha256 of the schema only", () => {
  const catalog: Catalog = [
    { ...relation("orders", [["id", "integer"], ["customer_id", "integer"]]), size: { estimate: 500, pages: 4 } },
    { ...relation("customers"), comment: "people", size: { estimate: 250, pages: 2 } },
  ];
  const { fingerprint } = schemaOf(catalog);
  assert.match(fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(schemaOf([...catalog].reverse()).fingerprint, fingerprint, "any relation order");
  assert.equal(schemaOf(catalog.map((r) => ({ ...r, size: { estimate: -1, pages: 900 } }))).fingerprint, fingerprint, "any size");

  const [orders, customers] = catalog as [Catalog[number], Catalog[number]];
  const changed = {
    "a column added": [{ ...orders, columns: [...orders.columns, { name: "note", type: "text", nullable: true }] }, customers],
    "a type changed": [{ ...orders, columns: orders.columns.map((c) => (c.name === "customer_id" ? { ...c, type: "bigint" } : c)) }, customers],
    "a comment changed": [orders, { ...customers, comment: "customers" }],
  };
  for (const [what, relations] of Object.entries(changed)) assert.notEqual(schemaOf(relations).fingerprint, fingerprint, what);
});

test("toSnapshot lists every catalog relation, marks those not examined, and carries no categorical value", () => {
  const claims = { relationships: joins(["orders", "customers"]), suspicions: [{ kind: "dead_table" as const, tables: ["events"], detail: "old" }] };
  const verified = verifiedOf(claims, [facts("orders", { status: ["canary-pii-shipped"] }), facts("customers")]);
  const snapshot = toSnapshot(verified, ["orders", "customers", "events", "audit"].map((name) => relation(name)), { ...config, sampleRows: 1234 }, meta);

  assert.deepEqual(
    snapshot.schema.relations.map((r) => [r.name, r.examined]),
    [["audit", false], ["customers", undefined], ["events", false], ["orders", undefined]],
    "skipped over budget or dropped to fit the model: in the catalog, not in Verified",
  );
  assert.deepEqual(snapshot.schema.relations[0], { name: "audit", schema: "public", kind: "table", columns: [["id", "integer"]], examined: false });
  assert.doesNotMatch(serialize(snapshot), /canary-pii/);
  assert.deepEqual(snapshot.claims, verified.claims);
  assert.deepEqual(snapshot.verdicts, verified.verdicts);
  assert.deepEqual(
    [snapshot.snapshot, snapshot.tool, snapshot.toolVersion, snapshot.database, snapshot.serverVersionNum],
    [1, "dbtruth", "0.2.0", "shop", 160004],
  );
  assert.deepEqual(snapshot.measuredWith, {
    sampleRows: 1234,
    sampleOversample: config.sampleOversample,
    sampleSeed: config.sampleSeed,
    pilotPages: config.pilotPages,
    join: config.join,
    staleAfterDays: config.staleAfterDays,
    duplicateOverlap: config.duplicateOverlap,
    categoricalMaxDistinct: config.categoricalMaxDistinct,
    categoricalMaxValueLength: config.categoricalMaxValueLength,
  });
});

test("parseSnapshot refuses what is not a snapshot, each with its own sentence", () => {
  const refused = (value: unknown) => parseSnapshot(JSON.stringify(value), FILE);
  const { schema: _schema, ...withoutSchema } = valid;
  assert.equal(typeof refused(valid), "object", "unspoiled, it parses");
  assert.equal(
    parseSnapshot('{ "database": "canary-pii', FILE),
    `${FILE} is not valid JSON: run npx dbtruth and commit context/`,
    "the parser's message, which quotes the input, is left out",
  );
  assert.equal(refused({ ...valid, snapshot: 99 }), `${FILE} was written by a newer dbtruth (snapshot format 99); upgrade dbtruth to check it`);
  assert.equal(refused({ ...valid, snapshot: 0 }), `${FILE} is not a dbtruth snapshot: snapshot: Invalid input: expected 1`);
  assert.equal(refused({ ...valid, snapshot: "1" }), `${FILE} is not a dbtruth snapshot: snapshot: Invalid input: expected 1`);
  assert.equal(refused(withoutSchema), `${FILE} is not a dbtruth snapshot: schema: Invalid input: expected object, received undefined`);
  assert.match(
    String(refused({ ...valid, verdicts: { [JOIN]: { ...valid.verdicts[JOIN]!, status: "maybe" } } })),
    /^context\/snapshot\.json is not a dbtruth snapshot: verdicts\.relationship:orders\.customers_id->customers\.id\.status: /,
  );
  assert.match(
    String(refused({ ...valid, schema: { ...valid.schema, relations: [{ ...valid.schema.relations[0]!, columns: [["id"]] }] } })),
    /^context\/snapshot\.json is not a dbtruth snapshot: schema\.relations\.0\.columns\.0: /,
  );
  assert.equal(
    refused({ ...valid, measuredWith: { ...valid.measuredWith, sampleRows: "50000" } }),
    `${FILE} is not a dbtruth snapshot: measuredWith.sampleRows: Invalid input: expected number, received string`,
  );
  assert.equal(parseSnapshot("[]", FILE), `${FILE} is not a dbtruth snapshot: the top level: Invalid input: expected object, received array`);

  // A setting check would measure with is held to the range its flag is, and the join bands to their order.
  const settings = (changed: Partial<Snapshot["measuredWith"]>) => refused({ ...valid, measuredWith: { ...valid.measuredWith, ...changed } });
  assert.equal(settings({ sampleRows: 0 }), `${FILE} is not a dbtruth snapshot: measuredWith: DBTRUTH_SAMPLE_ROWS / --sample-rows: 0 is below the minimum 1`);
  assert.equal(settings({ pilotPages: 1.5 }), `${FILE} is not a dbtruth snapshot: measuredWith: DBTRUTH_PILOT_PAGES / --pilot-pages: 1.5 must be a whole number`);
  assert.equal(settings({ join: { confirmed: 0.5, broken: 0.9 } }), `${FILE} is not a dbtruth snapshot: measuredWith: join.broken (0.9) must not exceed join.confirmed (0.5)`);
  assert.equal(typeof settings({ sampleRows: 10 }), "object", "a sample smaller than the rows a run shows by default: check shows none");
});

test("forty thousand copies of one suspicion parse in under two seconds", () => {
  // Only a hand-edited file holds copies of one claim; their details are merged into one.
  const suspicions = Array.from({ length: 40_000 }, (_, i) => ({ kind: "other", tables: ["orders"], detail: `detail number ${i}` }));
  const text = JSON.stringify({ ...valid, claims: { ...valid.claims, suspicions } });
  const started = performance.now();
  const parsed = parseSnapshot(text, FILE);
  const ms = performance.now() - started;
  if (typeof parsed === "string") assert.fail(parsed);
  assert.equal(parsed.claims.suspicions.length, 1);
  assert.ok(ms < 2_000, `${Math.round(ms)} ms`);
});

test("readSnapshot refuses a missing file, a directory and a file over 10 MB before parsing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dbtruth-snapshot-"));
  assert.equal(readSnapshot(cwd, FILE), `no ${FILE}: run npx dbtruth first`);
  mkdirSync(join(cwd, FILE), { recursive: true });
  assert.equal(readSnapshot(cwd, FILE), `${FILE} is not a file`);

  // A snapshot that parses, padded past the limit: only a check made before reading refuses it.
  const large = join("context", "large.json");
  const text = serialize(toSnapshot(verifiedOf({}), [relation("orders")], config, meta));
  writeFileSync(join(cwd, large), text + " ".repeat(11 * 1024 * 1024));
  assert.equal(readSnapshot(cwd, large), `${large} is larger than 10 MB, the most dbtruth reads`);
  writeFileSync(join(cwd, large), text);
  assert.equal(typeof readSnapshot(cwd, large), "object");
});

test("a claim stated twice in a snapshot parses to one claim", () => {
  const { claims } = valid;
  const twice = { ...valid, claims: { ...claims, relationships: [...claims.relationships, { ...claims.relationships[0]!, basis: "stated" }] } };
  const parsed = parseSnapshot(JSON.stringify(twice), FILE);
  if (typeof parsed === "string") assert.fail(parsed);
  assert.deepEqual(parsed.claims.relationships.map((r) => [relationshipId(r), r.basis]), [[JOIN, "stated"]]);
});
