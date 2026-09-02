# dbtruth

Connects read-only to your Postgres database and writes context an AI coding
agent can trust: what each table is for, which entities live where, and how
tables relate, with every relationship checked against the actual data before
it is written down.

![An agent writes an inner join and loses 60 orders; dbtruth runs; the agent reads context/README.md and writes a left join](https://raw.githubusercontent.com/FilipKalcic1/dbtruth/main/docs/demo.gif)

```bash
npx dbtruth            # writes ./context/ and prints a summary
```

It needs `DATABASE_URL` and `ANTHROPIC_API_KEY`, from the environment or from
a `.env` file in the current directory (`--url` also works for the database).
Exit code `2` means it found something an agent must know before writing SQL,
`1` means it could not run, `0` means nothing found.

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
are shown to the model only if it is categorical: a non-text type, or text
with at most 50 distinct values, none longer than 30 characters, measured on
a sample. Everything else is sent as `"[hidden]"`, keeping only the column's
name, type, null rate, distinct count and longest value. Names, emails,
addresses, tokens and free text are all high-cardinality and fall out of the
gate automatically; a constant secret such as a shared password hash is
low-cardinality but long, and stays hidden too. There is no column-name
matching anywhere in the code, so it does not depend on anyone having guessed
your naming convention.

Escape hatches, explicit: `--reveal table.column` shows one column;
`--no-samples` sends schema and statistics only (contextualize gets weaker;
verify does not).

**Disclosure.** Before the first API call the CLI prints one line stating what
is being sent: the number of tables, rows per table, that high-cardinality
text is hidden, and the two flags above. No telemetry, no other network.

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
The run exited 2 and printed this summary before writing thirteen files:

```
dbtruth: fixture
relations: 9 tables, 1 view, 1 materialized view, 1 partitioned (fits in an agent's context)
relationships: 3 confirmed, 1 broken, 0 rejected, 1 unverifiable
  orders.customer_id->customers.id  hit rate 88.0%
suspicions: 5 confirmed, 0 rejected, 3 unverifiable
entities: 4, questions for a human: 5
files written: 13 under ./context/
database time: 0.1s, model time: 97.7s (contextualize 45.6s, write 52.1s)
```

```markdown
# Fixture database — agent reference

Small operational schema: customers, vehicles, orders/order_items, products, plus a polymorphic audit_log, an events log, and two views (shipped_orders, order_totals). Several tables are dead or duplicated — check below before joining.

## Broken relationships — fix your joins

**`orders.customer_id` → `customers.id` is broken.** Hit rate 88% (440/500 sampled). 60 orders have `customer_id` values with no matching customer (some, e.g. 9001, 9002, 9025, 9026, are far outside the 1–250 range seen in `customers.id`). Use `LEFT JOIN customers` and expect/filter NULLs — do not `INNER JOIN` and assume all orders resolve to a customer. (Whether these are bad test data or missing customers is an open question.)

## Confirmed suspicions

- **`cars` is dead.** 0 rows. `vehicles` table comment states it replaced `cars`. Do not query `cars` for current fleet data.
- **`order_totals` is dead.** Materialized view, never refreshed (`populated: false`). Currently returns no rows despite a valid definition over `orders`. Do not rely on it for customer spend totals until refreshed.
- **`products` and `products_legacy` are duplicates.** Same columns (id, sku, name, category, price_cents). 70 of 80 `products` rows match a `products_legacy` row exactly on all shared columns (87.5%). `products_legacy` looks like a superseded predecessor — prefer `products` for current catalog joins.
- **`orders.status` has inconsistent casing.** 5 distinct values collapse to 3 canonical forms (`pending`/`Pending`, `shipped`/`SHIPPED`, `cancelled`). Always normalize with `lower(btrim(status))`, or use the `shipped_orders` view which already does this for shipped orders.
- **`audit_log` has no primary key.** Treat it as append-only; don't assume row uniqueness.

## Entities

- **customer** — primary table `customers`. Referenced (with caveats above) from `orders`, `vehicles`, `order_totals`, and polymorphically from `audit_log`.
- **order** — primary table `orders`. Referenced from `order_items`, `shipped_orders` (view), `order_totals` (dead view), and polymorphically from `audit_log`.
- **vehicle** — primary table `vehicles`. Predecessor table `cars` is dead/empty (inferred duplicate, unverifiable since `cars` has 0 rows).
- **product** — primary table `products`. Confirmed duplicate: `products_legacy` (see above).

## Open questions for a human

- Are the out-of-range `orders.customer_id` values (9001, 9002, 9025, 9026, ...) intentional test data or evidence of missing customer records?
- Is `products_legacy` still used anywhere, or safe to drop?
- Is `cars` safe to drop, or does something still depend on it?
- Should `order_totals` be refreshed on a schedule? Why was it never populated?
- Should `audit_log.entity_id` get per-entity FK columns, or stay polymorphic by design?
```

## Tuning

Every threshold lives in `src/config.ts` with a comment saying what breaks if
it is set wrong, and each can be overridden by a `DBTRUTH_*` environment
variable or a flag (`npx dbtruth --help`). `--json` prints the full verified
analysis as JSON. `ANTHROPIC_MODEL` picks the model. Almost all of a run is
model time: on the fixture, `DBTRUTH_MODEL_EFFORT=low` finished in 40 s with
the same findings as the default `high` at 68 to 101 s. Lower it for small
schemas you have already seen; keep it for a database you are meeting for
the first time.

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
