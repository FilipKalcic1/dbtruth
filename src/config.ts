// config.ts: the only place a number lives.
//
// Every tunable is here, with one line on what breaks if it is set wrong.
// Each can be overridden by a DBTRUTH_* environment variable or a CLI flag;
// the flag wins over the environment, the environment wins over the default.

export type Config = {
  sampleRows: number;
  sampleRowsShown: number;
  budgetSeconds: number;
  statementTimeoutSeconds: number;
  categoricalMaxDistinct: number;
  categoricalMaxValueLength: number;
  join: { confirmed: number; broken: number };
  staleAfterDays: number;
  duplicateOverlap: number;
  fitsInContextTokens: number;
  modelMaxOutputTokens: number;
  modelEffort: Effort;
  charsPerToken: number;
  sampleOversample: number;
};

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const config: Config = {
  // Rows sampled per table for null rate, distinct count and join checks.
  // Too low: a personal-data column can look categorical and be shown. Too high: slow on wide tables.
  sampleRows: 50_000,

  // Sample rows shown to the model per table.
  // Too high: tokens wasted on every table. Too low: the model cannot see value shapes.
  sampleRowsShown: 15,

  // Wall-clock seconds for sampling tables and verifying claims together. Reading the catalog is outside it.
  // Too low: most tables are skipped and most claims end up unverifiable. Too high: a big database keeps you waiting.
  budgetSeconds: 90,

  // Per-query timeout in seconds.
  // Too low: measurements on large tables time out. Too high: one bad query eats the budget.
  statementTimeoutSeconds: 10,

  // Text columns with more distinct values than this on the sample are hidden from the model.
  // Too high: personal data passes as "categorical". Too low: real enums are hidden.
  categoricalMaxDistinct: 50,

  // A text column also counts as categorical only if its longest value on the sample is at most this many characters.
  // Too low: long enum labels are hidden. Too high: a constant secret passes as categorical (an MD5 hash is 32, SHA-1 is 40).
  categoricalMaxValueLength: 30,

  // Join hit rate bands: at or above confirmed is a fact; at or above broken is a broken
  // relationship the output leads with; below broken is rejected.
  // Too low a broken bound: coincidental matches are reported. Too high: real problems vanish.
  join: { confirmed: 0.95, broken: 0.5 },

  // A table whose newest timestamp is older than this many days is dead.
  // Too low: seasonal tables look dead. Too high: dead tables look alive.
  staleAfterDays: 90,

  // Share of one table's sample rows found in the other for the pair to count as duplicates.
  // Too low: parent/child lookalikes are called duplicates. Too high: partial copies are missed.
  duplicateOverlap: 0.7,

  // If the schema alone serializes to fewer tokens than this, the README says you probably
  // do not need this tool. Too low: never said. Too high: said for schemas an agent cannot hold.
  fitsInContextTokens: 20_000,

  // Output token ceiling for one model reply, streamed.
  // Too low: the write step is cut off on databases with many tables. Too high: nothing, it is a ceiling.
  modelMaxOutputTokens: 64_000,

  // Reasoning effort for each model call (DBTRUTH_MODEL_EFFORT): low, medium, high, xhigh, max.
  // Too low: weaker claims and sloppier files. Too high: slower runs for the same result on small schemas.
  modelEffort: "high",

  // Characters per token used to size the schema against fitsInContextTokens.
  // Too low: small schemas look big. Too high: big schemas look small.
  charsPerToken: 4,

  // TABLESAMPLE SYSTEM returns whole pages, so ask for a few times more than needed and LIMIT.
  // Too low: samples fall short on tables with sparse pages. Too high: more rows scanned than needed.
  sampleOversample: 3,
};

// One row per tunable: where it lives in Config, its environment variable, its CLI flag.
export const overridable = [
  { path: "sampleRows", env: "DBTRUTH_SAMPLE_ROWS", flag: "sample-rows" },
  { path: "sampleRowsShown", env: "DBTRUTH_SAMPLE_ROWS_SHOWN", flag: "sample-rows-shown" },
  { path: "budgetSeconds", env: "DBTRUTH_BUDGET_SECONDS", flag: "budget-seconds" },
  { path: "statementTimeoutSeconds", env: "DBTRUTH_STATEMENT_TIMEOUT_SECONDS", flag: "statement-timeout-seconds" },
  { path: "categoricalMaxDistinct", env: "DBTRUTH_CATEGORICAL_MAX_DISTINCT", flag: "categorical-max-distinct" },
  { path: "categoricalMaxValueLength", env: "DBTRUTH_CATEGORICAL_MAX_VALUE_LENGTH", flag: "categorical-max-value-length" },
  { path: "join.confirmed", env: "DBTRUTH_JOIN_CONFIRMED", flag: "join-confirmed" },
  { path: "join.broken", env: "DBTRUTH_JOIN_BROKEN", flag: "join-broken" },
  { path: "staleAfterDays", env: "DBTRUTH_STALE_AFTER_DAYS", flag: "stale-after-days" },
  { path: "duplicateOverlap", env: "DBTRUTH_DUPLICATE_OVERLAP", flag: "duplicate-overlap" },
  { path: "fitsInContextTokens", env: "DBTRUTH_FITS_IN_CONTEXT_TOKENS", flag: "fits-in-context-tokens" },
  { path: "modelMaxOutputTokens", env: "DBTRUTH_MODEL_MAX_OUTPUT_TOKENS", flag: "model-max-output-tokens" },
] as const;

export type Overrides = Partial<Record<(typeof overridable)[number]["path"], string | number | undefined>>;

/** Defaults, then DBTRUTH_* environment, then flags. Throws on a value that is not a number. */
export function resolveConfig(
  env: Record<string, string | undefined>,
  flags: Overrides = {},
): Config {
  const out: Config = { ...config, join: { ...config.join } };
  for (const o of overridable) {
    const raw = flags[o.path] ?? env[o.env];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${o.env} / --${o.flag}: "${raw}" is not a number`);
    setPath(out, o.path, n);
  }
  const effort = env.DBTRUTH_MODEL_EFFORT;
  if (effort) {
    if (!(EFFORTS as readonly string[]).includes(effort)) throw new Error(`DBTRUTH_MODEL_EFFORT: "${effort}" is not one of ${EFFORTS.join(", ")}`);
    out.modelEffort = effort as Effort;
  }
  return out;
}

function setPath(target: Config, path: string, value: number): void {
  const [head, tail] = path.split(".");
  if (tail) (target as unknown as Record<string, Record<string, number>>)[head!]![tail] = value;
  else (target as unknown as Record<string, number>)[head!] = value;
}
