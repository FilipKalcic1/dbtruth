// safety.ts: the ONLY module that imports pg, and the only way to reach the database.
//
// Guarantees, in order of importance:
//   1. The session is read-only (SET default_transaction_read_only = on). At connect time the
//      server is asked to confirm the transaction mode it will enforce, and a trivial write is
//      attempted inside a transaction that is always rolled back; any refusal is fine, only an
//      accepted write disproves anything, and then the caller is warned loudly.
//   2. Only SELECT / WITH statements are issued through query().
//   3. Every statement has a timeout, and a timeout is a skipped measurement, not a crash.
//   4. A wall-clock budget covers all sampling and measuring; once spent, query() skips instead of running.
//   5. A lost connection is an error that stops the run: it is never reported as "nothing found".
//   6. The connection URL is never logged, stored or returned.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";

export type Row = Record<string, unknown>;

export type QueryResult =
  | { ok: true; rows: Row[] }
  | { ok: false; reason: "timeout" | "budget" | "refused" | "error"; message: string; sqlState?: string };

export type Db = {
  /** current_database(), safe to print. */
  readonly database: string;
  /** true when the server confirmed a read-only transaction mode, or refused the write attempt as read-only. */
  readonly readOnlyProven: boolean;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  /**
   * Like query, but outside the budget: for the handful of catalog reads that describe the
   * schema. Still read-only, still bounded by the statement timeout.
   */
  catalog(sql: string, params?: unknown[]): Promise<QueryResult>;
  budget(): { budgetMs: number; spentMs: number; remainingMs: number; exhausted: boolean };
  close(): Promise<void>;
};

export type SafetyOptions = {
  statementTimeoutSeconds: number;
  budgetSeconds: number;
  warn?: (message: string) => void;
};

// Postgres SQLSTATE codes and classes.
const READ_ONLY_SQL_TRANSACTION = "25006";
const QUERY_CANCELED = "57014";
const CONNECTION_EXCEPTION_CLASS = "08";
const OPERATOR_INTERVENTION_CLASS = "57";
/** Datatype problems that a comparison as text can get around. */
export const DATATYPE_MISMATCH_STATES: readonly string[] = ["42804", "42883", "42846"];

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
  await client.query(`SET statement_timeout = ${Math.max(1, Math.round(opts.statementTimeoutSeconds * MS_PER_SECOND))}`);

  const dbRow = (await client.query("SELECT current_database() AS db")).rows[0] as Row;
  const database = String(dbRow.db);

  const proof = await proveReadOnly(client);
  if (!proof.proven) {
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
      const state = sqlState(e);
      if (isConnectionLoss(state)) throw new Error(`database connection lost: ${errorMessage(e)}`);
      if (state === QUERY_CANCELED) return { ok: false, reason: "timeout", message: errorMessage(e), sqlState: state };
      return { ok: false, reason: "error", message: errorMessage(e), ...(state ? { sqlState: state } : {}) };
    } finally {
      if (budgeted) spentMs += performance.now() - started;
    }
  }

  return {
    database,
    readOnlyProven: proof.proven,
    query: (sql, params = []) => run(sql, params, true),
    catalog: (sql, params = []) => run(sql, params, false),
    budget() {
      return { budgetMs, spentMs, remainingMs: Math.max(0, budgetMs - spentMs), exhausted: spentMs >= budgetMs };
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

/** A client-side failure (no SQLSTATE), a class 08 connection exception, or a class 57 shutdown. */
function isConnectionLoss(state: string | undefined): boolean {
  if (state === undefined) return true;
  if (state === QUERY_CANCELED) return false;
  return state.startsWith(CONNECTION_EXCEPTION_CLASS) || state.startsWith(OPERATOR_INTERVENTION_CLASS);
}

function isReadStatement(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(sql);
}

function sqlState(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
    ? (e as { code: string }).code
    : undefined;
}

function errorMessage(e: unknown): string {
  if (e instanceof AggregateError) return e.errors.map(errorMessage).join("; ");
  if (e instanceof Error) return e.message || (sqlState(e) ?? e.name);
  return String(e);
}

// ---------- Postgres type families, by declared type, never by column name ----------

/**
 * "text" for free-text families, "time" for dates and timestamps, "other" for everything else.
 * Arrays are "other": their values are neither a text key nor a single date.
 */
export function typeFamily(type: string): "text" | "time" | "other" {
  const trimmed = type.trim().toLowerCase();
  if (trimmed.endsWith("[]")) return "other";
  const base = trimmed.replace(/\(.*\)/, "").trim();
  if (["text", "character varying", "character", "varchar", "char", "citext", "name", "json", "jsonb", "xml", "bytea"].includes(base)) return "text";
  if (base.startsWith("timestamp") || base === "date") return "time";
  return "other";
}

// ---------- SQL text helpers: every module that builds SQL uses these ----------

/** Double-quoted identifier. */
export function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** The relation's own name, without the "schema." prefix a display name carries outside public. */
export function bareName(t: { schema: string; name: string }): string {
  return t.name.startsWith(`${t.schema}.`) ? t.name.slice(t.schema.length + 1) : t.name;
}

/** "schema"."table" for a relation whose display name may be "schema.table". */
export function qualified(t: { schema: string; name: string }): string {
  return `${q(t.schema)}.${q(bareName(t))}`;
}

export type SampleConfig = { sampleRows: number; sampleOversample: number; sampleSeed: number };

/**
 * A bounded source of rows, wrapped in parentheses: TABLESAMPLE SYSTEM (random pages, repeatable
 * so two statements see the same pages) when the table is known to be larger than the sample,
 * a plain LIMIT otherwise or when random is false.
 */
export function sampleSource(t: { schema: string; name: string; rowEstimate: number }, cfg: SampleConfig, random = true): string {
  if (!random || t.rowEstimate <= cfg.sampleRows) return `(SELECT * FROM ${qualified(t)} LIMIT ${cfg.sampleRows})`;
  const percent = Math.min(100, (cfg.sampleRows / t.rowEstimate) * 100 * cfg.sampleOversample);
  return `(SELECT * FROM ${qualified(t)} TABLESAMPLE SYSTEM (${percent.toFixed(4)}) REPEATABLE (${cfg.sampleSeed}) LIMIT ${cfg.sampleRows})`;
}

/**
 * Runs a statement built over a sampled source. If the sampled form is rejected (a relation that
 * does not support TABLESAMPLE, for one), the plain LIMIT form is tried once. Timeouts and the
 * budget are not retried.
 */
export async function querySampled(
  db: Db,
  t: { schema: string; name: string; rowEstimate: number },
  cfg: SampleConfig,
  build: (source: string) => string,
): Promise<{ source: string; result: QueryResult }> {
  const sampled = sampleSource(t, cfg);
  const plain = sampleSource(t, cfg, false);
  let source = sampled;
  let result = await db.query(build(source));
  if (!result.ok && result.reason === "error" && sampled !== plain) {
    source = plain;
    result = await db.query(build(source));
  }
  return { source, result };
}
