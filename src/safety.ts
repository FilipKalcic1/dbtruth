// safety.ts: the ONLY module that imports pg, and the only way to reach the database.
//
// Guarantees, in order of importance:
//   1. The session is read-only (SET default_transaction_read_only = on) and that is
//      proven at connect time by a write attempt inside a transaction that is always
//      rolled back. If the attempt does not fail, the caller is warned loudly.
//   2. Only SELECT / WITH statements are issued through query().
//   3. Every statement has a timeout, and a timeout is a skipped measurement, not a crash.
//   4. A wall-clock budget covers all query time; once spent, query() skips instead of running.
//   5. The connection URL is never logged, stored or returned.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";

export type Row = Record<string, unknown>;

export type QueryResult =
  | { ok: true; rows: Row[] }
  | { ok: false; reason: "timeout" | "budget" | "refused" | "error"; message: string };

export type Db = {
  /** current_database(), safe to print. */
  readonly database: string;
  /** true when the preflight write attempt was refused by Postgres. */
  readonly readOnlyProven: boolean;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  /**
   * Like query, but outside the budget: for the handful of catalog reads that describe the
   * schema. Still read-only, still bounded by the statement timeout.
   */
  catalog(sql: string, params?: unknown[]): Promise<QueryResult>;
  budget(): { spentMs: number; remainingMs: number; exhausted: boolean };
  close(): Promise<void>;
};

export type SafetyOptions = {
  statementTimeoutSeconds: number;
  budgetSeconds: number;
  warn?: (message: string) => void;
};

// Postgres SQLSTATE codes.
const READ_ONLY_SQL_TRANSACTION = "25006";
const QUERY_CANCELED = "57014";

const MS_PER_SECOND = 1000;

/** KEY=value pairs from a .env file in cwd, or {} when there is none. Values are never printed. */
export function readDotEnv(cwd: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(join(cwd, ".env"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** DATABASE_URL from --url, then the environment (merged with .env by the caller). Never printed. */
export function resolveDatabaseUrl(flagUrl: string | undefined, env: Record<string, string | undefined>): string | undefined {
  return flagUrl || env.DATABASE_URL || undefined;
}

export async function connect(url: string, opts: SafetyOptions): Promise<Db> {
  const client = new pg.Client({ connectionString: url, application_name: "dbtruth" });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`could not connect to the database: ${errorMessage(e)}`);
  }

  await client.query("SET default_transaction_read_only = on");
  await client.query(`SET statement_timeout = ${Math.round(opts.statementTimeoutSeconds * MS_PER_SECOND)}`);

  const dbRow = (await client.query("SELECT current_database() AS db")).rows[0] as Row;
  const database = String(dbRow.db);

  const proof = await proveReadOnly(client);
  const readOnlyProven = proof.proven;
  if (!readOnlyProven) {
    opts.warn?.(
      `WARNING: the session asked for read-only mode but could not prove it: ${proof.detail}. ` +
        "dbtruth still issues only SELECT statements.",
    );
  }

  const budgetMs = opts.budgetSeconds * MS_PER_SECOND;
  let spentMs = 0;

  async function run(sql: string, params: unknown[], budgeted: boolean): Promise<QueryResult> {
    if (!isReadStatement(sql)) {
      return { ok: false, reason: "refused", message: "dbtruth only issues SELECT statements" };
    }
    if (budgeted && spentMs >= budgetMs) {
      return { ok: false, reason: "budget", message: "time budget exhausted" };
    }
    const started = performance.now();
    try {
      const result = await client.query(sql, params);
      return { ok: true, rows: result.rows as Row[] };
    } catch (e) {
      const reason = sqlState(e) === QUERY_CANCELED ? "timeout" : "error";
      return { ok: false, reason, message: errorMessage(e) };
    } finally {
      if (budgeted) spentMs += performance.now() - started;
    }
  }

  return {
    database,
    readOnlyProven,

    query: (sql, params = []) => run(sql, params, true),
    catalog: (sql, params = []) => run(sql, params, false),

    budget() {
      return { spentMs, remainingMs: Math.max(0, budgetMs - spentMs), exhausted: spentMs >= budgetMs };
    },

    async close() {
      await client.end();
    },
  };
}

/**
 * Two proofs inside one transaction that is always rolled back. First the server states the
 * transaction mode it will enforce. Then a trivial write is attempted: the one write-shaped
 * statement this tool ever sends, expected to be refused. Any refusal is fine; a role without
 * CREATE privilege refuses it with 42501 and is read-only all the same. Only an accepted write
 * disproves anything.
 */
async function proveReadOnly(client: pg.Client): Promise<{ proven: boolean; detail: string }> {
  await client.query("BEGIN");
  try {
    const mode = String((await client.query("SELECT current_setting('transaction_read_only') AS mode")).rows[0]?.mode);
    try {
      await client.query("CREATE TABLE dbtruth_preflight_must_fail (x int)");
      return { proven: false, detail: "the server accepted a CREATE TABLE inside what should be a read-only transaction" };
    } catch (e) {
      const state = sqlState(e) ?? "unknown";
      if (mode === "on") return { proven: true, detail: `transaction_read_only is on; the write was refused with SQLSTATE ${state}` };
      if (state === READ_ONLY_SQL_TRANSACTION) return { proven: true, detail: "the write was refused as a read-only transaction" };
      return { proven: false, detail: `transaction_read_only is ${mode} and the write was refused only with SQLSTATE ${state}` };
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

// ---------- Postgres type families, by declared type, never by column name ----------

/** "text" for free-text families, "time" for dates and timestamps, "other" for everything else. */
export function typeFamily(type: string): "text" | "time" | "other" {
  const base = type.replace(/\[\]$/, "").replace(/\(.*\)$/, "").trim().toLowerCase();
  if (["text", "character varying", "character", "varchar", "char", "citext", "name", "json", "jsonb", "xml", "bytea"].includes(base)) return "text";
  if (base.startsWith("timestamp") || base === "date") return "time";
  return "other";
}

function isReadStatement(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(sql);
}

function sqlState(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

function errorMessage(e: unknown): string {
  if (e instanceof AggregateError) return e.errors.map(errorMessage).join("; ");
  if (e instanceof Error) return e.message || (sqlState(e) ?? e.name);
  return String(e);
}

// ---------- SQL text helpers: every module that builds SQL uses these ----------

/** Double-quoted identifier. */
export function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** "schema"."table" for a table whose display name may be "schema.table". */
export function qualified(t: { schema: string; name: string }): string {
  const bare = t.name.startsWith(`${t.schema}.`) ? t.name.slice(t.schema.length + 1) : t.name;
  return `${q(t.schema)}.${q(bare)}`;
}

/**
 * A bounded source of rows, wrapped in parentheses: TABLESAMPLE SYSTEM (random pages) when
 * the table is larger than the sample, a plain LIMIT otherwise or when random is false.
 */
export function sampleSource(
  t: { schema: string; name: string; rowEstimate: number },
  cfg: { sampleRows: number; sampleOversample: number },
  random = true,
): string {
  if (!random || t.rowEstimate <= cfg.sampleRows) return `(SELECT * FROM ${qualified(t)} LIMIT ${cfg.sampleRows})`;
  const percent = Math.min(100, (cfg.sampleRows / t.rowEstimate) * 100 * cfg.sampleOversample);
  return `(SELECT * FROM ${qualified(t)} TABLESAMPLE SYSTEM (${percent.toFixed(4)}) LIMIT ${cfg.sampleRows})`;
}
