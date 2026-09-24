// safety.ts: the ONLY module that imports pg, and the only way to reach the database.
//
// Guarantees, in order of importance:
//   1. The session is read-only (SET default_transaction_read_only = on). At connect time the
//      server is asked to confirm the transaction mode it will enforce, and a trivial write is
//      attempted inside a transaction that is always rolled back; any refusal is fine, only an
//      accepted write disproves anything, and then the caller is warned loudly.
//   2. Only SELECT / WITH statements are issued through query().
//   3. Every statement has a timeout, and a timeout is a skipped measurement, not a crash. Connecting has the same limit.
//   4. A wall-clock budget covers all sampling and measuring; once spent, query() skips instead of running.
//   5. A lost connection is an error that stops the run: it is never reported as "nothing found".
//   6. The connection URL is never logged, stored or returned. A failed connection is told in a sentence of our own,
//      never the driver's message, which can hold the user, the host and the database.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
const INVALID_CATALOG_NAME = "3D000";
const CONNECTION_EXCEPTION_CLASS = "08";
const INVALID_AUTHORIZATION_CLASS = "28";
const OPERATOR_INTERVENTION_CLASS = "57";
/** The server function that refuses a connection pg_hba.conf does not admit: an unencrypted one where SSL is required. */
const PG_HBA_REFUSAL = "ClientAuthentication";
/** What pg's own connect timeout fails with: this message, and no code. */
const PG_CONNECT_TIMEOUT = "timeout expired";
/** Datatype problems that a comparison as text can get around. */
export const DATATYPE_MISMATCH_STATES: readonly string[] = ["42804", "42883", "42846"];

const MS_PER_SECOND = 1000;

/** KEY=value pairs from a .env file in cwd, or {} when there is none. Values are never printed. */
export function readDotEnv(cwd: string): Record<string, string> {
  try {
    return readEnvFile(join(cwd, ".env"));
  } catch {
    return {};
  }
}

/** KEY=value pairs from one settings file; throws when it cannot be read. Values are never printed. */
export function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * The .env nearest to start, looking up to the repository root: the first directory with a .git,
 * a directory or, in a worktree or submodule, a file. Outside a repository only start is searched,
 * so an unrelated ~/.env is never read. The nearest file is used whole, never merged with another;
 * one that cannot be read is listed in searched with its error, and the search goes on. A directory named
 * .env, such as a Python virtualenv, is not a settings file and is passed over like a missing one.
 */
export function findDotEnv(start: string): { path?: string; values: Record<string, string>; searched: { dir: string; error?: string }[] } {
  // From the real path, so a symlinked directory is searched where it really is.
  const from = realpathSync(start);
  const root = repositoryRoot(from) ?? from;
  const searched: { dir: string; error?: string }[] = [];
  for (let dir = from; ; dir = dirname(dir)) {
    const path = join(dir, ".env");
    try {
      if (statSync(path, { throwIfNoEntry: false })?.isFile()) return { path, values: readEnvFile(path), searched: [...searched, { dir }] };
      searched.push({ dir });
    } catch (e) {
      searched.push({ dir, error: errorMessage(e) });
    }
    if (dir === root) return { values: {}, searched };
  }
}

/** The first directory from dir upward that holds a .git, or undefined when none does up to the filesystem or drive root. */
function repositoryRoot(dir: string): string | undefined {
  while (!existsSync(join(dir, ".git"))) {
    if (dirname(dir) === dir) return undefined;
    dir = dirname(dir);
  }
  return dir;
}

export type Settings = {
  /** The environment over the file's values. */
  env: Record<string, string | undefined>;
  /** The file read, relative to cwd as given. */
  file?: string;
  /** Whether that file is outside cwd, judged on real paths, so a symlinked cwd's own .env is not. */
  elsewhere: boolean;
  searched: { dir: string; error?: string }[];
};

/**
 * What every command reads DATABASE_URL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and DBTRUTH_* from: the environment, over
 * the file dotenv names, relative to cwd, or else over the .env findDotEnv finds. A .env that could not be read is
 * reported through warn, so a file used further up is no surprise; never a value. When the file dotenv names does not
 * exist or cannot be read, the line that says so instead.
 */
export function readSettings(cwd: string, dotenv: string | undefined, environment: Record<string, string | undefined>, warn: (line: string) => void): Settings | string {
  let found: ReturnType<typeof findDotEnv>;
  if (dotenv) {
    const path = resolve(cwd, dotenv);
    if (!existsSync(path)) return `--dotenv ${dotenv}: no such file`;
    try {
      found = { path, values: readEnvFile(path), searched: [] };
    } catch (e) {
      return `--dotenv ${dotenv}: could not read it (${errorMessage(e)})`;
    }
  } else {
    found = findDotEnv(cwd);
  }
  // Relative to cwd as given, not its real path, because Windows resolves ".." as written.
  for (const { dir, error } of found.searched) {
    if (error) warn(`could not read ${relative(cwd, join(dir, ".env"))} (${error})`);
  }
  return {
    env: { ...found.values, ...environment },
    file: found.path && relative(cwd, found.path),
    elsewhere: found.path !== undefined && realpathSync(dirname(found.path)) !== realpathSync(cwd),
    searched: found.searched,
  };
}

/** DATABASE_URL from --url, then the environment (merged with .env by the caller). Never printed. */
export function resolveDatabaseUrl(flagUrl: string | undefined, env: Record<string, string | undefined>): string | undefined {
  return flagUrl || env.DATABASE_URL || undefined;
}

export async function connect(url: string, opts: SafetyOptions): Promise<Db> {
  // pg sets no limit on connecting, and a host that drops packets would hold the run for the system's TCP timeout.
  const timeoutMs = Math.max(1, Math.round(opts.statementTimeoutSeconds * MS_PER_SECOND));
  let client: pg.Client;
  try {
    // Inside the try: the driver parses the URL and reads the certificate files it names here, and its errors quote them.
    client = new pg.Client({ connectionString: url, application_name: "dbtruth", connectionTimeoutMillis: timeoutMs });
    await client.connect();
  } catch (e) {
    throw new Error(connectFailure(e, opts.statementTimeoutSeconds));
  }

  let database: string;
  let proof: { proven: boolean; detail: string };
  try {
    await client.query("SET default_transaction_read_only = on");
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    database = String(((await client.query("SELECT current_database() AS db")).rows[0] as Row).db);
    proof = await proveReadOnly(client);
  } catch (e) {
    await client.end();
    const state = sqlState(e);
    throw new Error(`the server accepted the connection but refused to set up a read-only session${state ? ` (${state})` : ""}`);
  }
  if (!proof.proven) {
    opts.warn?.(`the session asked for read-only mode but could not prove it: ${proof.detail}. dbtruth still issues only SELECT statements.`);
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

/**
 * One sentence for each common reason a connection fails, and otherwise the code alone: never the driver's message,
 * which can hold the user, the host and the database from the URL.
 */
function connectFailure(e: unknown, timeoutSeconds: number): string {
  const code = sqlState(e);
  const because = (cause: string) => `could not connect to the database: ${cause}`;
  if (code === "ECONNREFUSED") return because("nothing is listening at the host and port in the URL; check them, and that the server is running");
  if (code === "ENOTFOUND") return because("the host in the URL was not found; check its spelling");
  if (e instanceof pg.DatabaseError && e.routine === PG_HBA_REFUSAL) {
    return because("the server's access rules refused this connection; if the server requires SSL, add sslmode=verify-full to the URL");
  }
  if (code?.startsWith(INVALID_AUTHORIZATION_CLASS)) return because("authentication failed; check the user and password in the URL");
  if (code === INVALID_CATALOG_NAME) return because("the database named in the URL does not exist on that server");
  if (e instanceof Error && e.message === PG_CONNECT_TIMEOUT) {
    return because(`the server did not answer within ${timeoutSeconds}s; check the host and port in the URL, and any firewall on the way`);
  }
  if (code) return `could not connect to the database (${code})`;
  return "could not connect to the database";
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

/**
 * The relations dbtruth describes, as a condition on pg_class c joined to pg_namespace n: tables, partitioned tables,
 * views and materialized views outside the system schemas and the temporary schemas, whose tables are not the user's
 * schema: another session's cannot be read from this one, and this session's own, behind a pooler that shares server
 * sessions, are another client's. Partitions match too; the extract folds them into their parent.
 */
export const DESCRIBED_RELATIONS =
  "c.relkind IN ('r', 'p', 'v', 'm') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' " +
  "AND NOT pg_is_other_temp_schema(n.oid) AND n.oid <> pg_my_temp_schema()";

export type SampleConfig = { sampleRows: number; sampleOversample: number; sampleSeed: number };

/**
 * A bounded source of rows, wrapped in parentheses: a plain LIMIT when the table is no larger than
 * the sample or when random is false, otherwise TABLESAMPLE SYSTEM sized from the row estimate
 * to yield about sampleRows rows, repeatable so two statements see the same pages, and cut only
 * when the estimate was low by more than sampleOversample (pages come in file order, so a cut keeps
 * the oldest).
 */
export function sampleSource(t: { schema: string; name: string; rowEstimate: number }, cfg: SampleConfig, random = true): string {
  if (!random || t.rowEstimate <= cfg.sampleRows) return `(SELECT * FROM ${qualified(t)} LIMIT ${cfg.sampleRows})`;
  const percent = Number(((cfg.sampleRows / t.rowEstimate) * 100).toPrecision(4));
  return `(SELECT * FROM ${qualified(t)} TABLESAMPLE SYSTEM (${percent}) REPEATABLE (${cfg.sampleSeed}) LIMIT ${cfg.sampleRows * cfg.sampleOversample})`;
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
