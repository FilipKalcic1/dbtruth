# NOTES

Where the build departed from the spec, or where the spec was followed against
a competing recommendation. Each entry says what, why, and what was not done.

## Followed the spec against a recommendation

- **Default model is `claude-sonnet-5`.** The Claude API reference available
  while building recommends `claude-opus-5` as the default for new code. The
  spec names the current Sonnet-class model. `ANTHROPIC_MODEL` overrides it.

## Small extensions of the spec's types

- **`Verified` carries `database` and `tables`** (per table: primary key, row
  estimate, distinct values of categorical columns). Prompt B is required to
  write the key and the categorical values, and `Claims` do not carry them.
  This is allowed fix 1, better evidence, not a new feature.
- **`Table` carries `schema`** so `verify.ts` can write correct SQL for tables
  outside `public`. `name` is still the display name (`table`, or
  `schema.table` outside `public`).
- **`Column` carries `values`** when the column is categorical: every distinct
  value on the sample. Fifteen sample rows are poor evidence for
  `shipped` / `SHIPPED`; the full list is good evidence.
- **Three numbers added to `config.ts`**: `modelMaxOutputTokens`,
  `charsPerToken`, `sampleOversample`. The rule that a number lives only in
  config forced them there; each has its comment.

## Mechanisms, stated plainly

- **Read-only proof** is a `CREATE TABLE` inside a transaction that is always
  rolled back. It is the one write-shaped statement the tool ever sends, it is
  expected to fail with SQLSTATE 25006, and it never persists either way.
- **Statistics never leave the database.** Null rate and distinct count are
  computed by one aggregate query per table over the bounded sample. Node
  only ever holds the shown rows, and hidden cells are replaced before they
  are serialized.
- **Canonical form** for `inconsistent_values` is `lower(btrim(value))`, one
  normalization applied uniformly. A column with more distinct values than
  `categoricalMaxDistinct` is not measured (unverifiable), because collisions
  in free text mean nothing.
- **Budget overrun** is bounded by one `statementTimeoutSeconds`: the budget is
  checked before each query, not enforced mid-query.
- **The three catalog reads are outside the budget.** With 300 tables and a
  0.3 s budget the first version crashed on "could not list constraints: time
  budget exhausted". The budget is for measuring; describing the schema is the
  minimum any run must do, and it is bounded by the statement timeout anyway.
  `safety.catalog()` is `query()` without the budget, nothing else.
- **API preflight.** Before the database is touched, `model.preflight()` calls
  the Models endpoint for the configured model id. It sends nothing but that
  id, costs no tokens, and turns a missing key, a rejected key, a wrong model
  name or no network into one sentence that says what to fix. This mirrors the
  read-only proof on the database side: prove both ends work, then read.

## 0.1.1: what the first real database taught (Pagila, Postgres 18)

Every claim the tool made about Pagila was true when checked by hand. The run
itself exposed five defects, none caught by a test. Each fix is a mechanism.

1. **`--json` could not be piped.** The disclosure line went to stdout with
   the JSON. Now every human-facing line goes to stderr; stdout carries the
   analysis and nothing else.
2. **Partitions were tables.** 70 relations reported where a person sees 15;
   55 were monthly partitions of `payment`. A partitioned table now stands for
   its partitions (`relispartition` is a catalog flag, not a name pattern),
   carrying `partitions.count` and `partitions.withLocalForeignKeys`. The
   second number keeps the run's best finding possible: partitions from
   2022-07 onward declared no foreign keys while earlier ones did.
3. **Views were invisible.** Eight relations a user would query were absent
   and unmentioned. Views and materialized views are now relations with a
   `kind` and their SQL as `definition`; a plain view's size comes from its
   sample because it has no `reltuples`.
4. **A secret was sent.** `staff.password` holds the same hash on every row:
   one distinct value, so the cardinality gate called it categorical and sent
   it. Categorical text must now also be short: the longest value on the
   sample is measured and compared with `categoricalMaxValueLength`. Enum
   labels are short; hashes and tokens are not. The fixture carries a constant
   32-character token, the length of an MD5 hash, that the canary test now guards.
5. **`missing_key` with no table.** The model emitted a suspicion naming no
   table. The schema now requires at least one, so validation sends it back.
6. **A materialized view that was never refreshed.** Pagila's
   `rental_by_category` has never had `REFRESH MATERIALIZED VIEW` run, so
   Postgres refuses every read of it. The first 0.1.1 build sampled it, got an
   error, silently hid its columns, and returned every claim about it as
   unverifiable with no reason. The catalog knows: `pg_class.relispopulated`.
   It is now `populated: false` on the relation, sampling is skipped, a
   `dead_table` suspicion on it is confirmed from the catalog, and any other
   measurement says plainly that it cannot be read.

Speed on Pagila (214 s) was mostly item 2: 55 partitions of schema and
samples sent to the model for nothing.

Needs Postgres 11 or newer: `pg_constraint.conparentid` and `relispartition`.

## Where string matching does appear, and why it is syntax, not meaning

- `isTextType` in `extract.ts` names the Postgres type families whose values
  are free text. It decides visibility by type, which the spec allows; it
  never reads a column's name or values.
- `safety.ts` checks that a statement begins with SELECT or WITH, quotes
  identifiers, and parses one line of `.env`.
- `verify.ts` matches a claim's table name to an extracted table (exact,
  then case-insensitive) and recognises timestamp types for the dead-table
  measurement.
- `write.ts` normalises output paths into `context/`.
- Verdict ids are prefixed `relationship:` / `suspicion:` so the exit code and
  the summary can tell them apart.

## Known limits, deliberately not fixed

- **The join measurement is unconditional.** It asks whether every non-null
  value of the from-column exists in the to-column. A polymorphic column
  (one that points at different tables depending on a sibling column) can
  therefore hit 100% against several tables by coincidence of small integer
  ids, and each would be stated as a fact. The first live run did exactly
  that. Prompt A now defines a relationship as unconditional and sends
  polymorphic references to a suspicion of kind `other`, which is labelled
  inferred, and every run since has behaved. The measurement itself still
  cannot express "only where entity = x"; that would be a conditional join
  claim, allowed fix 3, and was not added because the prompt fix held.
- A high-cardinality **numeric** column is visible, per the spec's rule
  (non-text is shown). A phone number stored as `bigint` would be shown. The
  mechanism-consistent tightening would be a config value that hides any
  column above `categoricalMaxDistinct`; it was not added because it was not
  requested.
- `WITH` is accepted by the statement guard because verify uses CTEs. A
  data-modifying CTE would be refused by the read-only session anyway.
- Structured outputs (`output_config.format`) could replace JSON extraction
  for prompt A. Prompt B returns a record with dynamic keys, so one mechanism
  (extract, validate, retry once) serves both.
- **The value-length gate is a length, not a shape.** A text column is
  categorical only if it has few distinct values and none longer than
  `categoricalMaxValueLength`. That hides MD5 (32), SHA-1 (40), bcrypt (60)
  and tokens, and it also hides a genuine enum whose labels run long. The
  model still sees the column's name, type, null rate, distinct count and
  longest value, so it loses little. Judging values by character class or
  entropy would be closer to "what does this value mean", which the rules
  forbid.

## Timing

- The spec asks for the fixture run to finish in under 60 s. At the default
  effort (`high`) live runs took 101 s, 68 s and 86 s; `medium` took 79 s;
  `low` took 40 s with identical findings on the fixture. The database took
  0.1 s every time; the rest is two calls to `claude-sonnet-5`.
- The default stays `high`, against the 60 s target. Reason: the fixture is
  small and easy, and effort only changes what the model proposes and how it
  writes, which is exactly the part that gets harder on a real database.
  Correctness ranks above speed in the rules. `DBTRUTH_MODEL_EFFORT=low` is
  the documented way to meet the target.

## README

- Section 5 of the spec is rendered for a reader rather than pasted with its
  build instructions ("build first", "put this in the README"). Every rule in
  it is present, in the same order, above the fold.
- The fixture output is pasted from a live run.
- `docs/demo.gif` is rendered by `scripts/render-demo.py` from the real
  terminal output of a fixture run and the real query results on the fixture
  (440 orders with an inner join, 500 with a left join, 60 in `unknown`). It
  is not a screen capture; every line in it is genuine.
