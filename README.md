# dbtruth

[![ci](https://github.com/FilipKalcic1/dbtruth/actions/workflows/ci.yml/badge.svg)](https://github.com/FilipKalcic1/dbtruth/actions/workflows/ci.yml)

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

Put two settings in a `.env` file at the root of your repository, and add
`.env` to `.gitignore` (create that file if the project has none): it holds a
password and a key. If the project is not a git repository, put the file in
the directory you run dbtruth from.

```
DATABASE_URL=postgres://user:password@host:5432/dbname
ANTHROPIC_API_KEY=sk-ant-...
```

No key yet? Leave its line out: `doctor` checks everything else without one.
`npx dbtruth init`, coming in 0.2.0, will write this file for you. A third
line, `ANTHROPIC_MODEL=<model id>`, picks the model; any Claude model id works.
The default, `claude-sonnet-5`, is the current Sonnet-class model; a larger
model costs more per run and, on the schemas measured so far, found the same
things. Each value runs to the end of its line, so a `#` comment goes on a
line of its own.

Then check the setup, and run it:

```bash
npx dbtruth doctor     # one line per check: ok, FAIL with what to fix, or note (worth knowing, not a failure);
                       # exits 1 when Node, the settings or the database need fixing
npx dbtruth            # writes ./context/ and prints a summary
```

You get `context/README.md`, `context/ENTITIES.md`, one file per table in
`context/tables/`, and `context/snapshot.json`, what was claimed and measured,
for `check` (coming in 0.3.0) to measure again. Exit code `2` means it found
something an agent must know before writing SQL, `1` means it could not run,
`0` means nothing found. The database URL can also be passed as `--url`, and
both settings can come from the environment instead of `.env`.

`doctor` checks, one line each, Node, where the settings came from, the
database URL, the connection, the Postgres version, the read-only proof, how
many relations the role can read, and the API key. It spends no tokens: the
API is asked only whether the model exists for this key. It exits `1` when
Node, the settings or the database need fixing, and `0` otherwise. Relations
the role cannot read and a missing key are notes, since a role may be meant to
read part of a database and only a full run needs a key; a key the API rejects
is a `FAIL` that leaves the exit code alone. The URL is never printed, not
even its host: a failed connection is told in one sentence of dbtruth's own,
in a full run too, never in the driver's words.

**Monorepos.** Run it from anywhere inside the repository. dbtruth reads the
`.env` nearest to the current directory, looking up to the repository root
(the first directory with a `.git`), and says which file it read when that is
not the one in the current directory. A `.env` it cannot read is named with
the reason and passed over. The nearest file is used whole; two files are
never merged. Outside a repository only the current directory is searched.
For a settings file anywhere else, pass `--dotenv <path>`. `context/` is
written in the directory you run from, wherever the `.env` was found: run
dbtruth from the directory whose `context/` your agent should read, usually
the repository root, and commit that one.

## Troubleshooting

The first column holds every message dbtruth prints when something is wrong,
word for word, with `<...>` where a value goes: look up the line you got. In a
full run most of them follow `dbtruth: ` and stop the run, which then exits
`1`. `doctor` prints the problems it can find in the setup after `FAIL `,
without spending a token. A message after `dbtruth: ` that is not in the table
comes from the system or from a library dbtruth uses, in its own words.

| Message | Cause, and what to do |
|---|---|
| `could not read <path> (<error>)` | A `.env` on the way up to the repository root exists but cannot be read, usually because of its permissions. It is passed over, and the next `.env` up, if there is one, is read instead. Make it readable, or remove it. Printed for `context/snapshot.json` too, by `check` (coming in 0.3.0), which has no other file to read instead: make it readable. |
| `--dotenv <path>: no such file`<br>`--dotenv <path>: could not read it (<error>)` | The file given to `--dotenv` does not exist, relative to the current directory, or cannot be read. No other settings file is read in its place. Check the path. |
| `no database URL: DATABASE_URL is not in the environment or in <file>`<br>`FAIL no database URL: set DATABASE_URL in <file>, in the environment, pass --url, or read a file elsewhere with --dotenv <path>` | No `--url`, and no `DATABASE_URL` in the environment or in the `.env` that was read. After the full run's line come the directories searched and the ways to set it. A `DATABASE_URL` that is set but empty in the environment counts as unset, and hides the one in the file. Add `DATABASE_URL=postgres://user:password@host:5432/dbname` to the `.env` at the repository root. |
| `<VARIABLE> / --<flag>: "<value>" is not a number`<br>`<VARIABLE> / --<flag>: <n> is below the minimum <min>`<br>`<VARIABLE> / --<flag>: <n> is above the maximum <max>`<br>`<VARIABLE> / --<flag>: <n> must be a whole number`<br>`DBTRUTH_MODEL_EFFORT / --model-effort: "<value>" is not auto or one of low, medium, high, xhigh, max`<br>`join.broken (<n>) must not exceed join.confirmed (<n>)`<br>`sampleRowsShown (<n>) must not exceed sampleRows (<n>)`<br>`effortBands.low (<n>) must not exceed effortBands.medium (<n>)` | A tunable, set by a `DBTRUTH_*` variable in the environment or a `.env`, or by its flag, is outside the range its comment in `src/config.ts` gives, and the run does not start. The last three name pairs that must stay in order: `DBTRUTH_JOIN_BROKEN` at most `DBTRUTH_JOIN_CONFIRMED`, `DBTRUTH_SAMPLE_ROWS_SHOWN` at most `DBTRUTH_SAMPLE_ROWS`, `DBTRUTH_EFFORT_LOW_UP_TO_TOKENS` at most `DBTRUTH_EFFORT_MEDIUM_UP_TO_TOKENS`. Correct the value, or remove it to use the default. |
| `could not connect to the database: nothing is listening at the host and port in the URL; check them, and that the server is running` | The connection was refused: no server listens at that host and port. Start the server, or correct the host or the port. |
| `could not connect to the database: the host in the URL was not found; check its spelling` | The host name does not resolve. Check its spelling, and that this machine can reach that network. |
| `could not connect to the database: the server's access rules refused this connection; if the server requires SSL, add sslmode=verify-full to the URL` | No rule in the server's `pg_hba.conf` admits this connection. Most often the server requires SSL, as hosted Postgres usually does: end the URL with `?sslmode=verify-full`. Otherwise the server does not admit this host, user or database, which is for its administrator to change. |
| `could not connect to the database: authentication failed; check the user and password in the URL` | The server rejected the user or the password. A password that holds `@`, `:`, `/`, `#` or `%` must be percent-encoded in the URL: `@` is `%40`, `#` is `%23`. |
| `could not connect to the database: the database named in the URL does not exist on that server` | The name after the last `/` of the URL is not a database on that server. Check the name, and that the URL points at the right server. |
| `could not connect to the database: the server did not answer within <n>s; check the host and port in the URL, and any firewall on the way` | Nothing answered within the statement timeout, which bounds connecting too: a firewall that drops packets, a wrong address, or a server slow or far away. Check the host, the port and the network; for a slow server, raise `--statement-timeout-seconds`. |
| `could not connect to the database (<code>)`<br>`could not connect to the database` | A failure without a sentence of its own, named by its code or by none. `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN` or another certificate code: the server's certificate cannot be verified; add `sslrootcert=<file>` with the server's CA certificate to the URL, or `sslmode=no-verify` to encrypt without verifying. `ERR_INVALID_URL`: the URL cannot be parsed, for example because of a `#` in the password. `ENOENT`: a file named by `sslrootcert`, `sslcert` or `sslkey` does not exist. No code: the server asks for a password the URL does not give, or `sslmode` is set for a server without SSL. |
| `the server accepted the connection but refused to set up a read-only session (<code>)` | The server would not take `SET default_transaction_read_only = on` or the statement timeout; the code is its SQLSTATE, and `42704` means it does not know the setting. A server that speaks the Postgres protocol without being Postgres can do this. dbtruth disconnects: it reads nothing without a read-only session. Point it at Postgres itself, 12 or newer. |
| `WARNING: the session asked for read-only mode but could not prove it: <detail>. dbtruth still issues only SELECT statements.` | The server accepted a `CREATE TABLE` inside what should have been a read-only transaction (dbtruth rolled it back at once), or did not report the transaction as read-only; the detail says which. A full run goes on, since it sends only `SELECT`; `doctor` counts it as a failure. Connect as a role that can only read (`GRANT SELECT` and nothing more), so the database refuses writes whatever the session says. |
| `database connection lost: <message>` | The server or the network closed the connection in the middle of a run: a restart, an administrator ending the session, a dropped network. The run stops rather than report what it could not measure as nothing found. Run it again. |
| `could not list relations: <message>`<br>`could not list columns: <message>`<br>`could not list constraints: <message>`<br>`could not read the server version: <message>`<br>`could not read the catalog: <message>` | Reading the schema from the catalog failed; the server's words follow the colon. On a server older than Postgres 12 a catalog column the query reads does not exist; otherwise the statement timeout is shorter than the catalog read. `npx dbtruth doctor` prints the server's version; raise `--statement-timeout-seconds` for a slow server. |
| `no API key found. Set ANTHROPIC_API_KEY ...` | `ANTHROPIC_API_KEY` is in neither the environment nor the `.env` that was read: add it to the `.env`. `doctor` reports a missing key on a `note` line, not as a failure, because only a full run needs one. |
| `could not send a request to the Anthropic API: <reason>. Check the key in ANTHROPIC_API_KEY.` | Node refused to build the request. `Cannot convert argument to a ByteString` means the key holds a character an HTTP header cannot carry, such as a curly quote pasted with it: copy the key again. `Invalid URL` means `ANTHROPIC_BASE_URL` in the environment is not a URL. |
| `the Anthropic API's reply broke off: <reason>. Run again.` | The connection dropped during the model's reply, after the line that starts `Sending to`; the reason is the SDK's, such as `terminated`. Run again. |
| `the Anthropic API rejected the key. Set ANTHROPIC_API_KEY ...` | The key is wrong, revoked, or was cut short when it was copied. Copy it again, or create a new one at console.anthropic.com. |
| `this key is not allowed to use model "<model>". Check ANTHROPIC_MODEL or the key's permissions.`<br>`model "<model>" does not exist for this key. Check ANTHROPIC_MODEL.` | `ANTHROPIC_MODEL` names a model that does not exist, or one this key may not use. A `#` comment on the same line becomes part of the id. Correct it, or remove the line to use the default, `claude-sonnet-5`. |
| `the Anthropic API is rate-limiting this key (429). Wait a minute and run again.`<br>`the Anthropic API returned <status>: <message>` | Too many requests for this key, or another refusal, which the API explains after the colon; a status of 500 or above (529 when it is overloaded) is a failure on its side. Wait, and run again. |
| `the Anthropic API rejected the request (400): <message>` | The API refused the request itself, and says why after the colon; a credit balance too low is a common reason, settled at console.anthropic.com. During a run, a request refused this way is sent once more without the effort setting before this is printed. |
| `could not reach the Anthropic API: <message>` | No answer from the API: no network, a proxy or a firewall in the way, or `ANTHROPIC_BASE_URL` set to an address that does not answer. Check the connection. |
| `the model refused the request: <explanation>` | The model declined to answer; the explanation is there when the API gives one. Run again; if it repeats, `--no-samples` leaves the sample rows out of what is sent. |
| `the model's reply was cut off at <n> output tokens; raise DBTRUTH_MODEL_MAX_OUTPUT_TOKENS` | The reply reached the output ceiling, which only a very large schema reaches. Raise `DBTRUTH_MODEL_MAX_OUTPUT_TOKENS` or `--model-max-output-tokens`, up to what the model can produce. |
| `the model's reply to "<prompt>" failed validation twice; raw replies saved to <path>` | The model answered twice with JSON that is not what dbtruth asked for. Both replies, and what was wrong with each, are in that file, `context/.raw-contextualize.json` or `context/.raw-write.json`; the next run that writes its files removes it. Run again: replies vary from run to run. |
| `note: <model> did not accept the effort parameter; the calls ran at its default effort` | The model refused the reasoning effort setting, and each call was sent again without it. The run finished and nothing needs fixing; to choose the effort, use a model that takes it. |
| `--reveal <table.column>: no such column, nothing revealed` | The value of `--reveal` names no column of a relation dbtruth read, often a typo; the run goes on without revealing anything for it. Write it as `table.column`, or `schema.table.column`. |
| `(<n> skipped)`<br>`relations: <kinds>, <n> not examined` | The first is part of the line that starts `Sending to`, the second of the summary. Some relations were not read: sampling used up its share of the time budget (`--extract-budget-share` of `--budget-seconds`) before it reached them, or they were dropped to fit the model's input (next row). Nothing is measured on them, and a measurement the budget cut off is marked `not measured: time budget exhausted` in `context/tables/`. Raise `--budget-seconds`. |
| `sample rows dropped to fit the model's input limit`<br>`sample rows and value lists dropped to fit the model's input limit`<br>`sample rows, value lists and <n> tables dropped to fit the model's input limit` | Printed as part of the line that starts `Sending to`. The schema with its samples is larger than the model's input ceiling, `DBTRUTH_MODEL_MAX_INPUT_TOKENS`, so detail was dropped until it fit: sample rows first, then value lists, then whole tables. The model sees less and proposes less; what it proposes is still measured on the database. Raise `--model-max-input-tokens` only for a model that takes more. |
| `could not write <path>: <error>` | A file under `context/` could not be written, or, when the error names `unlink` or `rm`, a file the last run wrote there for a table since renamed or dropped could not be removed. The cause is a directory this user cannot write (`EACCES`), a full disk, or on Windows another program that holds the file open (`EBUSY`). The other files were written, and a file that could not be removed stays as the last run left it. Close the program, or fix the cause, and run again. |
| `no <path>: run npx dbtruth first` | There is no snapshot at that path, relative to the current directory. Every full run writes `context/snapshot.json`, and `check` (coming in 0.3.0) measures the database against it. Run `npx dbtruth` in the directory that holds `context/`, and commit `context/` with the snapshot in it. |
| `<path> is not a file`<br>`<path> is larger than 10 MB, the most dbtruth reads`<br>`<path> is not valid JSON: run npx dbtruth and commit context/`<br>`<path> is not a dbtruth snapshot: <where>: <problem>`<br>`<path> is not a dbtruth snapshot: measuredWith: <problem>` | The path holds something other than a snapshot dbtruth wrote: a directory, a file a merge left conflict markers in, or one edited by hand. `<where>` is the first value that is wrong, such as `verdicts.<claim>.status`, and `<problem>` says what is wrong with it; after `measuredWith`, it is a setting outside the range its flag allows, in that flag's words, or join bands out of order. Nothing else is read from the file. A snapshot takes about half a kilobyte per relation, so one larger than 10 MB is not dbtruth's, or is of a schema of some twenty thousand relations, which `check` cannot read. Run `npx dbtruth` and commit `context/` to write it again. |
| `<path> was written by a newer dbtruth (snapshot format <n>); upgrade dbtruth to check it` | A newer dbtruth wrote the snapshot, in a format this one does not read. Upgrade dbtruth where `check` runs, such as CI, to the version that wrote it or a later one. |
| `FAIL Node <version>: dbtruth needs Node 20 or newer` | Install Node 20 or newer. |
| `FAIL Postgres <n>: dbtruth needs Postgres 12 or newer` | The server is older than dbtruth supports: its queries read catalog columns and use SQL that Postgres 12 added. Point it at Postgres 12 or newer. |
| `error: too many arguments. Expected 0 arguments but got 1: <word>.`<br>`error: unknown option '<option>'`<br>`error: option '<option>' argument missing` | A command or an option this dbtruth does not have, or an option given without its value. `init`, `check` and `mcp` are not built yet, and a dbtruth older than 0.2.0 has neither `doctor` nor `--version`. `npx dbtruth --help` lists what there is. |

## Commands

```bash
npx dbtruth              # writes ./context/ and prints a summary
npx dbtruth doctor       # checks the setup, one line per check, without spending a token
npx dbtruth init         # coming in 0.2.0: writes a .env with placeholders at the repository root
npx dbtruth check        # coming in 0.3.0: re-measures what context/ claims, without a model or an API key
npx dbtruth mcp          # coming in 0.4.0: lets an agent measure a join before it writes one
npx dbtruth --version    # prints the version (also -v)
npx dbtruth --help       # lists the options, among them a flag for every tunable
```

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

Commit `context/snapshot.json` with it, from the same run. It holds the
claims, every verdict with the query and the numbers behind it, the settings
they were measured with, and the schema: what `check` (coming in 0.3.0)
measures the database against again, without a model. It is
written in a fixed order and without a timestamp, so its diff shows only what
changed: in the data, in the schema, or in the claims, which the model words
anew on every run. Like the rest of `context/`, it holds no hidden value, and
it leaves out the value lists the per-table files show.

## What it sends, and what it never does

**Database.** `DATABASE_URL` comes from the environment, `.env`, or `--url`; it
is never printed and never written anywhere. On connect the session is set to
`default_transaction_read_only = on` with a statement timeout, which bounds
connecting too. Before doing anything else, dbtruth attempts a trivial write
inside a transaction and checks that the server refuses it; if the server does
not, it warns loudly and continues. Every query goes through one module,
`safety.ts`, which only issues `SELECT`, enforces a time budget and a
per-query timeout, and turns a timeout into a skipped measurement rather than
a crash. Nothing else in the code can reach the database.

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
Each table's file under `context/tables/` is rendered from those measurements
directly, so every number in it is the measured number; the model writes
`README.md` and `ENTITIES.md`, where the synthesis is.

Views and materialized views are included, with their SQL, so the model knows
what they read. A partitioned table stands for its partitions: one entry, with
the number of partitions and how many declare foreign keys of their own. A
table's size is the catalog's estimate; where Postgres has none, as for a
table never analyzed or a partitioned table, it comes from the partitions'
estimates, or is scaled up from a count of the rows on a few of its pages
(`--pilot-pages`), so the sample of a large table is drawn from all of it, not
from its oldest rows.
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
- No history: each run replaces `context/`, `snapshot.json` included; git keeps
  the history.
- Postgres only.
- No UI.

## Development

```bash
docker compose up -d --wait         # fixture, clean, scale, sampling and fixture_template on port 54329
npm test                            # every test file
npm run test:unit                   # only the tests that need no database
npm run test:db                     # only the tests that need the databases
ANTHROPIC_API_KEY=... npm test      # also the two live tests
npm run verify                      # typecheck, every test, build, package smoke test
npm run acceptance -- --task T1.1   # score one task of BUILD_PLAN.md
npm run acceptance                  # score every task, then their mean
python scripts/render-demo.py       # regenerates docs/demo.gif from real output (needs Pillow)
```

The databases are loaded once, when the volume is made. After a file in
`test/fixtures/` changes, `docker compose down -v && docker compose up -d --wait`
loads them again; the tests that change data work on copies of
`fixture_template`, and say so when it is missing.

The package smoke test (`npm run test:pack`, the last step of `verify`) packs
the package, installs the tarball into an empty project and runs the installed
`dbtruth --help`, `dbtruth --version` and `dbtruth doctor` (against
`DATABASE_URL`, else the fixture), so it tests what a user installs.
`npm run acceptance` runs the checks in `acceptance/checks.json`, counts the
manual items in `acceptance/manual.json`, and prints every check, each task's
score and, without `--task`, the overall score, weighted as section 4 of
`BUILD_PLAN.md` says. It exits 0 only at 100. The format of both files is
described at the top of `scripts/acceptance.mjs`.

MIT.
