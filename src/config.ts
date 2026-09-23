// config.ts: the only place a number lives.
//
// Every tunable is here, with one line on what breaks if it is set wrong.
// Each can be overridden by a DBTRUTH_* environment variable or a CLI flag;
// the flag wins over the environment, the environment wins over the default.
// Every override is checked against the range its comment describes, and the
// few invariants between tunables are checked too, so a bad value is refused
// here instead of surfacing as a hang or an inverted verdict.

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export type Config = {
  sampleRows: number;
  sampleRowsShown: number;
  budgetSeconds: number;
  extractBudgetShare: number;
  statementTimeoutSeconds: number;
  categoricalMaxDistinct: number;
  categoricalMaxValueLength: number;
  join: { confirmed: number; broken: number };
  staleAfterDays: number;
  duplicateOverlap: number;
  fitsInContextTokens: number;
  modelMaxOutputTokens: number;
  modelMaxInputTokens: number;
  modelEffort: Effort | "auto";
  effortBands: { low: number; medium: number };
  charsPerToken: number;
  sampleOversample: number;
  sampleSeed: number;
};

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

  // Share of the budget sampling may use before the rest is reserved for verifying claims.
  // Too high: a big database spends everything on sampling and every claim is unverifiable. Too low: tables are skipped for nothing.
  extractBudgetShare: 0.6,

  // Per-query timeout in seconds, and the limit on connecting. Zero would disable the timeout in Postgres, so the
  // minimum is one millisecond. Too low: measurements on large tables time out, and a slow server cannot be reached.
  // Too high: one bad query eats the budget, and a host that drops packets holds the run that long.
  statementTimeoutSeconds: 10,

  // A column with more distinct values than this on the sample is hidden from the model,
  // unless it is a declared non-text primary or foreign key column.
  // Too high: personal data passes as "categorical". Too low: real enums are hidden.
  categoricalMaxDistinct: 50,

  // A column also counts as categorical only if its longest value on the sample is at most this many characters.
  // Too low: long enum labels are hidden. Too high: a constant secret passes as categorical (an MD5 hash is 32, SHA-1 is 40).
  categoricalMaxValueLength: 30,

  // Join hit rate bands: at or above confirmed is a fact; at or above broken is a broken
  // relationship the output leads with; below broken is rejected. broken must not exceed confirmed.
  // Too low a broken bound: coincidental matches are reported. Too high: real problems vanish.
  join: { confirmed: 0.95, broken: 0.5 },

  // A table whose newest timestamp is older than this many days is dead.
  // Too low: seasonal tables look dead. Too high: dead tables look alive.
  staleAfterDays: 90,

  // Share of one table's distinct sampled rows found in the other for the pair to count as duplicates.
  // Too low: parent/child lookalikes are called duplicates. Too high: partial copies are missed.
  duplicateOverlap: 0.7,

  // If the schema alone serializes to fewer tokens than this, the README says you probably
  // do not need this tool. Too low: never said. Too high: said for schemas an agent cannot hold.
  fitsInContextTokens: 20_000,

  // Output token ceiling for one model reply, streamed.
  // Too low: the write step is cut off on databases with many tables. Too high: nothing, it is a ceiling.
  modelMaxOutputTokens: 64_000,

  // Input token ceiling for one model call, estimated from characters. Above it, sample rows are dropped,
  // then value lists, then whole tables (recorded as skipped), until the extract fits.
  // Too low: the model sees less than it could. Too high: a large database fails at the API after all the sampling.
  modelMaxInputTokens: 200_000,

  // Reasoning effort for each model call (DBTRUTH_MODEL_EFFORT, --model-effort): auto, or a fixed
  // low, medium, high, xhigh, max. "auto" picks by schema size from effortBands.
  // A fixed value too low: weaker claims. Too high: slow small runs.
  modelEffort: "auto",

  // With "auto": schemas up to `low` tokens run at low effort, up to `medium` at medium, above that at high.
  // Measured on a 1,100-token fixture and a 3,800-token real schema: low found what high found in under half the time.
  // Boundaries too high: a mid-sized schema gets shallow claims. Too low: small schemas wait for nothing.
  effortBands: { low: 4_000, medium: 12_000 },

  // Characters per token used to size the schema and the model input.
  // Too low: small schemas look big. Too high: big schemas look small.
  charsPerToken: 4,

  // TABLESAMPLE SYSTEM returns whole pages in file order, so a LIMIT that cuts a sample keeps its oldest pages.
  // The sample is sized to sampleRows from the catalog's estimate and cut only when the estimate was low by more
  // than this factor. Too low: an accurate sample is cut to its oldest pages. Too high: a table that grew since
  // its last ANALYZE is read far past sampleRows.
  sampleOversample: 3,

  // Seed for TABLESAMPLE ... REPEATABLE, so the statistics and the value lists of one table come from the same pages.
  // Any value works; changing it changes which pages a large table is sampled from.
  sampleSeed: 1,
};

/** The effort for one run: the fixed setting, or by schema size. */
export function effortFor(schemaTokens: number, cfg: Config): Effort {
  if (cfg.modelEffort !== "auto") return cfg.modelEffort;
  if (schemaTokens <= cfg.effortBands.low) return "low";
  if (schemaTokens <= cfg.effortBands.medium) return "medium";
  return "high";
}

// One row per numeric tunable: where it lives in Config, its environment variable, its CLI flag, its range.
export const overridable = [
  { path: "sampleRows", env: "DBTRUTH_SAMPLE_ROWS", flag: "sample-rows", min: 1, integer: true },
  { path: "sampleRowsShown", env: "DBTRUTH_SAMPLE_ROWS_SHOWN", flag: "sample-rows-shown", min: 0, integer: true },
  { path: "budgetSeconds", env: "DBTRUTH_BUDGET_SECONDS", flag: "budget-seconds", min: 0 },
  { path: "extractBudgetShare", env: "DBTRUTH_EXTRACT_BUDGET_SHARE", flag: "extract-budget-share", min: 0, max: 1 },
  { path: "statementTimeoutSeconds", env: "DBTRUTH_STATEMENT_TIMEOUT_SECONDS", flag: "statement-timeout-seconds", min: 0.001 },
  { path: "categoricalMaxDistinct", env: "DBTRUTH_CATEGORICAL_MAX_DISTINCT", flag: "categorical-max-distinct", min: 0, integer: true },
  { path: "categoricalMaxValueLength", env: "DBTRUTH_CATEGORICAL_MAX_VALUE_LENGTH", flag: "categorical-max-value-length", min: 0, integer: true },
  { path: "join.confirmed", env: "DBTRUTH_JOIN_CONFIRMED", flag: "join-confirmed", min: 0, max: 1 },
  { path: "join.broken", env: "DBTRUTH_JOIN_BROKEN", flag: "join-broken", min: 0, max: 1 },
  { path: "staleAfterDays", env: "DBTRUTH_STALE_AFTER_DAYS", flag: "stale-after-days", min: 0 },
  { path: "duplicateOverlap", env: "DBTRUTH_DUPLICATE_OVERLAP", flag: "duplicate-overlap", min: 0, max: 1 },
  { path: "fitsInContextTokens", env: "DBTRUTH_FITS_IN_CONTEXT_TOKENS", flag: "fits-in-context-tokens", min: 0 },
  { path: "modelMaxOutputTokens", env: "DBTRUTH_MODEL_MAX_OUTPUT_TOKENS", flag: "model-max-output-tokens", min: 1, integer: true },
  { path: "modelMaxInputTokens", env: "DBTRUTH_MODEL_MAX_INPUT_TOKENS", flag: "model-max-input-tokens", min: 1, integer: true },
  { path: "effortBands.low", env: "DBTRUTH_EFFORT_LOW_UP_TO_TOKENS", flag: "effort-low-up-to-tokens", min: 0 },
  { path: "effortBands.medium", env: "DBTRUTH_EFFORT_MEDIUM_UP_TO_TOKENS", flag: "effort-medium-up-to-tokens", min: 0 },
] as const satisfies readonly { path: string; env: string; flag: string; min: number; max?: number; integer?: boolean }[];

export const EFFORT_ENV = "DBTRUTH_MODEL_EFFORT";
export const EFFORT_FLAG = "model-effort";

export type NumberPath = (typeof overridable)[number]["path"];
export type Overrides = Partial<Record<NumberPath, string | number | undefined>> & { modelEffort?: string | undefined };

/** Defaults, then DBTRUTH_* environment, then flags. Throws on a value outside its range. */
export function resolveConfig(env: Record<string, string | undefined>, flags: Overrides = {}): Config {
  const out: Config = { ...config, join: { ...config.join }, effortBands: { ...config.effortBands } };
  for (const o of overridable) {
    const raw = flags[o.path] ?? env[o.env];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    const name = `${o.env} / --${o.flag}`;
    if (!Number.isFinite(n)) throw new Error(`${name}: "${raw}" is not a number`);
    if (n < o.min) throw new Error(`${name}: ${n} is below the minimum ${o.min}`);
    if ("max" in o && n > o.max) throw new Error(`${name}: ${n} is above the maximum ${o.max}`);
    if ("integer" in o && o.integer && !Number.isInteger(n)) throw new Error(`${name}: ${n} must be a whole number`);
    setPath(out, o.path, n);
  }
  const effort = flags.modelEffort ?? env[EFFORT_ENV];
  if (effort) {
    if (effort !== "auto" && !(EFFORTS as readonly string[]).includes(effort)) {
      throw new Error(`${EFFORT_ENV} / --${EFFORT_FLAG}: "${effort}" is not auto or one of ${EFFORTS.join(", ")}`);
    }
    out.modelEffort = effort as Effort | "auto";
  }
  if (out.join.broken > out.join.confirmed) throw new Error(`join.broken (${out.join.broken}) must not exceed join.confirmed (${out.join.confirmed})`);
  if (out.sampleRowsShown > out.sampleRows) throw new Error(`sampleRowsShown (${out.sampleRowsShown}) must not exceed sampleRows (${out.sampleRows})`);
  if (out.effortBands.low > out.effortBands.medium) throw new Error(`effortBands.low (${out.effortBands.low}) must not exceed effortBands.medium (${out.effortBands.medium})`);
  return out;
}

function setPath(target: Config, path: NumberPath, value: number): void {
  switch (path) {
    case "join.confirmed":
      target.join.confirmed = value;
      break;
    case "join.broken":
      target.join.broken = value;
      break;
    case "effortBands.low":
      target.effortBands.low = value;
      break;
    case "effortBands.medium":
      target.effortBands.medium = value;
      break;
    default:
      target[path] = value;
  }
}
