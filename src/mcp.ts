// mcp.ts: the four tools dbtruth serves an agent over MCP, and the server that serves them on stdio. The ONLY module that
// imports the MCP SDK.
//
//   context         context/README.md, or one table's file, from disk; never the database
//   describe_table  a relation as the catalog and a sample describe it now
//   measure_join    one join, measured and decided as a full run measures and decides it
//   check           the snapshot measured again, as dbtruth check measures it
//
// No model is called, so no API key is needed. A name from the agent is a key to look up in the catalog that same call
// reads, never SQL, and a condition's value is only ever $1. An answer carries only what a full run's outputs carry:
// names, types, counts, rates, the values of categorical columns, and queries. One connection, opened by the first call
// that needs it and closed when the client goes; the calls that use it run one at a time, each with a budget of its own.
// stdout carries the protocol and nothing else.

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { remeasure, reportLines } from "./check.js";
import type { Config } from "./config.js";
import { extract, integerKeys, readCatalog, type Catalog } from "./extract.js";
import type { Connection } from "./safety.js";
import { declares, findTable, relationshipId, type Relationship, type Table } from "./schemas.js";
import { readSnapshot } from "./snapshot.js";
import { decide } from "./verdict.js";
import { verify } from "./verify.js";
import { confine, joinLine, OUTPUT_DIR, SNAPSHOT_FILE, tableFileName } from "./write.js";

export type Opened = { db: Connection; cfg: Config };
export type Reply = { content: { type: "text"; text: string }[]; isError?: true };

// A key the tool does not take is refused, never dropped, and so is half a condition: either would measure the whole
// join in place of the branch asked for.
const JoinSchema = z
  .strictObject({
    from_table: z.string(),
    from_column: z.string(),
    to_table: z.string(),
    to_column: z.string(),
    when_column: z.string().optional(),
    when_equals: z.string().optional(),
  })
  .refine((j) => (j.when_column === undefined) === (j.when_equals === undefined), { message: "when_column and when_equals go together: give both, or neither" });
export type Join = z.infer<typeof JoinSchema>;

/** The four tools' handlers over project's context/ and one connection, opened when a call first needs it; exported for in-process tests. */
export function tools(project: string, open: () => Promise<Opened>) {
  let held: Opened | undefined;
  // Each call that uses the database waits for the one before. None rejects, so one that fails never stops the next.
  let turn: Promise<unknown> = Promise.resolve();

  /** Ends the connection now: inside a call's turn, where no other call can be using it. */
  async function drop(): Promise<void> {
    const connection = held;
    held = undefined;
    await connection?.db.close();
  }

  function withDatabase(work: (db: Connection, cfg: Config) => Promise<Reply>): Promise<Reply> {
    const call = turn.then(async () => {
      try {
        // Closed by the server or the network while the session idled: replaced without a word.
        if (held?.db.lost() !== undefined) await drop();
        held ??= await open();
        held.db.resetBudget(held.cfg.mcpCallBudgetSeconds);
        return await work(held.db, held.cfg);
      } catch (e) {
        // No settings yet, no connection, or one lost during the call: this call says why, and the next reads the
        // settings and connects again.
        await drop();
        return refuse(e instanceof Error ? e.message : String(e));
      }
    });
    turn = call;
    return call;
  }

  return {
    /**
     * Ends the connection after the calls already made: one still opening its connection would otherwise open it after
     * this found none to end, and the open socket would keep the process from exiting.
     */
    close(): Promise<void> {
      const closing = turn.then(drop);
      turn = closing;
      return closing;
    },

    async context({ table }: { table?: string }): Promise<Reply> {
      // A table's file keeps its three parts whatever the name, so confine never refuses it.
      const path = join(project, table === undefined ? `${OUTPUT_DIR}/README.md` : confine(tableFileName(table))!);
      const dir = dirname(path);
      const listed = statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? readdirSync(dir, { withFileTypes: true }) : [];
      // The name as listed, exactly: where case is ignored, users would otherwise open Users.md, another table's file.
      const entry = listed.find((e) => e.name === basename(path));
      if (!entry) {
        const tables = listed.map((e) => e.name).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -".md".length));
        return refuse(table !== undefined && tables.length > 0 ? unknown("table", table, tables) : `no ${path}: run npx dbtruth first`);
      }
      // As listed, a link is not a file, so it is not followed; nor is a directory read.
      if (!entry.isFile()) return refuse(`${path} is not a file`);
      return reply(readFileSync(path, "utf8"));
    },

    describeTable: ({ table }: { table: string }) =>
      withDatabase(async (db, cfg) => {
        const found = lookUp(await readCatalog(db), table);
        if (typeof found === "string") return refuse(found);
        // No sample row is shown, so none is read: only the value lists of categorical columns leave the database.
        const { tables, skipped } = await extract(db, { ...cfg, sampleRowsShown: 0 }, [found], { samples: true, reveal: new Set() });
        if (skipped.length > 0) return refuse(notExamined(found.name));
        return reply(JSON.stringify(described(tables[0]!), null, 2));
      }),

    measureJoin: (asked: Join) =>
      withDatabase(async (db, cfg) => {
        const catalog = await readCatalog(db);
        const from = lookUp(catalog, asked.from_table, asked.from_column, asked.when_column);
        if (typeof from === "string") return refuse(from);
        const to = lookUp(catalog, asked.to_table, asked.to_column);
        if (typeof to === "string") return refuse(to);
        const claim: Relationship = {
          from: { table: from.name, column: asked.from_column },
          to: { table: to.name, column: asked.to_column },
          ...(asked.when_column !== undefined && asked.when_equals !== undefined ? { when: { column: asked.when_column, equals: asked.when_equals } } : {}),
          // As prompt A claims a join: stated when the database declares it.
          basis: declares(from, asked.from_column, to, asked.to_column) ? "stated" : "inferred",
          confidence: 1,
          reason: "measure_join",
        };
        const extracted = await extract(db, cfg, catalog.filter((r) => r === from || r === to), { samples: false, reveal: new Set() });
        // verify would call a relation the budget skipped unknown.
        if (extracted.skipped.length > 0) return refuse(notExamined(extracted.skipped[0]!));
        const claims = { entities: [], tables: [], relationships: [claim], suspicions: [], questions: [] };
        const [measured] = await verify(db, cfg, extracted, claims, () => integerKeys(db, cfg, catalog));
        const verdict = decide(measured!, cfg);
        return reply(joinLine(claim, verdict), JSON.stringify({ claim: relationshipId(claim), ...verdict }, null, 2));
      }),

    async check(): Promise<Reply> {
      // Read and checked before anything connects, as by dbtruth check.
      const snapshot = readSnapshot(project, join(project, OUTPUT_DIR, SNAPSHOT_FILE));
      if (typeof snapshot === "string") return refuse(snapshot);
      return withDatabase(async (db, cfg) => {
        const report = await remeasure(db, cfg, snapshot);
        return reply(reportLines(report).join("\n"), JSON.stringify(report, null, 2));
      });
    },
  };
}

/** Serves the tools on stdin and stdout until the client closes stdin or the process is stopped, then closes the connection. */
export async function serve(opts: { project: string; version: string; open: () => Promise<Opened>; err: (line: string) => void }): Promise<void> {
  const handlers = tools(opts.project, opts.open);
  await new Promise<void>((closed) => {
    const handle = serveStdio(
      () => {
        const server = new McpServer({ name: "dbtruth", version: opts.version });
        server.registerTool(
          "context",
          {
            description:
              "What the last dbtruth run measured about this project's Postgres database: context/README.md, or with a table, that table's file (key, size, joins with their measured verdicts, known problems, allowed values). Read it before writing SQL. Reads files only.",
            inputSchema: z.strictObject({ table: z.string().optional() }),
          },
          handlers.context,
        );
        server.registerTool(
          "describe_table",
          {
            description:
              "A table or view as the database holds it now: keys, size (rowEstimate -1 is unknown), and per column the type, null rate and distinct count on a sample, with the allowed values of a column that has a few short ones. Use it for a table context/ has no file for, or when the schema may have changed. Name it as context/ does: table, or schema.table outside public.",
            inputSchema: z.strictObject({ table: z.string() }),
          },
          handlers.describeTable,
        );
        server.registerTool(
          "measure_join",
          {
            description:
              "Measures on the data whether from_table.from_column joins to_table.to_column: the share of sampled rows whose value the target holds, the orphans and where they fall, and the query to rerun it. Call it before relying on a join context/ does not list as confirmed. With when_column and when_equals, only the rows whose when_column reads when_equals: one branch of a column that points at different tables.",
            inputSchema: JoinSchema,
          },
          handlers.measureJoin,
        );
        server.registerTool(
          "check",
          {
            description:
              "Measures again what context/snapshot.json claims and says what moved since the last dbtruth run: regressions, stale claims, drift. Use it when context/ may be out of date.",
            inputSchema: z.strictObject({}),
          },
          handlers.check,
        );
        return server;
      },
      { onerror: (e) => opts.err(`mcp: ${e.message}`) },
    );
    // The connection ends when the client closes stdin, or a signal closes the handle; not when an instance closes, as
    // the one the SDK made to answer a client's server/discover does before it serves the client from another.
    process.stdin.once("end", closed).once("close", closed);
    const stop = () => void handle.close().then(closed);
    process.once("SIGINT", stop).once("SIGTERM", stop);
  });
  await handlers.close();
}

/** Every name the fewest single-character edits from name, ignoring case, in the order given: spellings only, never a meaning. */
export function closest(name: string, names: string[]): string[] {
  const distances = names.map((n) => edits(name.toLowerCase(), n.toLowerCase()));
  const fewest = distances.reduce((a, b) => Math.min(a, b), Infinity);
  return names.filter((_, i) => distances[i] === fewest);
}

/** The Levenshtein distance: the fewest insertions, deletions and substitutions that turn a into b. */
function edits(a: string, b: string): number {
  let above = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(above[j]! + 1, row[j - 1]! + 1, above[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    above = row;
  }
  return above[b.length]!;
}

/** The relation named in the catalog, with the columns named checked there exactly, or why not, with the closest names. */
function lookUp(catalog: Catalog, table: string, ...columns: (string | undefined)[]): Catalog[number] | string {
  const found = findTable(catalog, table);
  if (!found) return unknown("table", table, catalog.map((r) => r.name));
  const names = found.columns.map((c) => c.name);
  // A column not asked for, such as a condition's when there is none, is undefined.
  const missing = columns.find((c) => c !== undefined && !names.includes(c));
  return missing === undefined ? found : unknown("column", `${found.name}.${missing}`, names.map((c) => `${found.name}.${c}`));
}

/**
 * What describe_table answers, field by field and never a Table spread: no sample row, comment, view definition, year
 * range or longest value, and values only where extract listed them, for a categorical column (R3). A relation that
 * could not be sampled says why, and has no null rate or distinct count to show.
 */
function described(t: Table) {
  return {
    name: t.name,
    kind: t.kind,
    populated: t.populated,
    partitions: t.partitions,
    rowEstimate: t.rowEstimate,
    estimateSource: t.estimateSource,
    unmeasured: t.unmeasured,
    primaryKey: t.primaryKey,
    foreignKeys: t.foreignKeys,
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      ...(t.unmeasured === undefined ? { nullRate: c.nullRate, distinct: c.distinct } : {}),
      values: c.values,
    })),
  };
}

function reply(...texts: string[]): Reply {
  return { content: texts.map((text) => ({ type: "text", text })) };
}

function refuse(text: string): Reply {
  return { content: [{ type: "text", text }], isError: true };
}

function unknown(what: "table" | "column", name: string, names: string[]): string {
  return `unknown ${what} ${name}; the closest: ${closest(name, names).join(", ") || "none"}`;
}

function notExamined(name: string): string {
  return `${name} was not examined within this call's time budget; raise DBTRUTH_MCP_CALL_BUDGET_SECONDS`;
}
