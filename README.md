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
A third line, `ANTHROPIC_MODEL=<model id>`, picks the model; any Claude model
id works. The default, `claude-sonnet-5`, is the current Sonnet-class model; a
larger model costs more per run and, on the schemas measured so far, found the
same things. Each value runs to the end of its line, so a `#` comment goes on
a line of its own.

Or let `npx dbtruth init` write the file, at the repository root or, outside a
repository, in the current directory. It writes the three lines commented
out, so nothing in the file is read until you remove the `#` before a line and
fill in its value. It never changes an existing `.env` or `.gitignore`: it
leaves the `.env` as it is, and asks git whether `.gitignore` ignores `.env`,
printing the line to add when it does not. With `--skill` it also installs
the skill for Claude Code (see Giving it to your agent). Last, it prints the
next steps:

```
next steps:
  fill in .env
  run npx dbtruth doctor
  run npx dbtruth
  add this line to CLAUDE.md: Before writing SQL against this database, read `context/README.md` and the file in `context/tables/` for every table you touch.
  add the MCP server to Claude Code: claude mcp add --transport stdio dbtruth -- npx -y dbtruth mcp
```

Then check the setup, and run it:

```bash
npx dbtruth doctor     # one line per check: ok, FAIL with what to fix, or note (worth knowing, not a failure);
                       # exits 1 when Node, the settings or the database need fixing
npx dbtruth            # writes ./context/ and prints a summary
```

You get `context/README.md`, `context/ENTITIES.md`, one file per table in
`context/tables/`, and `context/snapshot.json`, what was claimed and measured,
for `npx dbtruth check` to measure again. Exit code `2` means it found
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
without spending a token. From `mcp`, a message is most often the answer of a
tool call that failed, and the server goes on. A message after `dbtruth: `
that is not in the table comes from the system or from a library dbtruth uses,
in its own words.

| Message | Cause, and what to do |
|---|---|
| `could not read <path> (<error>)` | A `.env` on the way up to the repository root exists but cannot be read, usually because of its permissions. It is passed over, and the next `.env` up, if there is one, is read instead. Make it readable, or remove it. Printed for `context/snapshot.json` too, by `check`, which has no other file to read instead: make it readable. |
| `--dotenv <path>: no such file`<br>`--dotenv <path>: could not read it (<error>)` | The file given to `--dotenv` does not exist, relative to the current directory, or cannot be read. No other settings file is read in its place. Check the path. From `mcp`, the path is relative to the project directory (`--project`, else `CLAUDE_PROJECT_DIR`, else the directory the server starts in), and the line is the answer of the call that needed the database. |
| `no database URL: DATABASE_URL is not in the environment or in <file>`<br>`FAIL no database URL: set DATABASE_URL in <file>, in the environment, pass --url, or read a file elsewhere with --dotenv <path>` | No `--url`, and no `DATABASE_URL` in the environment or in the `.env` that was read. After the full run's line come the directories searched and the ways to set it. A `DATABASE_URL` that is set but empty in the environment counts as unset, and hides the one in the file. Add `DATABASE_URL=postgres://user:password@host:5432/dbname` to the `.env` at the repository root. From `mcp`, these lines are the answer of the call that needed the database: fill in the `.env` and call again, with no restart; a variable set in the agent's settings for the server takes one. |
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
| `database connection lost: <message>` | The server or the network closed the connection in the middle of a run: a restart, an administrator ending the session, a dropped network, or a server that ends idle sessions while the model answers. The run stops rather than report what it could not measure as nothing found. Run it again. From `mcp`, the call that lost it fails with this line and the next connects again; a connection closed while no call ran is replaced without a word. |
| `could not list relations: <message>`<br>`could not list columns: <message>`<br>`could not list constraints: <message>`<br>`could not read the server version: <message>`<br>`could not read the catalog: <message>` | Reading the schema from the catalog failed; the server's words follow the colon. On a server older than Postgres 12 a catalog column the query reads does not exist; otherwise the statement timeout is shorter than the catalog read. `npx dbtruth doctor` prints the server's version; raise `--statement-timeout-seconds` for a slow server. |
| `a value could not be read (SQLSTATE <code>)` | A statement over a relation failed on a value, so nothing was measured there: most often a view whose expression fails on some row, such as a cast of text to a number or a date, or a function it calls that raises an error; else a condition's value the server cannot take, such as one holding a NUL byte (`22021`). It follows `not measured: ` in `context/tables/`, is the reason in `check`'s report, and from `mcp` is a relation's `unmeasured` or a verdict's `skipped`. The code is the server's SQLSTATE: class `22` for a value that does not fit its type, `P0` for an error a function raised. The server's own message is left out, since it quotes the value. To read it, run the verdict's query, or select from the relation, as a user who may see the data; then fix the row or the expression. |
| `no API key found. Set ANTHROPIC_API_KEY ...` | `ANTHROPIC_API_KEY` is in neither the environment nor the `.env` that was read: add it to the `.env`. `doctor` reports a missing key on a `note` line, not as a failure, because only a full run needs one: `doctor` and `check` do not. |
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
| `the verdicts' queries dropped to fit the model's input limit`<br>`README.md and ENTITIES.md not written: over the model's input limit even without the verdicts' queries` | Printed as part of the line that starts `write:`. What the model is sent to write `README.md` and `ENTITIES.md`, every claim with its verdict, query and numbers, is larger than the model's input ceiling, `DBTRUTH_MODEL_MAX_INPUT_TOKENS`; a database with many joins compared with other keys (see How it works) reaches it first. So the queries were left out of it: the numbers were all sent, and every query is still in `context/snapshot.json` and in `--json`. When even that is too large, the model is not called: the per-table files and the snapshot are written, `README.md` and `ENTITIES.md` are not, and the last run's are removed. Raise `--model-max-input-tokens` only for a model that takes more; a lower `--weak-evidence-max-candidates` shortens the query of every join compared. |
| `could not write <path>: <error>` | A file under `context/` could not be written, or, when the error names `unlink` or `rm`, a file the last run wrote there for a table since renamed or dropped could not be removed. The cause is a directory this user cannot write (`EACCES`), a full disk, or on Windows another program that holds the file open (`EBUSY`). The other files were written, and a file that could not be removed stays as the last run left it. Close the program, or fix the cause, and run again. From `init`, the path is the `.env` it would have written, and `EEXIST` means a directory of that name is there, such as a Python virtualenv: dbtruth reads no directory as settings, so rename it, or keep the settings in a file of another name and pass `--dotenv <path>`; `init --skill` still installs the skill. With `--skill`, the path can be the skill's, `.claude/skills/dbtruth/SKILL.md`, where `EEXIST`, or `EISDIR` with `--force`, means a directory of that name is there: `init` removes no directory, so move it. From `check`, the path is the file `--markdown` names; check then exits 1 without printing its JSON. Give it a path to a file, in a directory that exists and this user can write. |
| `<path> already exists; left as it is` | `init` found a `.env` where it would write one. It never changes a `.env` that is there, so the file is as it was: check that it holds the settings the quick start shows, and follow the next steps printed after this line. |
| `<path> already exists; pass --force to replace it` | `init --skill` found a skill at `.claude/skills/dbtruth/SKILL.md`, left it as it is, since it may have been edited, and stopped: it exits `1` without the next steps. To install the skill of the dbtruth you run, after an upgrade for example, run `npx dbtruth init --skill --force`, which replaces that file and nothing else; the `.env` is never replaced. |
| `WARNING: <path> does not ignore <path>; add this line to it: .env` | Printed by `init`: no rule in the `.gitignore` at the repository root covers the `.env` there, so git would commit the password and the key in it on any machine without a rule of its own. Add the line `.env` to that `.gitignore`, and create the file if there is none; `init` never edits it. A rule in your own ignore file, `core.excludesFile`, does not count: it covers your machine alone. A rule for `.env/` covers only a directory, and a later `!.env` takes an earlier rule back. |
| `WARNING: git could not say whether <path> ignores <path>; if it does not, add this line to it: .env` | Printed by `init` when git gives no answer: outside a repository, before `git init`; when git is not installed or not on the `PATH`; or in a repository git refuses, as it does one owned by another user. Make sure the `.gitignore` at the repository root holds the line `.env`, once there is a repository; `git check-ignore -v .env`, run there, shows git's own words. |
| `no <path>: run npx dbtruth first` | There is no snapshot at that path, relative to the current directory. Every full run writes `context/snapshot.json`, and `check` measures the database against it; `--snapshot <path>` names another file. Run `npx dbtruth` in the directory that holds `context/`, and commit `context/` with the snapshot in it. The `mcp` tools `context` and `check` say it too, with the full path, when `context/` has no such file: run `npx dbtruth` in the project directory (see Giving it to your agent). A run over the model's input limit writes no `README.md`; ask `context` for a table instead. |
| `<path> is not a file`<br>`<path> is larger than 10 MB, the most dbtruth reads`<br>`<path> is not valid JSON: run npx dbtruth and commit context/`<br>`<path> is not a dbtruth snapshot: <where>: <problem>`<br>`<path> is not a dbtruth snapshot: measuredWith: <problem>` | The path holds something other than a snapshot dbtruth wrote: a directory, a file a merge left conflict markers in, or one edited by hand. `<where>` is the first value that is wrong, such as `verdicts.<claim>.status`, and `<problem>` says what is wrong with it; after `measuredWith`, it is a setting outside the range its flag allows, in that flag's words, or join bands out of order. Nothing else is read from the file. A snapshot takes about half a kilobyte per relation, so one larger than 10 MB is not dbtruth's, or is of a schema of some twenty thousand relations, which `check` cannot read. Run `npx dbtruth` and commit `context/` to write it again. From the `mcp` tool `context`, `<path>` is the full path of the entry in `context/` it was asked for, a link or a directory, which it never reads. |
| `<path> was written by a newer dbtruth (snapshot format <n>); upgrade dbtruth to check it` | A newer dbtruth wrote the snapshot, in a format this one does not read. Upgrade dbtruth where `check` runs, such as CI, to the version that wrote it or a later one. |
| `FAIL Node <version>: dbtruth needs Node 20 or newer` | Install Node 20 or newer. |
| `FAIL Postgres <n>: dbtruth needs Postgres 12 or newer` | The server is older than dbtruth supports: its queries read catalog columns and use SQL that Postgres 12 added. Point it at Postgres 12 or newer. |
| `error: option '--fail-on <when>' argument '<value>' is invalid. Allowed choices are regression, change, never.` | `check --fail-on` takes one of three values: `regression`, the default, fails the build on a regression or a stale item; `change` on any change; `never` reports and passes. |
| `error: too many arguments. Expected 0 arguments but got 1: <word>.`<br>`error: unknown option '<option>'`<br>`error: option '<option>' argument missing` | A command or an option this dbtruth does not have, or an option given without its value. A dbtruth older than 0.4.0 has no `mcp` and no `init --skill`, one older than 0.3.0 has no `check`, and one older than 0.2.0 has no `doctor`, `init` or `--version`. `npx dbtruth --help` lists what there is. |
| `unknown table <name>; the closest: <names>`<br>`unknown column <table>.<column>; the closest: <names>` | From the `mcp` tools. `describe_table` and `measure_join` did not find the name in the catalog, read again at every call, so a table added since the server started is found; `context` found no file of that name in `context/tables/`. `describe_table` and `measure_join` find a table by its name, or as `schema.table` outside `public`, whatever the case, and a column only as spelled; `context` finds a table's file only by its name exactly as written. Nothing was measured. The closest names are those the fewest edits away, or `none` when there is nothing to compare with. |
| `<table> was not examined within this call's time budget; raise DBTRUTH_MCP_CALL_BUDGET_SECONDS` | From `mcp`: sampling the table used up its share (`--extract-budget-share`) of the call's time budget, 20 seconds by default, so nothing was measured. Set `DBTRUTH_MCP_CALL_BUDGET_SECONDS` in the server's environment, or `--mcp-call-budget-seconds` after `mcp` in the command that starts it, and restart the server. |
| `--project <dir>: no such directory` | `dbtruth mcp --project` names a directory that does not exist, relative to the one the server starts in. The server does not start, and exits `1`: correct the path in the agent's settings for the server. |
| `Input validation error: Invalid arguments for tool <tool>: <problem>`<br>`Input validation error: Invalid arguments for tool measure_join: when_column and when_equals go together: give both, or neither` | An `mcp` tool was called with arguments it does not take, in the MCP SDK's words: one missing, of the wrong type, or unknown, such as a misspelt name, which is refused rather than passed over. A condition is `when_column` and `when_equals` together: half of one would measure the whole join. Nothing was measured. |
| `mcp: <error>` | Printed on stderr by `dbtruth mcp` when the MCP SDK reports an error outside any tool call, such as a message from the client it could not read, in the SDK's words. The server goes on. |

## Commands

```bash
npx dbtruth              # writes ./context/ and prints a summary
npx dbtruth doctor       # checks the setup, one line per check, without spending a token
npx dbtruth init         # writes a .env with placeholders at the repository root, and prints the next steps
npx dbtruth init --skill # also installs the skill at .claude/skills/dbtruth/SKILL.md; --force replaces it
npx dbtruth check        # re-measures what context/ claims, without a model or an API key
npx dbtruth mcp          # serves context/ and measurements to an agent over MCP, without a model or an API key
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
they were measured with, and the schema: what `check` measures the database
against again, without a model (next section). It is
written in a fixed order and without a timestamp, so its diff shows only what
changed: in the data, in the schema, or in the claims, which the model words
anew on every run. Like the rest of `context/`, it holds no hidden value, and
it leaves out the value lists the per-table files show.

### Measuring while it writes: `dbtruth mcp`

`npx dbtruth mcp` is an MCP server that your agent starts, and it gives the
agent four tools. It calls no model and needs no API key: the agent does the
thinking, dbtruth does the measuring.

- `context`: `context/README.md`, or with a table's name, that table's file.
  It reads the files only.
- `describe_table`: a table or view as the database holds it now: its keys and
  size, and per column the type, null rate and distinct count on a sample, with
  the values of a column that has a few short ones.
- `measure_join`: whether one column joins another, measured on the data as a
  full run measures it: the verdict, the numbers, the query to rerun it, and
  the line a table's file would show. With `when_column` and `when_equals`, one
  branch of a column that points at different tables.
- `check`: what `dbtruth check` reports on `context/snapshot.json`.

Add it to Claude Code with one command. Options go before the server's name,
and everything after `--` is the command that starts the server:

```bash
claude mcp add --transport stdio dbtruth -- npx -y dbtruth mcp
```

With `--scope project` it is written to `.mcp.json` at the project's root, for
everyone who works on the project:

```json
{
  "mcpServers": {
    "dbtruth": { "command": "npx", "args": ["-y", "dbtruth", "mcp"] }
  }
}
```

In Cursor it goes in `.cursor/mcp.json`. Cursor does not document the
directory it starts a server in, so the project is named with `--project`:

```json
{
  "mcpServers": {
    "dbtruth": { "type": "stdio", "command": "npx", "args": ["-y", "dbtruth", "mcp", "--project", "${workspaceFolder}"] }
  }
}
```

On native Windows, if the agent shows the server as failed with "Connection
closed", start it through `cmd`:
`claude mcp add --transport stdio dbtruth -- cmd /c npx -y dbtruth mcp`.

The project is the directory `--project` names, else the one Claude Code sets
in `CLAUDE_PROJECT_DIR` when it starts the server, else the directory the
server starts in. The tools read `context/` there, and the settings come from
the `.env` nearest to it, up to the repository root, as for every command, or
from `--url` and `--dotenv`. They are read when a tool first needs the
database, and again after a call that failed, so a `.env` filled in after the
agent started the server is read by the next call; once connected, the server
keeps its settings until it is restarted. `.mcp.json` is committed, so never
put a URL with a password in it: leave it in `.env`, or pass it from the
environment with `"env": { "DATABASE_URL": "${DATABASE_URL}" }`.

The server holds one connection, opened by the first tool that needs it, and
runs the calls that use it one at a time, each with 20 seconds for sampling
and measuring (`--mcp-call-budget-seconds`); it stops when the agent does. A
table or column the database does not have is refused with the closest names
it does have, and nothing is measured. `npx -y` runs the newest release when
npm's cache holds none; write `dbtruth@<version>` to run only the one you
reviewed.

### Telling it when to measure: the skill

The server gives the agent tools; the skill tells it when to use them.
`npx dbtruth init --skill` installs it for Claude Code as
`.claude/skills/dbtruth/SKILL.md` at the repository root, or outside a
repository in the current directory, beside the `.env`. Commit it, so everyone
on the project gets it. Claude Code keeps the skill's one-line description in
every session; the agent loads the rest when it judges that a task fits that
description, such as writing, reviewing or debugging SQL. The skill tells the
agent to read `context/README.md` and the file of every table a query touches,
to call `measure_join` before a join those files do not list as confirmed, what
to do about a broken join, a join on weak evidence or one branch of a column
that points at different tables, and never to start a full run or pass
`--reveal` itself. Without the server, the agent reads the files in `context/`.

A second `init --skill` finds the file there and stops without changing it,
since you may have edited it, and exits `1`. `--force` replaces it with the
skill of the dbtruth you run, after an upgrade for example, and nothing else:
the `.env` is never replaced.

## Keeping context true: dbtruth check

`npx dbtruth check` measures again what `context/snapshot.json` claims, on the
database it connects to now, and says what moved. It needs no model and no API
key, and connects to nothing but the database, so it can run on every pull
request, in the CI job that has a database with the pull request's schema and
data in it.

```bash
npx dbtruth check                        # ./context/snapshot.json against DATABASE_URL
npx dbtruth check --fail-on change       # fail on any change, not only on a regression or a stale item
npx dbtruth check --json > report.json   # the report as JSON on stdout
npx dbtruth check --markdown comment.md  # the report as a pull request comment, in a file
npx dbtruth check --snapshot <path> --url <url>
```

Each claim is measured with the statement a full run builds from the schema as
it is now, never with the query the snapshot stores, and with the settings the
snapshot was measured with, so that a default changed in a later dbtruth cannot
pass for a change in the data; the time budget and the statement timeout are
this run's. Only the tables the claims name are sampled. stderr gets a line
for each claim that is not unchanged and for each relation added or dropped,
then the count of each class; stdout stays empty unless `--json` asks for the
report there.

| Class | When | Fails with `regression`, the default | Fails with `change` |
|---|---|---|---|
| regression | A relationship confirmed before is broken or rejected now, or broken before and rejected now. A suspicion rejected before is confirmed now. | yes | yes |
| stale | A claim names a table or column the snapshot had and the database no longer has. A relation is in the database and not in the snapshot, or the other way round. | yes | yes |
| drift | The same status, and a join's hit rate moved by at least `--check-hit-rate-tolerance`, 0.01 by default. | no | yes |
| improved | A relationship broken before is confirmed now. A suspicion confirmed before is rejected now. | no | yes |
| changed | Any other move between two measurements, such as from empty to confirmed. | no | yes |
| not measured | Measured on one side only: a timeout or the time budget now, or a claim the full run could not measure. | no | no |
| unchanged | The same status, and the hit rate moved less than the tolerance, or not at all. | no | no |

`--fail-on never` reports and passes. The exit code is `0` when check passes
under `--fail-on`, `2` when it fails, and `1` when it could not run: no
snapshot, one it cannot read or that a newer dbtruth wrote, or no database. A
snapshot of a database with another name, measured with settings that differ
from this run's, or of a schema that has changed since, gets a `note` line;
notes never fail. When anything other than unchanged or not measured is found,
the last line is `run npx dbtruth and commit context/`.

`--json` prints the whole report on stdout: each claim's class, its status in
the snapshot, and the verdict measured now with its query and numbers; the
relations added or dropped; and the database names, the settings and whether
the schema changed, which the notes are made from. Its `report` field is the
format, 1.

`--markdown <path>` writes the report as a pull request comment: the marker
`<!-- dbtruth-check -->` on the first line, the counts, a table of what fails
the default build, the rest folded, at most 50 rows in all, the notes, then the
fix line. Names are written as code, so that nothing in a name becomes a
mention, a link or markup, and the comment holds no query and no reason. A
comment file that cannot be written makes check exit `1`, with nothing on
stdout. After the foreign key from `order_items` to `orders` was dropped and
every fifth line item was pointed at an order that does not exist, the comment
reads:

```markdown
<!-- dbtruth-check -->
dbtruth: 1 regression, 11 unchanged

| Class | Claim | Before | After |
|---|---|---|---|
| regression | ` relationship:order_items.order_id->orders.id ` | confirmed 100.0% | broken 80.0% |

- note: the schema changed since the snapshot

run npx dbtruth and commit context/
```

The snapshot is part of the pull request, so the pull request decides what is
checked: it can mark a broken join confirmed, drop a claim, or change the
settings until nothing can be measured. Review a change to
`context/snapshot.json` as you would a change to the code. dbtruth reads the
file as it reads any input it did not write: no larger than 10 MB, checked
against its schema before anything else, its names only looked up in the
database's own catalog, and its stored queries never run.

## CI

The GitHub Action
[FilipKalcic1/dbtruth-action](https://github.com/FilipKalcic1/dbtruth-action)
runs `dbtruth check` on every pull request, writes what moved into one comment
on it, updated in place, and by default fails the job on a regression or a
stale item. Add a workflow such as `.github/workflows/dbtruth.yml`:

```yaml
name: dbtruth
on: pull_request
permissions:
  contents: read
  pull-requests: write
concurrency:
  group: dbtruth-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: FilipKalcic1/dbtruth-action@v1
        with:
          database-url: ${{ secrets.DBTRUTH_DATABASE_URL }}
```

`pull-requests: write` lets the Action write its comment. `concurrency`
cancels a run still going when the next push starts one, so two runs never
race to create two comments. The Action's
[README](https://github.com/FilipKalcic1/dbtruth-action#readme) lists its
inputs and outputs and describes the comment.

The secret lets the job into your database, so:

- Connect as a role that can only read, on a replica or a staging copy, never
  as an owner role on production.
- Keep the URL in a secret. GitHub masks a secret in the log, and prints any
  other value a step is given in `with:` or `env:`.
- Run it on `pull_request`, never on `pull_request_target` with a checkout of
  the pull request's code, which hands your secrets to the code of whoever
  opened the pull request.
- A pull request from a fork gets no secrets, so the Action skips it with a
  notice and does not fail the job.

The database must hold the data the context describes: the one `npx dbtruth`
ran on, or a copy of it. On an empty database built from the migrations
alone, the claims have nothing to measure. Since the pull request decides what
is checked, review a change to `context/snapshot.json` as you would a change
to the code (previous section).

## Team tier

The Team tier is the GitHub Action on private repositories. The Action (see
CI) runs `dbtruth check` on a pull request against the database the workflow
gives it, writes what moved into one comment on the pull request, updated in
place, and by default fails the job on a regression or a stale item.

These stay free forever: the CLI (`dbtruth`, `doctor`, `init`, `check`, and
`mcp`); the skill that tells an agent when to read the context and measure a
join; and the Action on public repositories.

No database content passes through a server of ours, on either tier. You
bring your own model access: a full run calls the Anthropic API with your
key, and `check` needs no model at all. The Action runs `check` in your own
CI job. On a private repository it will also check a license key, sending
the key and the repository's id and nothing else, and an outage of that
check will never fail the job.

The Team tier will cost PRICE_TBD per team per month.
[Join the waitlist](WAITLIST_URL) to hear when it opens.

## What it sends, and what it never does

**Database.** `DATABASE_URL` comes from the environment, `.env`, or `--url`; it
is never printed and never written anywhere. On connect the session is set to
`default_transaction_read_only = on` with a statement timeout, which bounds
connecting too. Before doing anything else, dbtruth attempts a trivial write
inside a transaction and checks that the server refuses it; if the server does
not, it warns loudly and continues. Every query goes through one module,
`safety.ts`, which only issues `SELECT`, enforces a time budget and a
per-query timeout, and turns a timeout into a skipped measurement rather than
a crash. A statement that fails on a value in the data, such as a view's cast,
is reported by its SQLSTATE alone, since the server's message would quote the
value. Nothing else in the code can reach the database.

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

**Agents (MCP).** `dbtruth mcp` connects to the database and to nothing else,
and calls no model: it answers the agent that started it, and the agent passes
the answers to its own model. An answer holds names, types, counts, rates, the
values of categorical columns and queries, never a hidden value or a sample
row, and a name the agent sends is only looked up in the catalog, never run as
SQL. `context` returns the files in `context/` as they are, so what a
`--reveal` run wrote there goes too. A condition on a categorical column
counts the rows that hold one of its values, and a value that one row alone
holds narrows a join to that row: give the server a role that reads only what
an agent may learn.

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
When a column points at different tables depending on another column that is
categorical, each value of that other column is a claim of its own, measured
on the rows that hold it, with its own verdict; the value is sent as a
parameter, never as SQL. A broken join from an integer column into an
integer primary key also says how many of its orphans lie above the key's
highest value and how many below its lowest; the rest lie inside its range.
A join confirmed on inference from an integer column is compared with the
other integer keys that fill most of their range (`--dense-key-share`),
among the first `--weak-evidence-max-candidates` that hold rows: when its
values would also fit one or more of them, as a quantity from 1 to 5 fits
every table's id, it keeps its verdict and says how many, and that the match
alone does not prove it.
Each table's file under `context/tables/` is rendered from those
measurements directly, so every number in it is the measured number; the
model writes `README.md` and `ENTITIES.md`, where the synthesis is.

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
refused before anything runs. `dbtruth mcp` gives each tool call a time budget
of its own, 20 seconds by default (`--mcp-call-budget-seconds`), in place of
`--budget-seconds`.

## What it does not do

- It never writes to your database. Not once, not in a test, not behind a flag.
- No history: each run replaces `context/`, `snapshot.json` included; git keeps
  the history.
- Postgres only.
- No UI.

## Development

```bash
docker compose up -d --wait         # fixture, clean, scale, sampling, polymorph and fixture_template on port 54329
npm test                            # every test file
npm run test:unit                   # only the tests that need no database
npm run test:db                     # only the tests that need the databases
ANTHROPIC_API_KEY=... npm test      # also the two live tests
npm run verify                      # typecheck, every test, build, package smoke test
npm run acceptance -- --task T1.1   # score one task of BUILD_PLAN.md
npm run acceptance                  # score every task, then their mean
python scripts/render-demo.py       # regenerates docs/demo.gif from real output (needs Pillow)
node --import tsx scripts/make-fixture-snapshot.mjs <dir>   # context/ for the fixture without a model, for the Action's tests
```

The databases are loaded once, when the volume is made. After a file in
`test/fixtures/` changes, `docker compose down -v && docker compose up -d --wait`
loads them again; the tests that change data work on copies of
`fixture_template`, and say so when it is missing.

The package smoke test (`npm run test:pack`, the last step of `verify`) packs
the package, installs the tarball into an empty project and runs the installed
`dbtruth --help`, `dbtruth --version` and `dbtruth doctor` (against
`DATABASE_URL`, else the fixture), starts the installed `dbtruth mcp` as an
agent would, lists its tools and measures a join, and last runs the installed
`dbtruth init --skill` and compares the skill it writes with
`skills/dbtruth/SKILL.md`, so it tests what a user installs.
`npm run acceptance` runs the checks in `acceptance/checks.json`, counts the
manual items in `acceptance/manual.json`, and prints every check, each task's
score and, without `--task`, the overall score, weighted as section 4 of
`BUILD_PLAN.md` says. It exits 0 only at 100. The format of both files is
described at the top of `scripts/acceptance.mjs`.

MIT.
