# dbtruth

Connects read-only to your Postgres database and writes context an AI coding
agent can trust: what each table is for, which entities live where, and how
tables relate, with every relationship checked against the actual data before
it is written down.

![An agent writes an inner join and loses 60 orders; dbtruth runs; the agent reads context/README.md and writes a left join](https://raw.githubusercontent.com/FilipKalcic1/dbtruth/main/docs/demo.gif)

## Quick start

You need Node 20 or newer, a Postgres 12 or newer database you can read, and
an Anthropic API key (create one at console.anthropic.com). Measured on
schemas of up to 30 tables, one run costs between $0.10 and $0.25 of that key
and takes one to two minutes, almost all of it waiting for the model.

Put the settings in a `.env` file in the directory you run from:

```
DATABASE_URL=postgres://user:password@host:5432/dbname
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5     # optional; this is the default
```

Any Claude model id works in `ANTHROPIC_MODEL`. The default is the current
Sonnet-class model; a larger model costs more per run and, on the schemas
measured so far, found the same things.

Then:

```bash
npx dbtruth            # writes ./context/ and prints a summary
```

You get `context/README.md`, `context/ENTITIES.md` and one file per table in
`context/tables/`. Exit code `2` means it found something an agent must know
before writing SQL, `1` means it could not run, `0` means nothing found. The
database URL can also be passed as `--url`, and both settings can come from
the environment instead of `.env`.

## Giving it to your agent

The output is plain markdown, so any agent can read it. Tell yours to look
there before it writes SQL:

- **Claude Code**: one line in `CLAUDE.md`. *Before writing SQL against this
  database, read `context/README.md` and the file in `context/tables/` for
  every table you touch.*
- **Cursor**: the same sentence in `.cursor/rules`, or `@context` in the chat.
- **Anything else**: paste `context/README.md` at the start of the task.

Commit `context/` next to your code. It is small, it reads well in a diff, and
everyone on the project gets the same warnings. Run the tool again when the
schema changes.

## What it sends, and what it never does

**Database.** `DATABASE_URL` comes from the environment, `.env`, or `--url`; it
is never printed and never written anywhere. On connect the session is set to
`default_transaction_read_only = on` with a statement timeout. Before doing
anything else, dbtruth attempts a trivial write inside a transaction and
checks that the server refuses it; if the server does not, it warns loudly
and continues. Every query goes through one module, `safety.ts`, which only
issues `SELECT`, enforces a time budget and a per-query timeout, and turns a
timeout into a skipped measurement rather than a crash. Nothing else in the
code can reach the database.

**Value visibility, the mechanism that replaces PII lists.** A column's values
are shown to the model only if it is categorical, whatever its type: at most
50 distinct values, none longer than 30 characters, and at least one value
that repeats, all measured on a sample. The one exception is a declared
non-text key, a primary key or foreign key column, which is an identifier by
declaration. Everything else is sent as `"[hidden]"`, and the hidden values
are never even read out of the database: the sample rows shown to the model
select only the visible columns. The model keeps the column's name, type,
null rate, distinct count, longest value, and for dates the years of its
oldest and newest value. Names, emails, addresses, tokens, free text, and
also national ids stored as numbers, phone numbers, birth dates and salaries,
all fall out of the gate automatically, on a 40-row table as much as on a
40-million-row one, because a column where every row is different is an
identifier whatever its count; a constant secret such as a shared password
hash is low-cardinality but long, and stays hidden too. There is no
column-name matching anywhere in the code, so it does not depend on anyone
having guessed your naming convention.

Escape hatches, explicit: `--reveal table.column` shows one column;
`--no-samples` sends schema and statistics only (contextualize gets weaker;
verify does not).

**Disclosure.** Before the first API call the CLI prints one line stating what
is being sent: the model and effort, the number of relations, rows per table,
that high-cardinality columns are hidden, and the two flags above. No
telemetry, no other network.

## How it works

```
Postgres --> (1) EXTRACT --> Extract --> (2) CONTEXTUALIZE --> Claims
   ^           (SQL)                        (prompt A)          |
   |                                                            v
   +----------------- (3) VERIFY <------------------------------+
                       (SQL)
                         |
                         v
                     Verified --> (4) WRITE --> ./context/*.md
                                 (prompt B)   + terminal summary
```

The model thinks (2, 4). The database checks (1, 3). Neither is trusted alone.
Every relationship the model proposes is measured: the share of rows in the
from-column that find a match in the to-column. At or above 95% it is stated
as fact with its hit rate. Between 50% and 95% it is **broken**, and the
output leads with it and the numbers. Below 50% it is dropped. The same goes
for suspected dead tables (count, newest timestamp), duplicate tables (row
overlap), inconsistent values (case and whitespace collisions) and missing
keys. Every verdict carries the query and the numbers so you can rerun it.

Views and materialized views are included, with their SQL, so the model knows
what they read. A partitioned table stands for its partitions: one entry, with
the number of partitions and how many declare foreign keys of their own.
Human-readable lines go to stderr; with `--json`, stdout is the analysis and
nothing else, so it can be piped.

## Output on the fixture

This is the real `context/README.md` from one run against the fixture in
`docker-compose.yml`, unedited. The fixture seeds, on purpose: a join at 88%,
an empty `cars` beside a populated `vehicles`, a `status` column with `shipped`
and `SHIPPED`, `audit_log` with no primary key, fake personal data and a
constant secret in `customers`, `products_legacy` duplicating `products`, a
view, a partitioned table and a materialized view that was never refreshed.
The run took 51 seconds, exited 2 and printed this before writing thirteen files:

```
contextualize: 11 tables described, 13 claims to test, 20.3s
verify: 13 measurements, 0.1s
write: 13 files, 28.8s
dbtruth: fixture
relations: 9 tables, 1 view, 1 materialized view, 1 partitioned (fits in an agent's context)
relationships: 3 confirmed, 1 broken, 0 rejected, 1 unverifiable
  orders.customer_id->customers.id  hit rate 88.0%
suspicions: 5 confirmed, 0 rejected, 3 unverifiable
entities: 4, questions for a human: 5
files written: 13 under ./context/
database time: 0.1s, model time: 49.1s (contextualize 20.3s, write 28.8s)
```

```markdown
# Database Reference (fixture)

Fleet/orders database: customers place orders (with line items against a product catalog) and own vehicles. An audit_log tracks actions polymorphically.

## Broken relationship — fix required

**orders.customer_id → customers.id is broken: 88% hit rate (440/500), 60 orphans.**
Do not inner-join orders to customers without guarding. Use `LEFT JOIN` and expect nulls, or filter orphans explicitly. This is not a declared FK — treat with suspicion.

## Confirmed suspicious findings

- **cars is a dead table**: rowEstimate 0, superseded by `vehicles` (per table comment). Do not query it for current data.
- **order_totals (materialized view) is dead**: never refreshed (`populated:false`). Treat as unreadable/stale; do not rely on it — compute totals from `orders`/`order_items` directly.
- **products_legacy duplicates products**: 87.5% of rows (70/80) match products exactly on sku/name/category/price_cents. Likely an old copy; prefer `products` unless explicitly asked for legacy data.
- **orders.status has inconsistent casing**: 5 distinct raw values, only 3 canonical (`pending`/`Pending`, `shipped`/`SHIPPED`, `cancelled`). Always normalize with `lower(btrim(status))`, or use the `shipped_orders` view which already does this.
- **audit_log has no primary key** and `entity_id` is polymorphic (points to customers/orders/vehicles depending on `entity` column) — cannot be joined with a single FK; join conditionally on `entity`.
- **customers.api_token has only 1 distinct value across 250 rows** (inferred, unverifiable) — looks like placeholder/test data, don't treat as a real per-row secret.

## Entities

- **customer** — table `customers`. Referenced by `vehicles.customer_id` (confirmed) and `orders.customer_id` (broken, see above).
- **vehicle** — table `vehicles`, replaces dead `cars` table (confirmed duplicate/dead).
- **order** — table `orders`, with `order_items` (line items) and view `shipped_orders`. `order_totals` materialized view is dead.
- **product** — table `products`; `products_legacy` is a confirmed duplicate/stale copy.

## Open questions for a human

- Is `cars` safe to drop now that `vehicles` fully replaced it?
- Should `products_legacy` be archived/dropped, or is something still reading it?
- Why is `order_totals` never refreshed — still needed?
- What entity does `events` relate to? No FKs declared (inferred: unclear, possibly customers or products).
- Should `orders.status` get an enum/check constraint to stop future case drift?
- Why do 60 orders (12%) reference nonexistent customers — bad data or soft-deleted customers?
```

## Tuning

Every threshold lives in `src/config.ts` with a comment saying what breaks if
it is set wrong, and each can be overridden by a `DBTRUTH_*` environment
variable or a flag (`npx dbtruth --help`). `--json` prints the full verified
analysis as JSON. `ANTHROPIC_MODEL` picks the model. Almost all of a run is
model time, and the reasoning effort is chosen by schema size: small schemas
run at `low`, mid-sized at `medium`, large at `high`. On the fixture, `low`
gave the same findings as `high` in under half the time. The band boundaries
are tunables too; `DBTRUTH_MODEL_EFFORT` or `--model-effort` pins one level
for every run. Every override is checked against the range its comment in
`config.ts` describes, so a value that would hang or invert a verdict is
refused before anything runs.

## What it does not do

- It never writes to your database. Not once, not in a test, not behind a flag.
- No history, no snapshots, no diffing. Each run is point-in-time.
- Postgres only.
- No UI.

## Development

```bash
docker compose up -d --wait     # fixture, clean and scale databases on port 54329
npm test                        # unit, structure, safety, integration, scale
ANTHROPIC_API_KEY=... npm test  # also the two live tests
python scripts/render-demo.py   # regenerates docs/demo.gif from real output (needs Pillow)
```

MIT.
