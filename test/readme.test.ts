import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEnvFile } from "../src/safety.js";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sources = readdirSync(new URL("../src/", import.meta.url))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => read(`src/${f}`));

// A string or template literal, its text captured. A template nested in a placeholder ends the capture at its backtick,
// which keeps the words before it.
const LITERAL = String.raw`(?:\x60((?:[^\x60\\]|\\.)*)\x60|"((?:[^"\\]|\\.)*)")`;

/**
 * The ways src/ hands a message to the user, each followed by the literal that holds its words: thrown (new Error),
 * printed (err), warned (warn), a connection failure's cause (because), a sentence a function returns for its
 * caller to throw or print (return), the note on what was dropped to fit the model's input (reduced:), and an MCP tool's
 * answer that it could not do what it was asked (refuse).
 */
const WAYS = ["Error", "err", "warn", "because", "return", "reduced", "refuse"];
const MESSAGE = new RegExp(String.raw`\b(${WAYS.join("|")})(?:\?\.)?[(:\s]\s*${LITERAL}`, "g");

/** A placeholder, or the start of one that a nested template cut short. */
const PLACEHOLDER = /\$\{[^}]*\}?/;

/**
 * What a run that goes well prints: doctor's ok and note lines, the full run's progress, and a join's line, which a
 * table's file shows and measure_join answers. Not errors, so no rows.
 */
const REPORT = /^(ok |note |reading settings from |Sending to |contextualize: |verify: |write: |tokens: |(\*\*BROKEN\*\* )?\$\{edge\})/;

/** Printed as part of a longer line, or as one of a list of lines, where MESSAGE cannot see them. */
const UNSEEN = ["no database URL: DATABASE_URL is not in the environment or in", "not examined", "when_column and when_equals go together: give both, or neither"];

test("every error the CLI can print has a row in the README's troubleshooting table", () => {
  const section = /^## Troubleshooting$([\s\S]*?)^## /m.exec(read("README.md"))?.[1] ?? "";
  // The messages as the table shows them: the code spans in the first cell of each row.
  const shown = [...section.matchAll(/^\| (.+?) \| /gm)].flatMap((row) => [...row[1]!.matchAll(/\x60([^\x60]+)\x60/g)].map((span) => span[1]!));
  const ways = new Set<string>();
  for (const m of sources.flatMap((source) => [...source.matchAll(MESSAGE)])) {
    const literal = m[2] ?? m[3]!;
    const pieces = literal.split(PLACEHOLDER);
    // A literal without two words in a row is punctuation, a prefix such as FAIL, or SQL.
    if (REPORT.test(literal) || !pieces.some((piece) => /[A-Za-z] [a-z]/.test(piece))) continue;
    ways.add(m[1]!);
    // The whole message, each placeholder standing for any value, so words shared with another row do not count. A
    // cause is printed after "could not connect to the database: ", and the read-only warning after "WARNING: ".
    const shape = pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    const printed = new RegExp(m[1] === "because" ? `${shape}$` : `^(?:WARNING: )?${shape}$`);
    assert.ok(shown.some((span) => printed.test(span)), `no troubleshooting row for "${literal}"`);
  }
  // A pattern that stopped matching one of the ways would let every new message of that way slip past.
  assert.deepEqual(ways, new Set(WAYS));
  for (const words of UNSEEN) {
    assert.ok(sources.some((source) => source.includes(words)), `"${words}" is no longer in src/`);
    assert.ok(shown.some((span) => span.includes(words)), `no troubleshooting row for "${words}"`);
  }
});

test("the quick start's .env, copied as shown, is read as its two settings, each value alone", () => {
  const example = /^## Quick start$[\s\S]*?^```\r?\n([\s\S]*?)^```/m.exec(read("README.md"))?.[1] ?? "";
  const file = join(mkdtempSync(join(tmpdir(), "dbtruth-readme-")), ".env");
  writeFileSync(file, example);
  const settings = readEnvFile(file);
  // A URL, a key, a model id and a number hold no spaces, so a value read with one has taken in the rest of its line,
  // such as a comment, which dbtruth keeps as part of the value.
  for (const [name, value] of Object.entries(settings)) assert.doesNotMatch(value, /\s/, `${name} is read as "${value}"`);
  assert.deepEqual(Object.keys(settings), ["DATABASE_URL", "ANTHROPIC_API_KEY"]);
});

test("the quick start says that the model's summary can misstate the verdicts, and where what was measured is", () => {
  const start = (/^## Quick start$([\s\S]*?)^## /m.exec(read("README.md"))?.[1] ?? "").replace(/\s+/g, " ");
  assert.ok(
    start.includes("`context/README.md` and `context/ENTITIES.md` are the model's summary of the verdicts, and can misstate what they summarize."),
    "the quick start says that the two files the model writes can misstate the verdicts they summarize",
  );
  assert.ok(
    start.includes("What was measured is in the numbers of the files in `context/tables/` and in each verdict's numbers and query in `context/snapshot.json`: check a surprising statement there."),
    "and names the files that hold what was measured, to check a surprising statement against",
  );
});

test("the Team tier section has a price and a waitlist link, placeholders until a person sets them", () => {
  const team = /^## Team tier$([\s\S]*?)^## /m.exec(read("README.md"))?.[1];
  assert.ok(team, "no Team tier section");
  // A person decides the price and makes the waitlist form (T6.1 in BUILD_PLAN.md), then replaces the placeholders.
  assert.match(team, /(?:PRICE_TBD|\d[^\n]*?) per team per month/);
  assert.match(team, /\[[^\]]+\]\((?:WAITLIST_URL|https:\/\/[^)\s]+)\)/);
});

test("the Team tier section names every command, and only those not built yet as coming", () => {
  const readme = read("README.md");
  const team = /^## Team tier$([\s\S]*?)^## /m.exec(readme)?.[1] ?? "";
  const commands = /^## Commands$([\s\S]*?)^## /m.exec(readme)?.[1] ?? "";
  // Built is what cli.ts defines, with the full run; coming is what the Commands list says is.
  const built = ["dbtruth", ...[...read("src/cli.ts").matchAll(/\.command\("(\w+)"\)/g)].map((m) => m[1]!)];
  const coming = [...commands.matchAll(/^npx dbtruth (\w+) +# coming in /gm)].map((m) => m[1]!);
  const span = /`(?:npx )?(?:dbtruth )?([a-z]+)(?: [^`]*)?`/g;
  const named = new Set<string>();
  for (const clause of team.split(/[.;:]\s/)) {
    // A command in a code span, alone or as the README writes it elsewhere (`npx dbtruth mcp`, with options), is called
    // coming by that word before it in its clause, as in "the coming `init`".
    for (const m of clause.matchAll(span)) {
      const name = m[1]!;
      named.add(name);
      const notBuilt = coming.includes(name);
      assert.equal(/\bcoming\b/.test(clause.slice(0, m.index)), notBuilt, `"${clause}" names ${name}, which is ${notBuilt ? "not built yet" : "built"}`);
    }
  }
  assert.deepEqual(named, new Set([...built, ...coming]));
  // Every command stays free forever (T6.1 in BUILD_PLAN.md), so the sentence that says so names each, even `check`,
  // which other sentences name too.
  const free = /free forever[^.]*/.exec(team)?.[0] ?? "";
  const listed = [...free.matchAll(span)].map((m) => m[1]);
  for (const name of named) assert.ok(listed.includes(name), `"${free}" leaves out ${name}`);
});

test("How it works says that a duplicate between two views is decided by their definitions", () => {
  const how = (/^## How it works$([\s\S]*?)^## /m.exec(read("README.md"))?.[1] ?? "").replace(/\s+/g, " ");
  assert.ok(
    how.includes("of two views or materialized views, whether the catalog gives them the same definition"),
    "How it works says what measures a duplicate between two views or materialized views",
  );
});
