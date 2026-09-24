// doctor.ts: what stands between this setup and a full run, found without spending a token.
//
// Eight checks in order, one line each on stderr: "ok <what>", "FAIL <what>: <fix>", or "note <what>" for what is
// neither; stdout stays empty. The setup is ready when the first six pass. The last two only inform: relations the role
// cannot read are a note, since a role may be meant to read part of a database, and so is a missing API key, which only
// a full run needs; a key the API rejects fails, and the setup is still ready. A check that needs an earlier one that
// failed is not run: after a failed connection only the key is checked. A .env that could not be read on the way is
// named on a line of its own, as in a full run.

import { resolveConfig, type Config, type Overrides } from "./config.js";
import { createModel, DEFAULT_MODEL } from "./model.js";
import { connect, DESCRIBED_RELATIONS, readSettings, resolveDatabaseUrl, type Db } from "./safety.js";

// The oldest versions dbtruth supports, as README.md states and CI tests.
const NODE_MINIMUM = 20;
const POSTGRES_MINIMUM = 12;

export type DoctorOptions = {
  url?: string;
  /** The settings file to read instead of looking for .env, relative to cwd. */
  dotenv?: string;
  /** The tunables given as flags, as a full run takes them. */
  flags: Overrides;
  cwd: string;
  env: Record<string, string | undefined>;
  /** The running Node's version, as process.version gives it. */
  node: string;
  err: (line: string) => void;
};

export type DoctorDeps = {
  /** Test hook: replaces the API check, so a test can pass or fail it without the network. */
  preflight?: () => Promise<void>;
};

/** Prints the checks and returns whether the setup is ready for a full run. */
export async function doctor(opts: DoctorOptions, deps: DoctorDeps = {}): Promise<boolean> {
  // 1. Node.
  const nodeReady = Number(/^v(\d+)\./.exec(opts.node)?.[1]) >= NODE_MINIMUM;
  if (nodeReady) opts.err(`ok Node ${opts.node}`);
  else opts.err(`FAIL Node ${opts.node}: dbtruth needs Node ${NODE_MINIMUM} or newer`);

  // 2. The settings, read and checked as a full run reads and checks them.
  const settings = readSettings(opts.cwd, opts.dotenv, opts.env, opts.err);
  if (typeof settings === "string") {
    opts.err(`FAIL ${settings}`);
    return false;
  }
  let cfg: Config;
  try {
    cfg = resolveConfig(settings.env, opts.flags);
  } catch (e) {
    opts.err(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  opts.err(`ok settings from ${settings.file ?? "the environment"}`);

  // 3. Never printed, not even the host.
  const url = resolveDatabaseUrl(opts.url, settings.env);
  if (url) opts.err("ok database URL set");
  else opts.err(`FAIL no database URL: set DATABASE_URL in ${settings.file ?? "a .env"}, in the environment, pass --url, or read a file elsewhere with --dotenv <path>`);
  const databaseReady = url !== undefined && (await checkDatabase(url, cfg, opts.err));

  // 8. The key, by the one request that sends nothing but the model id.
  const apiKey = settings.env.ANTHROPIC_API_KEY;
  if (!apiKey) opts.err("note no API key: a full run needs ANTHROPIC_API_KEY; doctor does not");
  else {
    const model = settings.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    try {
      await (deps.preflight?.() ?? createModel({ rawDir: opts.cwd, model, maxOutputTokens: cfg.modelMaxOutputTokens, apiKey }).preflight());
      opts.err(`ok ANTHROPIC_API_KEY works with ${model}`);
    } catch (e) {
      opts.err(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return nodeReady && databaseReady;
}

/** Checks 4 to 7, the ones that hold the connection; true when 4 to 6 pass. */
async function checkDatabase(url: string, cfg: Config, err: (line: string) => void): Promise<boolean> {
  // 4. Connected, the session read-only and the proof taken, or one sentence on why not.
  let unproven = "";
  let db: Db;
  try {
    db = await connect(url, { ...cfg, warn: (message) => (unproven = message) });
  } catch (e) {
    err(`FAIL ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  try {
    err(`ok connected to ${db.database}`);
    // 5. The statement guard admits SELECT and WITH only, so SHOW would be refused.
    const version = await db.catalog("SELECT current_setting('server_version_num')::int / 10000 AS major");
    if (!version.ok) throw new Error(`could not read the server version: ${version.message}`);
    const major = Number(version.rows[0]!.major);
    const versionReady = major >= POSTGRES_MINIMUM;
    if (versionReady) err(`ok Postgres ${major}`);
    else err(`FAIL Postgres ${major}: dbtruth needs Postgres ${POSTGRES_MINIMUM} or newer`);

    // 6. In the words of the full run's warning.
    if (db.readOnlyProven) err("ok read-only session proven");
    else err(`FAIL ${unproven}`);

    // 7. Informs only, and only on a server dbtruth supports: the count reads relispartition, which Postgres 9 lacks.
    // The relations the extract describes, less the partitions it folds into their parent.
    if (!versionReady) return false;
    const r = await db.catalog(
      `SELECT count(*) FILTER (WHERE has_table_privilege(c.oid, 'SELECT')) AS readable,
              count(*) FILTER (WHERE NOT has_table_privilege(c.oid, 'SELECT')) AS unreadable
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE ${DESCRIBED_RELATIONS} AND NOT c.relispartition`,
    );
    if (!r.ok) throw new Error(`could not read the catalog: ${r.message}`);
    const { readable, unreadable } = r.rows[0]!;
    if (Number(unreadable) > 0) err(`note ${readable} relations readable, ${unreadable} not: measurements on those will be skipped`);
    else err(`ok ${readable} relations readable, ${unreadable} not`);
    return db.readOnlyProven;
  } finally {
    await db.close();
  }
}
