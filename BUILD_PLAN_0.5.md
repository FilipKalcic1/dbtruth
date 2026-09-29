# dbtruth 0.4.2 -> 0.5.0: tenant-safe joins

Audience: the coding agent that implements this (Claude Code or similar) and
the maintainer who reviews it. This file is Phase 8 of the build plan, tasks
T8.1 to T8.13. It lives at the repository root beside `BUILD_PLAN.md` and
`NOTES.md`; NOTES.md already names it (entry "After 0.4.2 was published").
T8.1 adds one line to `CLAUDE.md`:

> Phase 8 is BUILD_PLAN_0.5.md. Before every task, reread its section 3 and
> sections 3 and 4 of BUILD_PLAN.md. Record every iteration in PROGRESS.md.

The code facts below are from branch `build-plan` at `0778e6a`. That commit
touched only `README.md` and `NOTES.md`, so every `src/` line number cited is
valid.

---

## 0. How to use this document

1. **What carries over unchanged.** Sections 0, 3, 4 and 5 of `BUILD_PLAN.md`
   apply to every task here, as written:
   - how a task is written (Why, Build, Edge cases, Tests, Acceptance, Docs);
     the A-items are the only definition of done; HUMAN items; "the code wins
     over the plan"; "a rule wins over a task" (section 0);
   - rules R1 to R11 (section 3);
   - the quality loop: the computed score, the weights, the gate rule, the loop
     steps, the forbidden ways to raise a score, the sabotage check, BLOCKED,
     the PROGRESS.md format (section 4);
   - the test layers, the fixture rules, the standing assertions, the commands
     and the manual release acceptance (section 5).

   Read them before this file.
2. **What this file adds.** Each addition is named here, and none overrides the
   sections above:
   - **Rules R12 to R15** (section 3.1). A task that cannot meet them is
     BLOCKED, not bent.
   - **The measurement contract** (sections 3.3 to 3.14): every claim shape,
     number, statement, rule and output string this plan introduces. Each task
     implements part of it. When a task's text and the contract disagree, the
     contract wins, and the disagreement is a mistake in this plan: stop and
     write it into PROGRESS.md.
   - **Failing first against the published version.** A number marked
     "0.4.2:" is what the published 0.4.2 gives. T8.1 records every one of them
     once, from a `v0.4.2` worktree (section 4.7). The task that fixes each one
     confirms again at loop step 2 that its new test fails, and for that
     reason. A "0.4.2:" number that 0.4.2 does not reproduce is a fixture bug:
     fix the fixture, never the expectation.
   - **The oracle rule.** Every exact number a test asserts on `tenancy` or
     `partitions` is also computed in `test/fixtures.test.ts` by an oracle: an
     independent query over the whole table, written with `NOT EXISTS`, arrays
     and `GROUP BY`, never with dbtruth's statement. The fixture's header, the
     oracle and dbtruth each check the other two.
   - **The compatibility guarantee.** From T8.3 on, `test/compat.test.ts`
     checks the committed 0.4.2 snapshots on every run of the suite, so every
     later task is gated on it (R13).
   - **Test names.** A name in quotes is the TAP name that the task's entries
     in `acceptance/checks.json` match. Keep it exact, or change the check in
     the same commit.
   - **A Sabotage line** in every task names the break that must turn a new
     test red (BUILD_PLAN 4.5).
3. **Priorities.** Every task of this plan but one is P0: the goal is
   everything the thread asked, so the breakdown (T8.8) and the scale proof
   (T8.9) block the release like the rest. HUMAN needs the maintainer. Only
   the maintainer may move a task out of the release, by writing a priority
   that starts with `deferred` (for example `deferred to 0.5.1`) in the
   overview table, with the reason in PROGRESS.md and in the reply on issue
   #19; the harness then leaves the task out of the overall score (T8.1).
   T8.12 is P1, by the maintainer's decision: a Claude Code backend for the
   full run's two model calls. The thread did not ask for it and no other
   task depends on it. It ships in 0.5.0 when it reaches 100 with the rest;
   if it does not, the maintainer defers it as above instead of holding the
   release.
4. **Nothing is published between tasks.** T8.2 to T8.12 ship together as
   0.5.0 (section 6). Every task ends with the suite green and a commit
   `<id>: <title> (score 100)`.
5. **Sequencing.** BUILD_PLAN 0.2 applies: a task starts only when every
   earlier task has scored 100 or is BLOCKED. Items that need the published
   package (`npm publish`, moving `v1`) and the live runs of prompt A all
   live in T8.13, and the manual runs at scale all live in T8.9, so no
   earlier task waits on the release or on a later task. A task whose only open
   items are HUMAN counts as done for sequencing. At loop step 4
   (BUILD_PLAN 4.3) a task also runs `npm run acceptance` for every task:
   T0.1 to T7.1 and every earlier T8 task must still print 100, since a
   README, NOTES or CHANGELOG edit can break a check of an older task.
6. **Operational notes, unchanged.** Rescoring (`npm run acceptance`) runs on
   an idle machine, because the timed tests are real. The Windows SIGTERM test
   proves itself only in CI. The API key lives only in `dbtruth-live/.env`:
   never read that file, never copy a key into `dbtruth/.env`, and never call a
   model from a test that is not opt-in. Every live A-item is HUMAN: the agent
   writes the exact command and what evidence to record. The live runs of
   prompt A sit in T8.13; the one run through the Claude Code CLI sits in
   T8.12, since it needs only the local build and the maintainer's login.

---

## 1. Where the project stands (verified on 2026-09-28)

### 1.1 Release state

| What | State |
|---|---|
| npm | dbtruth 0.4.2; its `dist` is identical to the npm tarball (audit) |
| GitHub Action | `dbtruth-action` v1 on the Marketplace. `action.yml` defaults `dbtruth-version` to `0.4.1`. `scripts/check.sh` reads only `report: 1` and counts `class == "regression"` and `"stale"`. |
| Snapshot format | 1 (`schemas.ts:249`). 0.4.x refuses a higher format with "`<file>` was written by a newer dbtruth (snapshot format N); upgrade dbtruth to check it" (`snapshot.ts:78`). |
| Branch | `build-plan` at `0778e6a`. The README warns of poolers, row level security, the value gate and composite keys. |
| Acceptance harness | `acceptance/checks.json` holds 479 checks for T0.1 to T7.1. `scripts/acceptance.mjs:125-129` reads the task list from the overview table of `BUILD_PLAN.md` only. |

### 1.2 What the r/mcp launch thread asked (issue #19, body and two owner comments)

In this order of priority:

1. **Tenant-scoped joins.** "In a multi-tenant schema an order can match a
   customer id in another tenant. That counts as a hit, and it silently
   corrupts results: a cross-tenant match is worse than an orphan, because it
   looks correct." The buckets: "same-tenant hits / cross-tenant hits: the id
   exists, but under another tenant / orphans / NULLs". "The cross-tenant
   count is what should fail a PR, because nothing else catches it." The scope
   "lives in the application's middleware, not in composite foreign keys", so
   "the model ... proposes 'orders.customer_id -> customers.id within
   tenant_id'. SQL then measures it."
2. **The parent walk first.** "`order_items -> orders -> tenant` is normal.
   Support the parent walk first. That is where the silent wrong-tenant bugs
   hide." The leaf's tenant is resolved through its parent, and the same
   buckets are measured on the leaf. A `tenant_id` on every table is "the
   special case: a path of length zero".
3. **Where the problems live.** "A join that is clean today but broken in old
   partitions shows up as a mildly degraded number ... If only one view can be
   built: orphan rate by tenant + partition."

Already true in 0.4.2 (issue body): NULLs are counted apart from the hit rate,
and non-null orphans are placed above, inside or below the key's range.

### 1.3 Audit findings this plan fixes first

From `prod-readiness.json` (each reproduced by an independent skeptic) and
`prod-readiness-verdict.md`:

| Verdict item | What was shown | Code |
|---|---|---|
| **P0 4: many small partitions sample empty** (blocker) | `TABLESAMPLE SYSTEM ... REPEATABLE (1)` keeps a page by a hash of its block number and the seed, so every leaf keeps the same block numbers. On 500 daily leaves (5M rows, 72 to 84 pages each) the sample held 0 rows. A join with 625,000 orphans of 5M (12.5%) read "empty: no non-null rows to test", exit 0. A 2M-row never-analyzed table read "size unknown". The profile fell back to a plain `LIMIT` and listed 5 of 500 days, missing `refunded`, which exists only in the last 30 leaves. Seeds 1 to 8 gave 0, 122760, 0, 60001, 60001, 60001, 136080 and 0 rows. Seed 1 first selects block 209 at 0.5 to 2%, 36 at 5%. Twelve monthly leaves are not hit. | `safety.ts:385`, `extract.ts:244`, `extract.ts:386-389`, `verify.ts:95` |
| **P0 5: composite keys** (blocker for multi-tenant users) | `extract.ts:324` pushes one FK entry per column. A NOT VALID `(tenant_id, project_id) -> projects(tenant_id, id)` with 20 of 150 rows violating read "confirmed 100%" on each column; the tuple truth is 130/150 = 86.7%. After the key was dropped and rows broken, `check --fail-on change` said "unchanged", exit 0. `measure_join` takes one column pair. No test database had a composite FK. | `extract.ts:324`, `schemas.ts:38`, `verify.ts:70`, `contextualize.md:34`, `mcp.ts:35-44` |
| **P1 12: an FK to a partitioned table is listed once per partition** (major) | One `pg_constraint` row per referenced partition (`conparentid <> 0`). With 4 hash partitions the FK was listed 5 times. Three tables referencing a 64-way table gave 196 phantom FKs: 68.2% of prompt A, "4 confirmed, 196 unverifiable", 64 "unknown table" lines per file, and `describe_table` showed them. The skeptic checked that keeping only `conparentid = 0` rows is safe for `withLocalForeignKeys`, and warned against dropping an FK declared to one partition on purpose. | `extract.ts:298-305` |

Estimates from the verdict: P0 4 one to two days; P0 5 in full (claims,
snapshot, check, `measure_join`) three to five days and a new format version;
P1 12 under an hour.

### 1.4 Facts checked for this plan

Measured on the fixture server (Postgres 16, `localhost:54329`) with temporary
tables only, which vanish at disconnect: `scratchpad/plan05/tenancy.cjs`,
`partitions.cjs`, `bd.cjs` and `scratchpad/plan08/exp3.cjs`. These scripts
lived in the plan author's session and are not in the repository; nothing in
a task depends on them, since T8.1 rebuilds every number from the fixtures of
section 4 and their oracles.

| Fact | Evidence |
|---|---|
| One seed over the parent reads none of 500 small leaves | `events_p` as in 4.3 (500 leaves x 100 rows, fillfactor 10: 7 pages each, 3,530 pages): `TABLESAMPLE SYSTEM (2)`, `(4)` and `(5) REPEATABLE (1)` on the parent each counted **0** rows. `logs_p` as in 4.3 (4,000 pages) at the pilot's 2.5%: **0**. |
| The plain fallback reads the first leaves | `SELECT * FROM events_p LIMIT 2000`: 20 days, 2025-01-01 to 2025-01-20, no `refunded`. |
| A seed per leaf, by name, fixes it (section 3.9) | At `--sample-rows 2000`: 239 of 500 leaves (two-stage, q = 1/2) at 8%: **1,845 rows from 97 leaves**, days 2025-01-09 to 2026-05-15, `refunded` present, `ref` hit **87.37%** (truth 87.5%). Statement 37 KB; planning 4.9 ms, execution 1.9 ms. At `--sample-rows 1000`: 860 rows from 53 leaves, 86.74%. The per-leaf pilot over `logs_p`: 273 arms at 5%, 1,285 rows, estimate **51,400** (truth 50,000). |
| The bucket statement of 3.5 equals an independent oracle | On every scoped claim of 4.2, including the 1-hop and 2-hop walks, the grouped hop, the uuid scope and the text slugs (numbers in 4.2). |
| The fence is needed | Without `OFFSET 0` Postgres copies the per-row CASE into every FILTER: **11 SubPlans** against 1 with the fence. On 3M orders into 500k customers (54,945 sampled rows): **1,638 ms without the fence, 590 ms with it**; the 0.4.2 keyed unscoped statement took 432 ms. |
| A per-row probe on a column no index leads with is quadratic | `EXISTS (... WHERE id = f.project_id)` against PK `(tenant_id, id)` with 1M rows: **3,950 ms for 2,000 rows**. The hashed any-tenant lookup plus the PK-probed same-tenant lookup: 682 ms for 51,800 rows. |
| uuid against text | `uuid = text` fails with SQLSTATE 42883 (in `DATATYPE_MISMATCH_STATES`); the `::text` retry counts 380 same and 20 cross. |
| FK clones | `subscriptions -> accounts_h` (HASH 4): 5 `'f'` rows, 1 with `conparentid = 0`. `logins`, `carts`, `reviews -> users_h64` (HASH 64): 65 rows each, 1 own. |
| Row values | Over `(1,1),(1,2),(NULL,1),(2,NULL),(2,2)` against `(1,1),(2,2)`: `(a, b) IS NOT NULL` counts 3, `count(ROW(a, b))` counts 5, row-value `EXISTS` hits 2 (code map). |
| `GROUPING SETS` with ranks and a rest row | Over an earlier layout of `ledger` (orphans in January and February, cross-tenant rows in March): the leaf rows, the tenant rows and the rest row summed exactly to the claim. The layout of 4.3 moves the problems to later months so that a label order cannot pass for a problem order; its numbers per leaf, tenant and cell come from the per-leaf oracle below. |
| No `min(uuid)` | Postgres 16 has no `min`/`max` for uuid, so a tenant value is carried as `(array_agg(x) FILTER (WHERE x IS NOT NULL))[1]`. |
| Fan-out | `stock` joined on `region` alone: 1,550 rows for 310. `tasks_nv` joined to `projects` on `id` alone: 387 rows for 150. |

Checked again on 2026-09-29, same server, temporary tables only
(`scratchpad/plan05r/tenancy-oracle.cjs`, `parts.cjs`, `blocks.cjs`), after
this plan's fixtures were extended:

| Fact | Evidence |
|---|---|
| Every number of 4.2 and 4.3 | The whole of 4.2's SQL loaded as written, every claim's buckets computed in JavaScript from the rows (an oracle that shares nothing with dbtruth's statements), and the partitions of 4.3 counted per leaf, tenant and cell. |
| An FK may list the columns of a unique key in another order | `visits (tenant_id, site_code) REFERENCES sites (tenant_id, code)` is accepted against `UNIQUE (code, tenant_id)`; `pg_constraint.confkey` keeps the FK's order. |
| An FK between two partitioned tables | `ledger_lines (ledger_id, month) -> ledger (id, month)`: 18 `'f'` rows, 16 on `ledger_lines` (its own and one clone per leaf of `ledger`, the three empty ones included) and one clone on each of its two leaves; 1 with `conparentid = 0`. |
| A seed per leaf reads every leaf of `ledger` | At 10%: 12 arms, 1,378 rows, every leaf at least 54 rows (56 pages per leaf at fillfactor 10). |
| An unrelated insert moves a sampled cross-tenant count | `ledger_2025_04` at 10% keeps blocks 7, 13, 18, 28, 32, 35, 40, 46, 51; at 9.091% block 18 drops out. With 9 cross-tenant rows in block 18, adding 1,200 clean December rows (estimate 12,000 -> 13,200) takes the sampled count from 9 to 0. |
| A `SELECT *` union misreads a leaf attached with its columns in another order | `swapped_p` with every orphan in `swapped_p_2`: the whole table 5,400 / 6,000; a union of `SELECT *` arms 6,000 / 6,000; named columns 5,400 / 6,000. Per leaf at `--sample-rows 1000`: 1,056 rows, 91.1%; `SELECT *` arms: 100%. |

### 1.5 Code facts the design rests on

1. `RelationshipSchema` (`schemas.ts:98-106`) is a non-strict `z.object`, so a
   0.4.x reader drops any new key silently and would measure a scoped claim as
   the plain join. A new claim key therefore raises `SNAPSHOT_FORMAT`, which is
   the project's own rule (`schemas.ts:245-248`, NOTES 0.2.0 "The snapshot
   format stays 1").
2. `relationshipId` (`schemas.ts:121-123`) keys verdicts to claims in the
   snapshot, `check` and MCP. Existing ids must not change.
3. `schemaOnly` (`schemas.ts:60-72`) puts `foreignKeys` into the fingerprint.
4. `verify.ts:70`: a lookup is keyed only when `to.column` leads the primary
   key. The extract carries no other unique information.
5. `verify.ts:95`: `total === 0` becomes `empty`. Only `profile` retries an
   empty sample, with a plain `LIMIT` that reads the first leaves.
6. `remeasure` (`check.ts:55-67`) profiles only the relations `claimNames`
   (`check.ts:168-177`) names; `classify` (`check.ts:150-162`) reads status and
   hit only.
7. `joinLine` (`write.ts:117-131`) is both the per-table line and the
   `measure_join` answer.
8. `JoinSchema` (`mcp.ts:35-44`) is a strict object; `mcp.test.ts:178-191`
   pins its keys.
9. `skill.test.ts:31-37` treats any backticked `lower_snake` span in the skill
   as a tool name; `readme.test.ts:33` (`REPORT`) exempts join lines from the
   Troubleshooting scan.
10. `structure.test.ts` "check.ts and snapshot.ts never import model" follows
    every `from "./x.js"`, type-only imports included, and `write.ts` imports
    `model`'s types. So `check.ts` can never import `write.ts`.
11. `pg_index.indkey` lists the INCLUDE columns after the key columns;
    `indnkeyatts` says how many are key columns.
12. `estimateRows` (`extract.ts:207-229`) sizes a partitioned table from its
    leaves' sizes; without them it reads the parent's own `reltuples`, which is
    -1 on Postgres 14 and later (the plain `LIMIT` form follows) and 0 with 0
    pages on 12 and 13 (the table reads as empty).
13. `fakeModel` (`test/canned.ts:39-46`) records `{system, messages}`.
14. `scripts/acceptance.mjs:92`: `--task` scores the id it is given and never
    reads a plan.
15. `pg_class.relname` is of type `name`, whose collation is `"C"` from
    Postgres 12; a `text` cast of it, such as `regclass::text`, sorts by the
    database's collation.

---

## 2. Goal, scope, and the definition of finished

**Goal**, in the thread's order:

1. A join measured within a tenant scope, with cross-tenant matches counted
   apart from same-tenant hits, orphans and NULLs. Any cross-tenant row breaks
   the join, and a new one fails the pull request. The scope comes from a
   claim (R4, R15).
2. The parent walk: the leaf's tenant is resolved through its parent path,
   then the same buckets are measured on the leaf. A tenant column on the leaf
   itself is the path of length zero, measured by the same code. The target's
   tenant can be resolved the same way, for a reference into a table that
   holds no tenant column of its own (`refunds -> order_items -> orders`).
3. Where the problems live: orphans and cross-tenant rows by tenant and
   partition together ("if only one view can be built: orphan rate by tenant +
   partition"), and each of the two apart.

**Prerequisites**, from the audit:

- Composite foreign keys measured whole. A tuple lookup is the same machinery
  as a scope of path length zero, so it is built first.
- Partitioned tables sampled correctly per leaf, deterministically, and no
  sampled measurement reported `empty` from a sample that read no rows. A
  per-partition breakdown is meaningless without it. A foreign key to a
  partitioned table listed once.

**Added by the maintainer** (P1, T8.12): a Claude Code backend for the full
run's two model calls, so a Claude Code user with a subscription and no API
key can run step 1. It revives BUILD_PLAN T5.3.

**Definition of finished (0.5.0):**

- Every number in section 4 is measured exactly (plain reads) or inside its
  stated band (sampled reads), and equals its oracle, on Postgres 12, 14, 16
  and 18.
- `check` fails a pull request on a cross-tenant share that rises above
  `crossTenantMaxShare` (by default: from 0 to above 0) or grows by
  `checkHitRateTolerance`, on a broken composite key, and on a dropped scope or
  path column.
- Every join that has orphans or cross-tenant rows says where they are: by
  tenant and partition, by tenant, and by partition, with the rows sampled in
  each group.
- A table of 500 small partitions is sampled across its leaves, in one
  statement per measurement, deterministically; its broken join exits 2.
- Every committed 0.4.2 snapshot checks with exit 0 and no regression or stale
  item, including one of composite keys (`tenancy`) and one of partitioned
  tables (`partitions`) (R13, 4.7), and a snapshot 0.5 writes for a schema
  without partitioned tables, tenant scopes or composite keys is still read by
  0.4.x (D5).
- The scale runs of 4.8 meet their limits, with 0.4.2 and 0.5 measured on the
  same machine.
- `dbtruth --backend claude-code` runs step 1 on `fixture` through the Claude
  Code CLI with no API key (T8.12), unless the maintainer deferred it.
- `npm run acceptance` prints 100 for T0.1 to T7.1 and for every T8 task the
  maintainer has not deferred (section 6); a deferred task is named, with its
  reason, in the reply on issue #19.
- 0.5.0 is on npm, and the Action's default version moved the same day.

**Out of scope** (Appendix E lists it as later work):

- From the audit: transaction-level settings and a client timeout for
  poolers; row level security; the value-visibility rule and key types
  (domain, `bpchar`, `citext`); coverage of wide schemas; model output limits
  and `charsPerToken`; `dead_table` ageing; keyed probes through non-PK unique
  keys for the existing single-column joins (P1 9); a schema filter; the "not
  weighed" label; column grants; the MCP `check` reply size; every P2 item.
- Beyond the thread: a condition on the target side such as soft deletes; a
  non-sampled full cross-tenant count; orphan ends for tuples, text, uuid and
  dates; a scope read from RLS policies; tables partitioned by inheritance
  rather than declared (TimescaleDB hypertables among them).

---

## 3. New rules, decisions, and the measurement contract

### 3.1 New rules

R1 to R11 stand. These four are added, and each has a test that fails if it is
broken.

- **R12 Old claims measure as they did.** On the same database and settings,
  the id, the statement text and the numbers of every claim 0.4.2 could hold
  are unchanged, unless an A-item names the change (and NOTES records it,
  R11). Pinned by `join.test.ts` (0.4.2's statement text for the fixture's
  claims), `compat.test.ts` and the existing fixture, polymorph and sampling
  assertions.
- **R13 Upgrading moves no CI result by itself.** A snapshot written by 0.4.x
  is re-measured the way 0.4.x measured it. A format a reader cannot read is
  refused with a sentence, never misread. Pinned by `compat.test.ts`.
- **R14 A sample proves nothing empty.** `empty` comes only from the catalog,
  from a read that covered the whole relation, or from a sample that read rows
  none of which the claim can test (every reference NULL, or no row in its
  `when` branch). A sampled read that found no rows at all is `unverifiable`
  with its reason (3.10). The catalog rule covers declared partitioning only:
  a parent of an inheritance tree whose own pages are 0 still reads empty from
  the catalog, as in 0.4 (known limit, Appendix E).
- **R15 The scope is a claim, and its values stay in the database.** No code
  chooses a tenant, scope or path column. Tenant values are compared inside
  the statement; they are never bound as parameters and never selected, except
  as a breakdown label of a column that passes the categorical gate (3.13).
  Stored queries hold identifiers, and `$1` for a `when` value, only.

**Where R1 to R11 bite here:**

| Rule | Here |
|---|---|
| R1 | Per-leaf samples, paths and breakdowns are inline `SELECT`s, and a `WITH ... AS MATERIALIZED` inside one statement: no temp table, function or `CREATE`. |
| R2 | Two new modules, both pure: `src/join.ts` (SQL builders, imports `safety` and `schemas`, runs nothing) and `src/where.ts` (the where-lines, imports `schemas`). `safety.ts` uses `node:crypto` for leaf seeds, a builtin. The Claude Code backend (T8.12) is a `Transport` inside `model.ts`, which stays the only module that talks to a model; it starts the CLI with `node:child_process`, a builtin, and imports no new package. |
| R3 | New outputs carry counts, rates, table, column and leaf names, and categorical values that passed the existing gate. A partition's name is a catalog name like a table's: it is in every stored per-leaf query (R7 needs it to rerun) and labels the partition groups, whatever the partitioning, so a schema that names partitions after its tenants shows those names, as `\d` would; README "Privacy" says so. Canary tests cover every new output with text slugs, names and uuids (4.9). |
| R4 | Tested twice: a scope column renamed to `x7` measures the same with the same claim (T8.6), and a schema full of tenant columns with no scope claim gets no scoped number (T8.6). |
| R5 | Five tunables (Appendix C), each with its comment, range, `DBTRUTH_*` variable, flag and `config.test.ts` case. |
| R6 | The Claude Code CLI's stdout is read by `model.ts` and never forwarded; its stderr reaches the user's stderr only inside a failure sentence (T8.12). |
| R7 | Every new statement is kept in its verdict and reruns as `reader` to the stored numbers. |
| R8 | Every table and column a tuple, scope or path names is looked up in the fresh catalog before any SQL is built (3.8), and quoted with `q()`/`qualified()`. Each path's length is bounded by this run's `tenantPathMaxHops`, never the snapshot's. |
| R9 | The Claude Code CLI that T8.12 starts talks to Anthropic, the one service a full run already calls, under the user's own login; dbtruth opens no connection of its own for it. The CLI runs with no tools and no MCP servers, so the call cannot reach anything else. |
| R10 | Each task writes a NOTES entry: what, why, what not. T8.4 corrects the 0.4.0 claim "sampling is unbiased on partitioned tables". |
| R11 | Existing assertions an A-item changes, each named in NOTES: the catalog shapes in `extract.test.ts`; the `measuredWith` key list in `snapshot.test.ts:221-254` (its `snapshot: 1` stays for the fixture, D5); the key list in `mcp.test.ts:178-191`; `describe_table`'s FK shape; the sampled text of `ev` and `nested` in `sampling.test.ts`; `REPORT` and `UNSEEN` in `readme.test.ts`; `basis` of one column of a composite key in `measure_join`; the dependency map in `structure.test.ts` (Appendix B). A later task of this plan that extends an exact assertion of an earlier one names it too: T8.4 adds the settings note and `events_p`'s `not measured` to T8.3's compatibility assertions; T8.7 adds the walk to T8.6's scenario 4 (T8.6's summary over `scopeClaims` stays, and T8.7 pins its own over `tenancyClaims`); T8.8 adds the where-lines to T8.6's `check` lines and `measure_join` answer. |

### 3.2 Decisions

Recorded here so that no task reopens them.

| Id | Question | Decision | Why |
|---|---|---|---|
| D1 | Claim shape | Two optional keys on `RelationshipSchema`, absent from every 0.4 claim: `also` (more column pairs, a composite key) and `within` (a tenant scope, with an optional path on the from side, `path`, and on the to side, `toPath`). `ColumnRef` does not change. | `from.column` stays valid for every existing code path. One shape covers the thread's path of length zero and the walk, on either side. |
| D2 | Buckets | Precedence null > orphan > unresolved > ambiguous > same-tenant > shared > cross-tenant. `unresolved` has three sub-counts on a path. | Orphans first, so a scoped claim splits exactly what its unscoped twin called hits (3.4). Sub-counts say which step failed, which is where the problem lives. |
| D3 | Verdict for cross-tenant | Reuse `broken`, after the `rejected` band (3.11). No new status. A rejected scoped claim with cross-tenant rows is still shown, as a "rejected scope" line in the summary and the file, never as a join to write; the unscoped line on the same columns says how many of its matches are under another tenant when a scoped claim beside it counted any (3.14). | A new status changes the enum in the snapshot and the report, and the Action counts `regression` by name. A scope that most rows fail is a wrong claim far more often than a majority leak, so it is rejected rather than put in front of agents as a join predicate; showing it with its count keeps a real majority leak from passing silently, and a move from confirmed or broken is still a `check` regression. Recorded as a known limit: a majority leak on a claim first measured this way exits 0. |
| D4 | `check` on cross-tenant | When the snapshot's status and the new one are both confirmed or broken: a share that rises above `crossTenantMaxShare` is a regression (by default 0 -> above 0); a share above it that grows by `checkHitRateTolerance` is a regression; a share that falls to it or below is improved. Moves to or from rejected keep the status rules. The breakdown never classifies. | "The cross-tenant count is what should fail a PR." A rejected scope is a claim no reader acts on, so it fails no build (rejected -> rejected never did). The share a user allows in a full run is the share `check` allows. |
| D5 | Snapshot format | 0.5 writes format 2 when a claim uses `also` or `within`, or names a partitioned table; otherwise format 1, which 0.4.x reads and measures exactly as 0.5 does. 0.5 reads 1 and 2. A format-1 file without `measuredWith.sampleMaxLeaves` is re-measured with 0, the 0.4 sampling. | The project's own rule (`schemas.ts:245-248`): the format rises when an older reader would misread the file. Those three are the only ways a 0.4.x reader would: it drops the new keys, and samples a partitioned parent with one seed. Every other snapshot stays readable by an Action pinned to 0.4.x. The cost, recorded in NOTES: a snapshot's format can change from one run to the next when a claim appears or goes. |
| D6 | `foreignKeys` shape | A single-column entry stays byte-identical, `{column, refTable, refColumn}`; a composite is one entry, `{columns, refTable, refColumns}`, in constraint order, with `period: true` for a temporal key (D19). The fingerprint is taken over the flat per-column form 0.4 hashed, without `period`. | Prompt A's input and every fingerprint of a schema without an FK to a partitioned table stay as they were: no spurious "schema changed" note on upgrade. |
| D7 | Unique information | `Table.uniqueKeys` from valid, whole-column unique indexes in `pg_index` (the primary key's included), each its first `indnkeyatts` columns (an INCLUDE column is no part of the key), each distinct key once. Used by the new lookups and by the "not unique in the target" note; kept out of the fingerprint, prompt A and `describe_table`. | A Rails-style `add_index unique: true` is an index, not a constraint. The existing single-column statement keeps 0.4.2's keyed rule (R12); extending it is audit P1 9, later. |
| D8 | Fan-out | A catalog note on the join line, not a measured number. | It changes no statement of an existing claim. |
| D9 | Per-leaf sampling | A `UNION ALL` of seeded `TABLESAMPLE` arms, one per leaf with pages, in the code-unit order of schema and name, at the same percent, selecting named columns; seeds from `sampleSeed` and the leaf's qualified name; above `sampleMaxLeaves` (256), one leaf in 2^k by a draw on its name, each arm at p x 2^k. | `REPEATABLE` takes one value per scan, so a seed per leaf needs an arm per leaf. A name survives dump and restore (an oid does not) and an added partition (an ordinal does not). Equal page probability keeps a blended rate unbiased. Named columns survive a leaf attached with another column order. Two-stage keeps statements bounded without falling back to the scheme that reads nothing. |
| D10 | Empty samples | `unverifiable` with a reason, never `empty` (R14). The profile uses a plain read only when that read covered the relation. | A biased read is never presented as a sample. |
| D11 | Hops | Single-column links, any columns the catalog has, declared or not, on the from side (`path`) and on the to side (`toPath`), through one resolution interface. A link that is not unique alone is measured: its rows are `ambiguous` on the from side; on the to side a key that reaches several tenants is a hit when any is the row's. A path through the same table twice is allowed; `tenantPathMaxHops` bounds each path. | Every thread example is single-column. In a schema normalized hard, a reference into a table with no tenant column (`refunds.order_item_id -> order_items.id`) is where a cross-tenant pointer hides, and it is the same walk from the other end. Measuring beats refusing; the bound is the safety. |
| D12 | Breakdown | One more statement per eligible claim, after every claim and every weighing (the `weigh` pattern); `GROUPING SETS` over the dimensions that apply: `(leaf, tenant)`, `(tenant)` and `(leaf)`; top `breakdownMaxRows` each, ranked in SQL, the rest summed; stored as the optional `measurement.breakdown` with `cell`, `tenant` and `partition`. | It never costs a claim its measurement. The thread: "if only one view can be built: orphan rate by tenant + partition". The cell is that view, and it says which tenant's rows in which partition are broken, which the two marginals cannot; the marginals come from the same statement at no extra read. |
| D13 | Tenant labels | The value only when the scope column passes the categorical gate `verify.ts:62` uses; otherwise `tenant #<rank>`, the tenant's rank in the tenant dimension, so one tenant has one label on every line. Partitions by leaf name, never bounds, whatever the partitioning (R3). `check` under `wider` settings: ranks only. | R3. |
| D14 | Words | The claim key is `within`; outputs say "tenant", the thread's word; MCP keys say `tenant`. | People read "cross-tenant"; code reads claims. |
| D15 | Where the SQL and the lines are built | New pure module `src/join.ts`: the lookups, the bucket statement, the resolution, the breakdown. `verify.ts` runs what it builds. New pure module `src/where.ts`: the where-lines, imported by `write.ts`, `check.ts` and `mcp.ts`. | The statement shapes are unit-tested with no database, and a structure test pins that `join.ts` runs nothing. `check.ts` may not import `write.ts` (1.5, item 10), and both print where-lines. |
| D16 | Release | 0.5.0. The Action's default moves the same day (HUMAN). | A new snapshot format. |
| D17 | Bounded lookups | A lookup or path that is hashed or grouped reads its table restricted to the values the sampled rows hold (`WHERE <key> IN (SELECT <reference> FROM f)`), with the rows read once as `WITH f AS MATERIALIZED (<rows>)` (3.5). A statement whose every lookup is keyed keeps the shape without the `WITH`. | A `GROUP BY` over a whole 20M-row parent that no index keys (a per-tenant primary key `(tenant_id, id)` is the common case) spills and times out; the sampled values are at most `sampleRows x sampleOversample`. Restricting a lookup to keys the rows hold changes no row's bucket. |
| D18 | Shared rows | A scoped hit is `(hits + shared) / total`. Shared rows stay a number and a clause of their own, and a confirmed line with shared rows says that the join on the tenant drops them. | A row that matches only a row of no tenant (a global product, a shared lookup) is a match in most designs, and the rest of this plan treats it so: the breakdown leaves it out of the problems, and a flag for designs where it is wrong is later work. Counted as a miss, a claim with no orphan and no cross-tenant row would read BROKEN and exit 2. |
| D19 | Temporal and MATCH FULL keys | A declared temporal foreign key (Postgres 18, `conperiod`) is listed with `period: true`; a claim on exactly its pairs is `unverifiable` with a sentence. A MATCH FULL key is measured with MATCH SIMPLE nulls, a known limit. | A `PERIOD` pair is range containment, not equality, so an equality tuple would read it broken. A row with a partial NULL cannot exist under a validated MATCH FULL key, so counting it with the nulls changes nothing there. |
| D20 | Claude Code backend (T8.12) | Opt-in by `--backend claude-code` or `DBTRUTH_BACKEND=claude-code`. One `claude -p` process per model request, in an empty temporary directory, with `--safe-mode --tools "" --strict-mcp-config --no-session-persistence --output-format json --system-prompt <the prompt's text> --json-schema <schema> --model <model>` (and `--effort` when the call has one); the request's input on stdin. Not `--bare`. | Checked against `claude --help` of Claude Code 2.1.283 on 2026-09-30: every flag above exists. `--bare` says "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)", so it would refuse exactly the user this backend is for, a subscription with no key. `--safe-mode` disables CLAUDE.md, skills, plugins, hooks, MCP servers and custom agents while "auth, model selection ... work normally"; with no tools and no MCP servers the call is a single-shot request, not an agent. |

### 3.3 Claim shape and ids

```ts
also?:   { from: string; to: string }[]           // more column pairs, all compared together: a composite key
within?: {
  column: string;                                 // the tenant column on the from-row, or on path's last table
  toColumn: string;                               // the tenant column on the to-row, or on toPath's last table
  path?: { column: string; table: string; key: string }[];     // from the from-row: current row's column -> table.key, in order
  toPath?: { column: string; table: string; key: string }[];   // from the to-row, the same way
}
```

Both objects are ordinary `z.object`s, as every claim part is: a model reply
with an extra key in them is read, not refused, since one reply is one parse
and a refusal would fail the whole run.

**Normalization** in `claimsSchema`, before the id is computed, so that every
spelling of one claim has one id:

- The pairs are `[(from.column, to.column), ...also]`. Exact duplicates are
  dropped, the rest sorted by from-column then to-column in code-unit order.
  The first pair becomes `from.column`/`to.column`; the others are `also`,
  which is left out when empty.
- `path: []` and `toPath: []` are left out, so each is the same claim as no
  path.
- Every path table is spelled as the extract spells it, as from and to are.

**Ids.** Every existing id is byte-identical. New parts are appended:

| Claim | Id |
|---|---|
| single (unchanged) | `relationship:orders.customer_id->customers.id` |
| tuple | `relationship:tasks_nv.(project_id, tenant_id)->projects.(id, tenant_id)` |
| scope, no path | `relationship:orders.customer_id->customers.id within tenant_id=tenant_id` |
| scope, 1 hop | `relationship:order_items.product_id->products.id within (order_id->orders.id).tenant_id=tenant_id` |
| scope, 2 hops | `relationship:order_lines.sku_id->skus.id within (purchase_order_id->purchase_orders.id, account_id->accounts.id).tenant_id=tenant_id` |
| scope, a path on the to side | `relationship:refunds.order_item_id->order_items.id within tenant_id=(order_id->orders.id).tenant_id` |
| branch and scope | `relationship:attachments.owner_id->orders.id[owner_type=order] within tenant_id=tenant_id` |
| branch and walk | `relationship:activity.actor_id->customers.id[subject_type=order] within (subject_id->orders.id).tenant_id=tenant_id` |

The part after `within` is `<from side>=<to side>`; a side is `ident(column)`
with no path, or `(<hop>, ...).ident(column)` with one, a hop being
`ident(column)->ident(table).ident(key)`. Every name in the new parts is
written by `ident(x)`: as it is when it matches `^[a-z_][a-z0-9_]*$`,
otherwise in double quotes with every `"` doubled. A path table is written as
`ident` of its display name, so `sales.orders` reads `"sales.orders"`. The new
parts are therefore injective. The 0.4 part keeps its old ambiguity for names
that contain `.` or `->`; at worst two such claims are merged by dedupe, never
turned into SQL (NOTES).

`also` and `within` compose with each other and with `when`.

### 3.4 Rows, buckets and precedence

`<rows>` is the from-table's sampled source (3.9), filtered by `when` exactly
as today (`w.<col>::text = $1`). Every statement of one claim reads the same
`<rows>` text. The **reference** is the tuple of from-columns: one column for
a single claim.

Each sampled row falls into exactly one bucket; the first rule that applies
decides.

| # | Bucket | Number | Condition |
|---|---|---|---|
| 1 | null | `nulls` | Any reference column is NULL (MATCH SIMPLE: Postgres does not enforce the key on such a row). Not in `total`. |
| 2 | orphan | `orphans` | No target row matches the reference, under any tenant. |
| 3 | unresolved | `unresolved` | Scoped only. The row's tenant set holds no value. On a path, split into `noLink` (the walk stopped at a NULL link), `noParent` (a link matched no row) and `noTenant` (the end rows were reached and their tenant is NULL). On path 0 it is a NULL tenant column. |
| 4 | ambiguous | `ambiguous` | Scoped only. The tenant set holds two or more values, or one value and a NULL: a link that is not unique alone. |
| 5 | same-tenant hit | `hits` | A target row matches the reference and its tenant equals the resolved tenant. |
| 6 | shared | `shared` | Scoped only. No same-tenant match, and a matching target row has no tenant: a NULL `toColumn`, or a `toPath` that reaches no row with one. |
| 7 | cross-tenant | `crossTenant` | Scoped only. The reference matches only target rows of other tenants. |

- **The tenant set** of a row is the set of `column` values on the end rows its
  path reaches, NULL included as a value. With no path it is `{f.<column>}`.
  A walk that stops on one branch (a dead link) and reaches end rows on
  another contributes only the end rows it reached.
- **The tenants of a target row** are the `toColumn` values of the end rows
  its `toPath` reaches, or `{t.<toColumn>}` with no `toPath`. The row is a
  same-tenant match when any of them is the resolved tenant, and a row of no
  tenant when none is non-null.
- **Sub-counts on a path of n hops**, by the first step at which the walk
  reaches nothing: the first link NULL -> `noLink`; the first link reaches no
  row -> `noParent`; at hop k >= 2, no reached row has a non-null link ->
  `noLink`, else no link reaches a row -> `noParent`; the end rows reached but
  every tenant NULL -> `noTenant`.
- `hit = (hits + shared) / total` for a scoped claim (D18);
  `hit = hits / total` otherwise. Unscoped claims keep `total = hits + orphans`.

**Invariants**, asserted by the tests on every scoped verdict:

- `total = hits + crossTenant + shared + orphans + unresolved + ambiguous`.
- `unresolved = noLink + noParent + noTenant` on a path.
- A scoped claim's `orphans` and `nulls` equal its unscoped twin's on the same
  sample, and `hits + crossTenant + shared + unresolved + ambiguous` equals the
  twin's `hits`. On `orders`: 1000 + 60 + 0 + 20 + 0 = 1080. On `order_items`:
  1630 + 120 + 40 + 120 + 0 = 1910.

**Numbers a verdict carries:**

- unscoped single: as 0.4.2 (`total, nulls, hits, orphans, hit`, and
  `orphansAbove`/`orphansBelow` where 0.4.2 computes them);
- tuple: `total, nulls, hits, orphans, hit`;
- scoped: `total, nulls, hits, crossTenant, shared, orphans, unresolved,
  ambiguous, hit`, always all of them, 0 included; `noLink, noParent,
  noTenant` on a path; `orphansAbove`/`orphansBelow` for a single integer
  reference whose target column leads the primary key, as 0.4.2's rule says.

### 3.5 Statements

All built in `src/join.ts`. `T` is the target, `q()`/`qualified()` quote
every name.

**The rows `f`.** Of the new shapes (tuple, scoped, breakdown), a statement
whose every lookup and every hop is keyed (3.6) reads `<rows> f` in its
`FROM`, as today. One with any hashed lookup or grouped path reads the rows
once, first (the unscoped single-column statement keeps 0.4.2's text, R12):

```sql
WITH f AS MATERIALIZED (SELECT <the columns it reads> FROM <rows> s)
```

and each hashed or grouped subquery then reads its table restricted to the
values those rows hold, `WHERE <key> IN (SELECT <reference> FROM f)` (a row
value for a tuple), D17. The restriction changes no row's bucket: a key that
no sampled row holds can match no sampled row.

**Unscoped single-column claim.** 0.4.2's statement, byte for byte, with
0.4.2's keyed rule (`to.primaryKey[0] === to.column`, no cast), R12.

**Unscoped tuple.** Keyed form (3.6):

```sql
SELECT count(*) FILTER (WHERE (f."project_id", f."tenant_id") IS NOT NULL) AS total,
       count(*) - count(*) FILTER (WHERE (f."project_id", f."tenant_id") IS NOT NULL) AS nulls,
       count(*) FILTER (WHERE (f."project_id", f."tenant_id") IS NOT NULL AND EXISTS (
         SELECT 1 FROM "public"."projects" t WHERE t."id" = f."project_id" AND t."tenant_id" = f."tenant_id")) AS hits
  FROM <rows> f
```

Hashed form: `LEFT JOIN (SELECT DISTINCT "id", "tenant_id" FROM T WHERE ("id", "tenant_id") IN (SELECT "project_id", "tenant_id" FROM f)) t ON t."id" = f."project_id" AND t."tenant_id" = f."tenant_id"`,
with `count(t."id") AS hits` under the same `IS NOT NULL` filter.
`count(ROW(a, b))` is never used: it counts partial NULLs.

**Unscoped bucket subquery**, used only by the breakdown (3.13), since the
aggregate above keeps 0.4.2's text:

```sql
SELECT f.tableoid AS leaf,
       CASE WHEN <any reference column IS NULL> THEN 'null'
            WHEN <found> THEN 'hit' ELSE 'orphan' END AS b
  FROM <rows with tableoid> f [<hashed lookup t>]
```

`<found>` is the claim's own test: `EXISTS (SELECT 1 FROM T t WHERE <pairs>)`
where the claim's statement probes, `t.<first key> IS NOT NULL` over the same
`LEFT JOIN (SELECT DISTINCT ...)` where it hashes, with the `::text` casts when
its measurement took the text fallback. It reads the same `<rows>` text with
`tableoid` added (3.9), so the same pages and the same cut, and puts each row
in the bucket the aggregate counted it in: `hits` is the count of `'hit'`,
`nulls` of `'null'`, `total - hits` of `'orphan'`.

**Scoped claim, any path on either side: one statement.**

```sql
[WITH f AS MATERIALIZED (...)]
SELECT count(*) FILTER (WHERE b = 'null') AS nulls,
       count(*) FILTER (WHERE b <> 'null') AS total,
       count(*) FILTER (WHERE b = 'hit') AS hits,
       count(*) FILTER (WHERE b = 'cross') AS cross_tenant,
       count(*) FILTER (WHERE b = 'shared') AS shared,
       count(*) FILTER (WHERE b = 'orphan') AS orphans,
       count(*) FILTER (WHERE b IN ('no_link', 'no_parent', 'no_tenant')) AS unresolved,
       count(*) FILTER (WHERE b = 'ambiguous') AS ambiguous
       [, count(*) FILTER (WHERE b = 'no_link') AS no_link, ... no_parent, ... no_tenant]      -- a from-side path only
       [, count(*) FILTER (WHERE b = 'orphan' AND ref > (SELECT max(t."id") FROM T t)) AS orphans_above, ... below]
  FROM (SELECT CASE WHEN <any reference column IS NULL> THEN 'null'
                    WHEN coalesce(a.n, 0) = 0           THEN 'orphan'
                    WHEN <unresolved>                   THEN <sub-count label>
                    WHEN <ambiguous>                    THEN 'ambiguous'
                    WHEN <same>                         THEN 'hit'
                    WHEN a.shared                       THEN 'shared'
                    ELSE 'cross' END AS b,
               f."<first reference column>" AS ref
          FROM <rows> f                                  -- or FROM f under the WITH
          [<resolution s>]
          <found lookup a>
          [<same lookup m, hashed form only>]
        OFFSET 0) r
```

- **The fence.** `OFFSET 0` is required. Without it Postgres inlines the CASE
  into every FILTER and runs each probe once per FILTER (1.4: 11 SubPlans, 2.8
  times slower). A test reads `EXPLAIN (ANALYZE, FORMAT JSON)` and adds up the
  loops of every scan of the target: with the fence at most two per sampled
  row (one found and one same probe), without it more than five. Loops are
  counted the same way on Postgres 12 to 18, where the SubPlans printed are
  not (12 and 13 print a hashed alternative beside each).
- **Resolution, no path:** `<unresolved>` is `f."<column>" IS NULL` with label
  `'no_tenant'`; `<ambiguous>` is `false`; the tenant is `f."<column>"`.
- **Resolution, a path, probe form** (every hop keyed, 3.6), shown for two
  hops; `pN` is the last hop's alias:

  ```sql
  LEFT JOIN LATERAL (
    SELECT count(p0."<key0>") AS r1,
           count(p0."<column1>") AS l2, count(p1."<key1>") AS r2,        -- one pair per further hop
           count(DISTINCT p1."<scope>") AS tenants,
           bool_or(p1."<key1>" IS NOT NULL AND p1."<scope>" IS NULL) AS untenanted,
           (array_agg(p1."<scope>") FILTER (WHERE p1."<scope>" IS NOT NULL))[1] AS tenant
      FROM <T0> p0 LEFT JOIN <T1> p1 ON p1."<key1>" = p0."<column1>"
     WHERE p0."<key0>" = f."<column0>") s ON true
  ```

  `<unresolved>` is `coalesce(s.tenants, 0) = 0`, labelled by
  `CASE WHEN f."<column0>" IS NULL THEN 'no_link' WHEN coalesce(s.r1, 0) = 0 THEN 'no_parent' WHEN s.l2 = 0 THEN 'no_link' WHEN s.r2 = 0 THEN 'no_parent' ... ELSE 'no_tenant' END`;
  `<ambiguous>` is `s.tenants > 1 OR s.untenanted`; the tenant is `s.tenant`.
  `untenanted` counts only an end row that was reached and holds no tenant: a
  dead link on one branch, which the `LEFT JOIN` extends with NULLs, is no
  end row (3.4; `batch_items` in 4.2 has 25 such rows, which a plain
  `bool_or(pN."<scope>" IS NULL)` would call ambiguous).
- **Resolution, a path, grouped form** (any hop not keyed): the same
  aggregates over the whole path, `SELECT p0."<key0>" AS v, <aggregates> FROM <T0> p0 LEFT JOIN ... WHERE p0."<key0>" IN (SELECT "<column0>" FROM f) GROUP BY p0."<key0>"`,
  joined `ON s.v = f."<column0>"`. Every path table is read once, and the
  grouping covers only the links the sampled rows hold (D17). A path is either
  all probe or all grouped: a hash inside a LATERAL is rebuilt per row.
- **Found lookup `a`** (any tenant): `n` counts matching target rows, and
  `shared` says whether one of them has no tenant: `bool_or(t."<toColumn>" IS NULL)`
  with no `toPath`. Probe: `LEFT JOIN LATERAL (SELECT count(*) AS n, bool_or(...) AS shared FROM T t WHERE <pairs>) a ON true`.
  Hashed: `LEFT JOIN (SELECT <keys>, count(*) AS n, bool_or(...) AS shared FROM T WHERE (<keys>) IN (SELECT <references> FROM f) GROUP BY <keys>) a ON <pairs>`.
- **Same lookup** (key and tenant): probe `EXISTS (SELECT 1 FROM T t WHERE <pairs> AND t."<toColumn>" = <tenant>)`
  inside the CASE; hashed `LEFT JOIN (SELECT DISTINCT <keys>, "<toColumn>" AS s FROM T WHERE "<toColumn>" IS NOT NULL AND (<keys>) IN (SELECT <references> FROM f)) m ON <pairs> AND m.s = <tenant>`
  with `<same>` = `m.<k1> IS NOT NULL`. With a keyed same lookup the target is
  read once, by the found lookup; a target with no unique key over the
  reference, or the text fallback, reads it twice, each time only at the
  sampled values.
- **A path on the to side** (`toPath`), the resolution interface run from the
  target row. In the found lookup each matching target row gets the number of
  non-null tenants its path reaches, `LEFT JOIN LATERAL (SELECT count(uN."<toColumn>") AS tenants FROM <U0> u0 LEFT JOIN ... WHERE u0."<key0>" = t."<column0>") x ON true`,
  and `shared` becomes `bool_or(x.tenants = 0)`: a row whose walk reaches no
  tenant is a row of no tenant, and a dead branch beside a live one is not. The
  same lookup joins the path inside its `EXISTS`
  (`... JOIN <U0> u0 ON u0."<key0>" = t."<column0>" ... WHERE <pairs> AND uN."<toColumn>" = <tenant>`),
  or, hashed, selects `uN."<toColumn>" AS s` over the same joins. A target key
  that reaches several tenants is a same-tenant match when any of them is the
  row's (3.4). Each hop is keyed or hashed by the rule of 3.6, and a hashed
  path is restricted to the sampled values like the rest.
- **No weighing** for tuple or scoped claims (`worthWeighing` is false).

### 3.6 Keyed or hashed

A lookup of the new shapes (tuple, found, same, hop on either side) is
**keyed**, probed per row, when no `::text` cast is in force and some unique
key U of the table it reads (`Table.uniqueKeys`) satisfies one of:

- (a) every column of U is among the lookup's equality columns;
- (b) the lookup has exactly one equality column and U leads with it.

Otherwise it is hashed. Worked cases on `tenancy`:

- `customers` (PK `id`): found by `id` keyed by (b); same by `{id, tenant_id}` keyed by (a).
- `projects` (PK `tenant_id, id`): found by `id` hashed; same by `{id, tenant_id}` keyed by (a); a hop into it on `id` hashed, so its path is grouped.
- `warehouses` (PK `region, code`): the tuple `{code, region}` keyed by (a), whatever the pair order.
- `sites` (unique keys `(code, tenant_id)` and `(id)`): the tuple `{code, tenant_id}` of `visits` keyed by (a).
- `labels` (no unique key): found and same hashed, so the target is read twice, at the sampled values only.
- `batches` (no unique key): a hop into it on `code` hashed, so the `batch_items` path is grouped.

The existing single-column unscoped lookup keeps 0.4.2's rule (R12). A keyed
hop into a partitioned parent whose key leads with the column, such as
`orders_p (id, created)` on `id`, probes every leaf per row, since no value of
`created` prunes it. That is measured, not refused: on `partitions` (12
leaves) it finishes and its numbers are pinned (4.3); at scale (4.8) the
24-leaf case must finish and the 500-leaf case is expected to end
`unverifiable` with the statement timeout's words. Pruning is later work.

### 3.7 The text fallback

A datatype mismatch (`42804`, `42883`, `42846`) retries once with `::text` on
every key pair and on the scope pair; every lookup is then hashed. Path links
are always compared natively: a link whose types differ fails both tries and
ends `unverifiable` with the server's words, which quote no value.

### 3.8 Validation before any SQL (R8)

A relationship is measured only when every check below passes. Each failure is
a skip with a sentence, and no statement is built:

- the from-table, the to-table and every table of either path are in the
  extract (`unknown table <name>`);
- every from-column and `also.from` column is on the from-table; every
  `to.column` and `also.to` column on the to-table; the `when` column on the
  from-table; each hop's `column` on the current table and its `key` on the hop
  table; `within.column` on `path`'s last table (the from-table with no path);
  `within.toColumn` on `toPath`'s last table (the to-table with no path)
  (`unknown column <table>.<column>`);
- each path has at most `tenantPathMaxHops` steps (`the tenant path has <k>
  steps, more than tenantPathMaxHops (<max>)`);
- the claim's pairs are not exactly those of a declared temporal key (D19):
  `<table>.(<columns>) -> <table>.(<columns>) is a temporal foreign key: its
  PERIOD pair is a range containment, which dbtruth does not measure`.

### 3.9 Sampling partitioned tables

**Leaves.** Only declared partitioning: a table partitioned by inheritance
(TimescaleDB's hypertables among them) is a plain relation, as in 0.4 (known
limit, Appendix E). A partitioned table whose tree holds only ordinary tables
keeps, as today, the size of every leaf (`estimate`, `pages`) for
`estimateRows`. When the current role may also read each leaf
(`has_table_privilege(oid, 'SELECT')`), every leaf carries its identity too,
`{schema, name, oid}`, and the table has named leaves; the catalog statement
orders them by `n.nspname, l.relname` (type `name`, collation `"C"`) and the
code sorts them again by code units, so no server's collation decides the
order. A tree with a foreign leaf has no leaves at all and is sampled as in
0.4, with its estimate -1 (T2.1, unchanged). A tree with a leaf the role
cannot read keeps the sizes and has no named leaves: privileges on a parent
do not extend to its partitions, so an arm naming such a leaf would fail
where the parent reads fine, while the sizes still keep the estimate from
the parent's own `reltuples` (1.5, item 12). Named leaves are an internal
field: never sent to the model, never in `TableFacts`, `describe_table` or the
fingerprint, and never stored as such in the snapshot, which holds a leaf's
name only inside a stored per-leaf query and as a breakdown label (R3).

**The per-leaf source** applies when `rowEstimate > sampleRows`, the table has
named leaves, and `sampleMaxLeaves > 0`:

```sql
(SELECT * FROM (SELECT "ref" FROM "public"."events_p_20250102" TABLESAMPLE SYSTEM (8) REPEATABLE (142205086593735)
                UNION ALL SELECT "ref" FROM "public"."events_p_20250103" TABLESAMPLE SYSTEM (8) REPEATABLE (275885605793167)
                ...) u LIMIT 6000)
```

(`events_p` at `--sample-rows 2000`, two-stage with q = 1/2: `events_p_20250101`
draws 0.8216 and gets no arm; `events_p_20250102` draws 0.2551 and
`events_p_20250103` 0.2294. A unit test pins these three.)

- **Seed and draw of a leaf:** `h = sha256(sampleSeed + "\0" + schema + "." + name)`
  as hex; the seed is `parseInt(h.slice(0, 12), 16)` (below 2^48, exact in a
  float8); the draw is `parseInt(h.slice(12, 20), 16) / 2^32`. Both depend on
  the leaf's own name only.
- **Arms:** one per leaf with `pages > 0`, in the leaves' order. A leaf with
  no pages holds no rows and gets no arm.
- **Percent:** `p = Number((100 * sampleRows / rowEstimate).toPrecision(4))`,
  as today, the same in every arm, so every page has one inclusion probability
  and a blended rate stays unbiased.
- **Two-stage above `sampleMaxLeaves`:** with L arms and M = `sampleMaxLeaves`,
  when L > M let `k = ceil(log2(L / M))`, `q = 2^-k`. A leaf gets an arm when
  its draw is below q, and every arm samples `min(100, p / q)` percent. Every
  page keeps one inclusion probability. q moves only when L crosses
  `M x 2^k`, and a leaf's own draw never depends on the others.
- **Columns:** each arm selects columns **by name**, never `*`. A measurement
  selects the columns it reads (the reference, `when`, the scope column, the
  first link); one that reads every column, such as the profile, names them
  all. `tableoid` is selected first when a breakdown asks for it.
- **`sampleMaxLeaves = 0`**, and every relation without named leaves: today's
  text, byte for byte. A format-1 snapshot without `sampleMaxLeaves` is
  re-measured this way (R13).
- **The pilot** of a partitioned table with no known estimate: `SELECT count(*) AS n FROM (<arms selecting 1>) u`
  at the pilot's percent, with the same seeds and the same two-stage rule;
  the estimate is `n * 100 / percent`. `integerKeys` sizes keys the same way.
- **No plain retry.** A per-leaf statement that fails is not retried with the
  plain form, which reads the first leaves; it ends `unverifiable` with the
  server's reason. Relations without named leaves keep today's retry.
- **The cut.** `LIMIT sampleRows x sampleOversample` over the union keeps the
  first arms in the leaves' order when the estimate was low by more than
  `sampleOversample` (documented, as 0.4 documented page order).
- **Prompt B.** `fitForWriter` sends every verdict with each stored per-leaf
  source shortened to its first arm and `/* <n> more arms, one per sampled
  leaf */`, so prompt B grows by a line, not by about 40 KB, per claim over a
  partitioned table. The snapshot, `--json` and `measure_join` keep the whole
  statement (R7).

### 3.10 Empty samples

- **A sampled relationship statement that counts no row at all**
  (`total + nulls = 0`):
  - over the plain form: `empty`, as today;
  - over a sampled form without `when`: `unverifiable`, reason
    `EMPTY_SAMPLE` = `the sample read no rows, though <table> holds about <n>; a larger --sample-rows reads more pages`;
  - over a sampled form with `when`: one budgeted probe,
    `SELECT count(*) AS n FROM <source> s`. If it counts 0, the result is the
    `unverifiable` above. Otherwise it is `empty`: the branch has no row in a
    sample that has rows.
- **A sampled relationship statement that counts rows, every one with a null
  reference** (`total = 0`, `nulls > 0`): `empty`, "no non-null rows to test",
  as today. The sample read rows and none could be tested; R14 allows it, and
  the `nulls` it carries say so.
- **`inconsistent_values`** (`distinctValues = 0`) and **`duplicate_entity`**
  (`total = 0`) over a sampled form take the same probe.
- **The profile.** When the sampled statistics count `n = 0`, the plain form
  is read as today. If it came back short (`n < sampleRows`) it covered the
  relation, and its statistics stand. If it filled up it read only the first
  pages or leaves: the table gets `unmeasured` = `the sample read no rows, and the first <sampleRows> rows would not stand for the table`,
  the existing honest path (keys only, no value lists, no years). Both
  branches have a unit test in `extract.test.ts` with an injected `Db`.
- **`check` on a measurement that now reads no rows.** A claim measured before
  and `EMPTY_SAMPLE` now is `not measured`, which fails no build under any
  `--fail-on` (0.4.2 called the same event `changed`, which fails under
  `--fail-on change`). A pull request that edits `measuredWith` down to a
  sample that reads nothing gets that result on purpose; it could as well
  delete the claim, and the diff of `snapshot.json` shows either. Range checks
  on snapshot settings are later work (Appendix E); NOTES records both.

### 3.11 Verdict (`decide`)

For a relationship, the first rule that applies:

1. no `hit`: `unverifiable`;
2. `hit < join.broken`: `rejected` (unchanged; for a scoped claim, most rows
   do not match inside that scope, so the scope is not one the rows share);
3. `crossTenant / total > crossTenantMaxShare`: `broken` (default share 0: any
   cross-tenant row);
4. `hit >= join.confirmed`: `confirmed`;
5. otherwise `broken`.

`hit` is the one of 3.4: a scoped claim's counts its shared rows (D18), so
`tags` in 4.2, 20 shared rows of 200 and nothing else wrong, is confirmed at
100.0% and exits 0. Claims with no `crossTenant` get exactly 0.4.2's
verdicts. The status enum and `exitCode` do not change: a broken relationship
exits 2.

### 3.12 Snapshot, `check` and the Action

- **`SNAPSHOT_FORMAT = 2`**, the highest format this build reads and writes.
  `formatFor(claims, extract)` in `snapshot.ts` applies D5: a snapshot is
  written as format 2 when a claim has `also` or `within`, or its from-table,
  to-table or a path table is a partitioned table; otherwise as format 1, which
  0.4.x reads and measures exactly as 0.5 does (its `measuredWith` may carry
  the two new keys, which 0.4.x drops and which change nothing there).
  `snapshot` accepts the literals 1 and 2; above 2 the existing sentence
  refuses it.
- **`measuredWith`** gains two optional keys, range-checked through
  `resolveConfig` like the others: `sampleMaxLeaves` (absent means 0: the file
  was sampled the 0.4 way) and `crossTenantMaxShare` (absent means this run's).
  `tenantPathMaxHops` and `breakdownMaxRows` are never read from a snapshot:
  one bounds untrusted input, the other changes no verdict.
- **`claimNames`** lists every name a claim uses: every pair, `when`, the
  scope columns, and for each hop of either path `[current table, column]` and
  `[hop table, key]`. `remeasure` profiles every relation named, so a dropped
  path or scope column makes the claim stale.
- **`classify`**, after the stale rule and before the status comparison, when
  the snapshot's status and the new one are each `confirmed` or `broken` and
  both numbers carry `crossTenant`. With `m` the `crossTenantMaxShare` the
  claim is measured with (the snapshot's, or this run's when absent) and each
  share `crossTenant / total`:
  - before at most `m`, after above `m`: `regression` (by default 0 -> above 0);
  - before above `m`, and the share grew by at least `checkHitRateTolerance`:
    `regression`;
  - before above `m`, after at most `m`: `improved`;
  - otherwise the existing rules.

  A move to or from `rejected` or `unverifiable` keeps the status rules only.
  A rejected scope is a claim no reader acts on, so it fails no build, however
  its share moves (rejected -> rejected never did; scenario 9); a scoped claim
  that goes from confirmed or broken to rejected is a regression, as any claim
  is.
- **Sampled counts.** On a sampled read the cross-tenant count is a count of
  sampled rows. A pull request that changes a table's size changes the pages
  sampled, so a cross-tenant row that was always there can enter the sample
  (`regression`) or leave it (`improved`) with no row of the claim changed.
  Scenario 10 pins it on `ledger`; the where-line names the partition, which
  tells a reviewer the rows are old. NOTES and README "Keeping context true"
  say so. A floor for sampled counts is later work (Appendix E).
- **The report** stays `report: 1` with the same class set. Each claim gains
  the optional `crossTenantBefore`. `side()` prints `broken 99.5%, 5 cross-tenant`
  on a side whose numbers carry `crossTenant`.
- **The Action** needs no parsing change: a cross-tenant failure has class
  `regression`, so `regressions`, `stale` and `result` keep working. Its
  default `dbtruth-version` moves to `0.5.0` on release day (T8.11 prepares
  it, T8.13 merges it).

### 3.13 Breakdown: where the problems live

- **Eligible:** a measured relationship with
  `orphans + crossTenant + unresolved + ambiguous > 0` (call it `problems`;
  shared rows are no problem, D18) whose from-table has named leaves (3.9), or
  whose claim is scoped. `breakdownMaxRows = 0` turns it off.
- **Dimensions.** `cell` (partition and tenant together: the thread's "orphan
  rate by tenant + partition"), `partition` and `tenant`. A scoped claim over a
  partitioned from-table gets all three; a scoped claim over a plain table gets
  `tenant`; an unscoped claim over a partitioned table gets `partition`,
  because the thread asks for the orphan rate by partition independently of
  tenants.
- **When:** one budgeted statement per eligible claim, after every claim and
  every weighing. A failure or an exhausted budget leaves the measurement as it
  was.
- **Statement,** shown for all three dimensions; only the sets that apply are
  built, and the `dim` expression and the tenant ranks follow them:

  ```sql
  WITH r AS (<the claim's bucket subquery (3.5), over a source with tableoid, projecting leaf, tenant and b> OFFSET 0),
  g AS (SELECT CASE WHEN grouping(leaf) = 0 AND grouping(tenant) = 0 THEN 'cell'
                    WHEN grouping(tenant) = 1 THEN 'partition' ELSE 'tenant' END AS dim,
               leaf, tenant, count(*) FILTER (WHERE b <> 'null') AS total, <one count per bucket>,
               count(*) FILTER (WHERE b IN ('orphan', 'cross', 'no_link', 'no_parent', 'no_tenant', 'ambiguous')) AS problems
          FROM r GROUP BY GROUPING SETS ((leaf, tenant), (leaf), (tenant))),
  t AS (SELECT tenant, row_number() OVER (ORDER BY problems DESC, total DESC, tenant::text COLLATE "C") AS tenant_rank
          FROM g WHERE dim = 'tenant'),
  k AS (SELECT g.*, t.tenant_rank,
               row_number() OVER (PARTITION BY g.dim ORDER BY g.problems DESC, g.total DESC,
                                  g.leaf::regclass::text COLLATE "C", t.tenant_rank) AS rank,
               count(*) OVER (PARTITION BY g.dim) AS groups
          FROM g LEFT JOIN t ON g.dim <> 'partition' AND t.tenant IS NOT DISTINCT FROM g.tenant)
  SELECT dim, rank, groups, leaf::bigint AS leaf_oid, tenant_rank, [tenant::text AS tenant,] <counts>
    FROM k WHERE rank <= <breakdownMaxRows>
  UNION ALL
  SELECT dim, NULL, max(groups), NULL, NULL, [NULL,] <sums> FROM k WHERE rank > <breakdownMaxRows> GROUP BY dim
  ```

  An unscoped claim uses the unscoped bucket subquery of 3.5 (null, orphan,
  hit). The tenant of an unresolved or ambiguous row is NULL, and those rows
  form the group `no single tenant`. Every tie is broken by a name or a text
  in collation `"C"` (1.5, item 15), so two servers keep the same groups.
  Groups with a problem rank before every group without one.
- **R3.** `tenant::text` is selected only when the scope column passes the
  categorical gate (`on.visible && distinct <= categoricalMaxDistinct && maxLength <= categoricalMaxValueLength`,
  on the path's last table for a walk). Otherwise the statement selects no
  tenant value: the value is used only inside the statement, and the code
  labels the rows by `tenant_rank`. Under `check`'s `wider` settings every
  column is hidden, so every label is a rank.
- **Labels.** A partition is the display name of the leaf whose oid the row
  carries: a catalog name, shown as a table's name is (R3 row of 3.1). A
  tenant is `<column> <value>` or `tenant #<tenant_rank>`, the tenant's rank in
  the tenant dimension, so one tenant has one label on the cell and tenant
  lines. A cell is `<partition> / <tenant>`.
- **Storage:**

  ```ts
  measurement.breakdown?: {
    cell?:      { labels: "values" | "ranks"; groups: number; rows: Group[]; rest?: Counts & { groups: number } };
    partition?: { groups: number; unsampled: number; empty: number; rows: Group[]; rest?: Counts & { groups: number } };
    tenant?:    { labels: "values" | "ranks"; groups: number; rows: Group[]; rest?: Counts & { groups: number } };
  }
  type Group  = { label: string } & Counts;
  type Counts = { total: number; nulls: number; hits: number; orphans: number; crossTenant?: number; shared?: number; unresolved?: number; ambiguous?: number };
  ```

  `empty` is the leaves with no pages; `unsampled` the leaves with pages and no
  sampled row (with two-stage sampling, the leaves without an arm too). Neither
  is ever a 0% row. The kept query is the join's statement, `;\n`, the
  breakdown statement, and the `$1` note last, as `weigh` keeps its own.
- **Invariant:** over each dimension, the rows plus `rest` sum exactly to the
  claim's numbers (without a LIMIT cut, 3.9).
- **`check`** never classifies on a breakdown.

### 3.14 What users and CI see

Every string here is rendered in code and pinned by the test of the task that
introduces it (named in brackets). Numbers are from `tenancy` and `partitions`
at default settings.

**Join lines** (`context/tables/<table>.md`; `measure_join` answers with the
same line):

```
- stock.(code, region) -> warehouses.(code, region): confirmed, 100.0% of 300 sampled rows match. 10 sampled rows (3.2%) have a null in code or region; an inner join drops them too.
- **BROKEN** tasks_nv.(project_id, tenant_id) -> projects.(id, tenant_id): 86.7% match (130 of 150 sampled), 20 orphans. An inner join drops the orphans: use LEFT JOIN, or filter them on purpose.
```

[T8.5] The note, appended to the line as 0.4.2 writes it, for a
single-column unscoped claim whose target column is in a unique key of two or
more columns and is no unique key by itself, on every status but rejected. On
`tenancy` the whole line reads as below; the weighing is new there, since
0.4.2 took one column of a declared composite key for a declared join and did
not weigh it, and the last sentence is the twin clause of T8.6:

```
- tasks_nv.project_id -> projects.id: confirmed, 100.0% of 150 sampled rows match (inferred; the same values would also match 27 other keys, so the match alone does not prove this join). Not unique in the target: projects.id is part of the unique key (tenant_id, id) of projects, so a join on it alone can match several projects rows. 20 of these rows match only under another tenant, as the join within tasks_nv.tenant_id = projects.tenant_id counted: join on the tenant too.
```

[T8.6] Scoped, path 0:

```
- **BROKEN, CROSS-TENANT** orders.customer_id -> customers.id within orders.tenant_id = customers.tenant_id (inferred): 60 of 1130 sampled rows (5.3%) match a customers.id only under another tenant. 1000 (88.5%) match within their tenant; 50 orphans, all above the highest customers.id; 20 have no orders.tenant_id. Join on customers.id = orders.customer_id AND customers.tenant_id = orders.tenant_id, and use LEFT JOIN for the orphans. 80 sampled rows (6.6%) have no customer_id; an inner join drops them too.
- **BROKEN, CROSS-TENANT** invoices.customer_id -> customers.id within invoices.tenant_id = customers.tenant_id (inferred): 5 of 1000 sampled rows (0.5%) match a customers.id only under another tenant. 995 (99.5%) match within their tenant. Join on customers.id = invoices.customer_id AND customers.tenant_id = invoices.tenant_id.
- quotes.customer_id -> customers.id within quotes.tenant_id = customers.tenant_id (inferred): confirmed, 100.0% of 300 sampled rows match within their tenant and none under another tenant, though a share below 1.0% can go unseen in 300 rows. Join on customers.id = quotes.customer_id AND customers.tenant_id = quotes.tenant_id.
- tags.label_id -> labels.id within tags.tenant_id = labels.tenant_id (inferred): confirmed, 100.0% of 200 sampled rows match within their tenant or a row of no tenant, and none under another tenant, though a share below 1.5% can go unseen in 200 rows. 20 match only labels rows with no tenant_id, which a join on the tenant drops. Join on labels.id = tags.label_id AND labels.tenant_id = tags.tenant_id.
```

The clauses after "match within their tenant" appear only when their count is
above 0, in this order, joined by "; ": `<shared> match only <to.table> rows with no <toColumn>`;
`<orphans> orphans<orphan ends>`; the unresolved clause;
`<ambiguous> reach more than one tenant through their path`. On path 0 the
unresolved clause is `<n> have no <from.table>.<column>`. The floor in a
confirmed line is `3 / total` (the rule of three). With `crossTenantMaxShare`
above 0, a confirmed line with cross-tenant rows says
`<n> under another tenant, within --cross-tenant-max-share` in place of "none
under another tenant".

**The twin clause.** An unscoped line on the same pairs and `when` as a scoped
claim that counted cross-tenant rows ends, after the line as 0.4.2 writes it
and after the note, with
`<n> of these rows match only under another tenant, as the join within <from side> = <to side> counted: join on the tenant too.`
It names the scoped claim with the most cross-tenant rows (ties by id in
code-unit order). On `orders`:

```
- orders.customer_id -> customers.id: confirmed, 95.6% of 1130 sampled rows match (inferred). 80 sampled rows (6.6%) have no customer_id; an inner join drops them too. 60 of these rows match only under another tenant, as the join within orders.tenant_id = customers.tenant_id counted: join on the tenant too.
```

**A rejected scope** with cross-tenant rows is never a join line. It is a line
under "Known problems" in the from-table's file (D3):

```
- rejected scope: orders.customer_id -> customers.id within orders.id = customers.tenant_id (inferred): 1077 of 1130 sampled rows (95.3%) match a customers.id only under another tenant, and 3 (0.3%) within their tenant. A scope that most rows fail is most likely the wrong column; if it is the right one, most rows point at another tenant's rows.
```

[T8.7] Through a parent, and through the target's parent:

```
- **BROKEN, CROSS-TENANT** order_items.product_id -> products.id within orders.tenant_id = products.tenant_id, through order_items.order_id -> orders.id (inferred): 120 of 1970 sampled rows (6.1%) match a products.id only under another tenant. 1630 (82.7%) match within their tenant; 40 match only products rows with no tenant_id; 60 orphans, all above the highest products.id; 120 with no single tenant: 50 stop at a null reference, 50 at a reference to a missing row, 20 reach an orders row with no tenant_id. Join orders on orders.id = order_items.order_id, then products on products.id = order_items.product_id AND products.tenant_id = orders.tenant_id, and use LEFT JOIN for the orphans. 40 sampled rows (2.0%) have no product_id; an inner join drops them too.
- **BROKEN** task_notes.author_id -> project_members.id within projects.tenant_id = project_members.tenant_id, through task_notes.project_id -> projects.id (inferred): 54.5% match within their tenant (60 of 110 sampled); 10 orphans, all above the highest project_members.id; 40 reach more than one tenant through their path. Join projects on projects.id = task_notes.project_id, then project_members on project_members.id = task_notes.author_id AND project_members.tenant_id = projects.tenant_id.
- **BROKEN, CROSS-TENANT** refunds.order_item_id -> order_items.id within refunds.tenant_id = orders.tenant_id, through order_items.order_id -> orders.id on the target side (inferred): 30 of 350 sampled rows (8.6%) match an order_items.id only under another tenant. 300 (85.7%) match within their tenant; 10 match only order_items rows whose path reaches no tenant_id; 10 orphans, all above the highest order_items.id. Join order_items on order_items.id = refunds.order_item_id, then orders on orders.id = order_items.order_id AND orders.tenant_id = refunds.tenant_id, and use LEFT JOIN for the orphans.
```

Two hops read `, through order_lines.purchase_order_id -> purchase_orders.id, purchase_orders.account_id -> accounts.id`.
Each sub-count clause appears only when above 0.

[T8.8] Where: sub-lines under a join that has a breakdown, the cell first.
The unscoped `ledger` claim; the scoped one (three lines); `orders`; `docs ->
people`; `cards`, whose problem groups outnumber `breakdownMaxRows`:

```
  - where, by partition: ledger_2025_10: 150 of 1000 (15.0%), ledger_2025_07: 90 of 1000 (9.0%); 10 others: none of 10000; 3 hold no rows.

  - where, by tenant and partition: ledger_2025_10 / tenant_id 1: 75 of 500 (15.0%), ledger_2025_10 / tenant_id 2: 75 of 500 (15.0%), ledger_2025_04 / tenant_id 2: 60 of 500 (12.0%, 60 cross-tenant), ledger_2025_07 / tenant_id 1: 45 of 500 (9.0%), ledger_2025_07 / tenant_id 2: 45 of 500 (9.0%); 19 others: none of 9500.
  - where, by partition: ledger_2025_10: 150 of 1000 (15.0%), ledger_2025_07: 90 of 1000 (9.0%), ledger_2025_04: 60 of 1000 (6.0%, 60 cross-tenant); 9 others: none of 9000; 3 hold no rows.
  - where, by tenant: tenant_id 2: 180 of 6000 (3.0%, 60 cross-tenant), tenant_id 1: 120 of 6000 (2.0%).

  - where, by tenant: tenant_id 2: 60 of 393 (15.3%, 60 cross-tenant), tenant_id 3: 40 of 373 (10.7%), no single tenant: 30 of 30 (100.0%); 1 other: none of 334.
  - where, by tenant: tenant #1: 20 of 100 (20.0%, 20 cross-tenant); 3 others: none of 300.
  - where, by tenant: tenant #1: 1 of 11 (9.1%, 1 cross-tenant), tenant #2: 1 of 10 (10.0%, 1 cross-tenant), tenant #3: 1 of 10 (10.0%, 1 cross-tenant), tenant #4: 1 of 10 (10.0%, 1 cross-tenant), tenant #5: 1 of 10 (10.0%, 1 cross-tenant); 55 others: 25 of 549 (4.6%, 25 cross-tenant).
```

A group reads `<label>: <problems> of <total> (<share>[, <n> cross-tenant])`.
Kept groups with no problem and the rest row are summed into
`<k> other(s): none of <m>`, or `<k> other(s): <p> of <m> (<share>[, <n> cross-tenant])`
when the rest holds problems. The partition line then adds
`<u> had no sampled row` and `<e> hold no rows` when above 0.

**Terminal, full run** (stderr) [T8.6, T8.7]: cross-tenant joins are counted
inside "broken" and listed first, most cross-tenant rows first, ties by id in
code-unit order; the other broken joins follow in claim order, as today; a
rejected scope with cross-tenant rows gets a line after them. Over
`tenancyClaims` (4.6):

```
relationships: 7 confirmed (1 on weak evidence), 10 broken (8 cross-tenant), 0 rejected, 0 unverifiable, 0 empty
  order_items.product_id->products.id within (order_id->orders.id).tenant_id=tenant_id  hit rate 84.8%, 120 cross-tenant
  orders.customer_id->customers.id within tenant_id=tenant_id  hit rate 88.5%, 60 cross-tenant
  order_lines.sku_id->skus.id within (purchase_order_id->purchase_orders.id, account_id->accounts.id).tenant_id=tenant_id  hit rate 89.9%, 50 cross-tenant
  cards.board_id->boards.id within ws_slug=ws_slug  hit rate 95.0%, 30 cross-tenant
  docs.owner_id->guests.id within org_id=org_ref  hit rate 95.0%, 20 cross-tenant
  docs.owner_id->people.id within org_id=org_id  hit rate 95.0%, 20 cross-tenant
  tasks_nv.project_id->projects.id within tenant_id=tenant_id  hit rate 86.7%, 20 cross-tenant
  invoices.customer_id->customers.id within tenant_id=tenant_id  hit rate 99.5%, 5 cross-tenant
  task_notes.author_id->project_members.id within (project_id->projects.id).tenant_id=tenant_id  hit rate 54.5%
  tasks_nv.(project_id, tenant_id)->projects.(id, tenant_id)  hit rate 86.7%
```

Over `scopeClaims` (4.6; T8.6, before the walks exist) the first line reads
`relationships: 7 confirmed (1 on weak evidence), 7 broken (6 cross-tenant), 0 rejected, 0 unverifiable, 0 empty`.
With the nonsense scope added, it counts `1 rejected`, and after the broken
lines:

```
  rejected scope orders.customer_id->customers.id within id=tenant_id  hit rate 0.3%, 1077 cross-tenant
```

**`check`** (stderr, scenario 1 of 4.5) [T8.6, T8.8]:

```
regression relationship:invoices.customer_id->customers.id within tenant_id=tenant_id: confirmed 100.0%, 0 cross-tenant -> broken 99.5%, 5 cross-tenant
  where, by tenant: tenant_id 3: 5 of 336 (1.5%, 5 cross-tenant); 2 others: none of 664.
```

The pull request comment keeps its four columns; the After cell reads
`broken 99.5%, 5 cross-tenant`. [T8.8] For failing rows with a breakdown, a
folded part follows the table: `<details><summary>where</summary>`, one
bullet per row, `<id as code>: <where line>`, counted inside the comment's
50 rows.

**MCP `measure_join`** [T8.5 to T8.7]. The six existing keys keep their names,
meaning and refine. New optional keys, all strictly validated:

| Key | Meaning | Refused when (sentence) |
|---|---|---|
| `also` | `[{from_column, to_column}]`, the other pairs of a composite key | empty list; an item with another key (the strict schema) |
| `tenant_column`, `to_tenant_column` | the scope columns | one without the other: `tenant_column and to_tenant_column go together: give both, or neither` |
| `tenant_path` | `[{column, table, key}]`, from `from_table` to the table holding `tenant_column` | without `tenant_column`: `tenant_path needs tenant_column: the path ends at the table that holds it`; longer than `tenantPathMaxHops`: the sentence of 3.8, before any lookup |
| `to_tenant_path` | `[{column, table, key}]`, from `to_table` to the table holding `to_tenant_column` | without `to_tenant_column`: `to_tenant_path needs to_tenant_column: the path ends at the table that holds it`; longer than `tenantPathMaxHops`: the sentence of 3.8, before any lookup |

The answer is the join line, then JSON `{"claim": <id>, "status": ..., "measurement": {"query", "numbers", "breakdown"?}}`.
For the walk of `order_items` the numbers are `total 1970, nulls 40, hits 1630,
crossTenant 120, shared 40, orphans 60, unresolved 120, ambiguous 0, noLink 50,
noParent 50, noTenant 20, hit 0.8477157360406091, orphansAbove 60,
orphansBelow 0`.

**Skill** (`skills/dbtruth/SKILL.md`, under "Acting on what you find") [T8.6,
T8.7]. Input names in quotes, not code spans (`skill.test.ts:31-37`):

```
- a join shown "within a.x = b.y" holds inside one tenant only: join on the key and on the
  tenant columns, through the tables after "through" when it names any. Never join it on the key alone.
- **BROKEN, CROSS-TENANT**: rows point at another tenant's rows. Join on the tenant too, and tell
  the user how many rows are affected.
- "rejected scope": most rows fail that scope, so it is most likely the wrong column. Do not join on
  it; ask the user which column keeps tenants apart.
- a join between column lists, "t.(a, b) -> u.(x, y)": join on every pair.
- "Not unique in the target": join on the whole key it names.
- before joining two tables that each belong to a tenant, call `measure_join` with "tenant_column"
  and "to_tenant_column", and "tenant_path" or "to_tenant_path" when a table has no tenant column
  of its own.
```

---

## 4. Test strategy additions

BUILD_PLAN 5.1 to 5.5 stand. Additions:

### 4.1 New test files

| File | Layer (`package.json`) | Tasks |
|---|---|---|
| `test/fixtures.test.ts` | `test:db` | T8.1 (oracles and preconditions) |
| `test/compat.test.ts` | `test:db` | T8.3, then every task |
| `test/partitions.test.ts` | `test:db` | T8.2, T8.4, T8.7, T8.8 |
| `test/tenancy.test.ts` | `test:db` | T8.2, T8.5 to T8.8 |
| `test/join.test.ts` | `test:unit` | T8.5 to T8.8 (exact statement text, no database) |
| `test/where.test.ts` | `test:unit` | T8.8 (every where-line form, no database) |
| `test/claude-code.test.ts` | `test:unit` | T8.12 (the Claude Code transport against a fake `claude` in `test/fake-claude/`, no database, no model) |

Each is in exactly one of `test:unit` and `test:db` (`acceptance.test.ts:208`).
Existing files are extended where named.

### 4.2 Database `tenancy` (`test/fixtures/tenancy.sql`, mounted `70-tenancy.sql`)

Every table is smaller than `sampleRows`, so every measurement reads the whole
table and every number is exact. The statements below were validated against
an oracle on temporary tables (1.4); use them as written. Every table is
created `WITH (autovacuum_enabled = false)` (omitted below for width), and the
file ends with `ANALYZE;`. No uuid or text tenant column is a declared key, so
none is visible and none reaches the model or a file (4.9). Each table after
`cards` exists for one edge case of a task, named in its comment.

```sql
CREATE DATABASE tenancy;
\connect tenancy
CREATE TABLE tenants (id int PRIMARY KEY);
INSERT INTO tenants SELECT generate_series(1, 3);
CREATE TABLE customers (id int PRIMARY KEY, tenant_id int NOT NULL REFERENCES tenants, name text);
INSERT INTO customers SELECT i, 1 + (i - 1) / 100, 'canary-pii-' || i FROM generate_series(1, 300) i;
CREATE TABLE orders (id int PRIMARY KEY, tenant_id int REFERENCES tenants, customer_id int);   -- no FK on customer_id
INSERT INTO orders SELECT i, 1 + (i - 1) % 3, 100 * ((i - 1) % 3) + 1 + ((i - 1) / 3) % 100 FROM generate_series(1, 1000) i;
INSERT INTO orders SELECT i, 2, i - 1000 FROM generate_series(1001, 1060) i;              -- 60 cross-tenant
INSERT INTO orders SELECT i, 3, 9001 + (i - 1061) FROM generate_series(1061, 1100) i;     -- 40 orphans, all above
INSERT INTO orders SELECT i, 1 + (i - 1) % 3, NULL FROM generate_series(1101, 1180) i;    -- 80 nulls
INSERT INTO orders SELECT i, NULL, 1 + (i - 1181) FROM generate_series(1181, 1200) i;     -- 20 with no tenant
INSERT INTO orders SELECT i, NULL, 9041 + (i - 1201) FROM generate_series(1201, 1210) i;  -- 10 with no tenant and no customer: orphans (orphan before unresolved)
CREATE TABLE invoices (id int PRIMARY KEY, tenant_id int, customer_id int);
INSERT INTO invoices SELECT i, 1 + (i - 1) % 3, 100 * ((i - 1) % 3) + 1 + ((i - 1) / 3) % 100 FROM generate_series(1, 995) i;
INSERT INTO invoices SELECT i, 3, i - 995 FROM generate_series(996, 1000) i;              -- 5 cross-tenant
CREATE TABLE quotes (id int PRIMARY KEY, tenant_id int, customer_id int);                 -- nothing wrong
INSERT INTO quotes SELECT i, 1 + (i - 1) % 3, 100 * ((i - 1) % 3) + 1 + ((i - 1) / 3) % 100 FROM generate_series(1, 300) i;
CREATE TABLE products (id int PRIMARY KEY, tenant_id int, deleted_at timestamptz, name text);
INSERT INTO products SELECT i, CASE WHEN i <= 300 THEN 1 + (i - 1) / 100 END, CASE WHEN i <= 10 THEN timestamptz '2025-01-01' END,
       'canary-pii product ' || i FROM generate_series(1, 330) i;                          -- 301..330: no tenant; 1..10 soft-deleted
CREATE TABLE order_items (id int PRIMARY KEY, order_id int, product_id int);              -- no tenant column, no FKs
INSERT INTO order_items SELECT i, 3 * ((i - 1) % 333) + 1, 1 + (i - 1) % 10 FROM generate_series(1, 30) i;          -- same tenant, soft-deleted products
INSERT INTO order_items SELECT i, 1 + (i - 1) % 999, 100 * (((i - 1) % 999) % 3) + 1 + (i % 100) FROM generate_series(31, 1630) i;
INSERT INTO order_items SELECT i, 3 * ((i - 1631) % 333) + 1, 101 + (i - 1631) % 100 FROM generate_series(1631, 1710) i;  -- 80 cross (t1 -> t2)
INSERT INTO order_items SELECT i, 3 * ((i - 1711) % 333) + 2, 1 + (i - 1711) % 100 FROM generate_series(1711, 1750) i;   -- 40 cross (t2 -> t1)
INSERT INTO order_items SELECT i, 1 + (i - 1751) % 999, 9001 + (i - 1751) FROM generate_series(1751, 1800) i;      -- 50 orphans
INSERT INTO order_items SELECT i, 1 + (i - 1801) % 999, 301 + (i - 1801) % 30 FROM generate_series(1801, 1840) i;  -- 40 shared
INSERT INTO order_items SELECT i, 1 + (i - 1841) % 999, NULL FROM generate_series(1841, 1880) i;                   -- 40 nulls
INSERT INTO order_items SELECT i, NULL, 1 + (i - 1881) FROM generate_series(1881, 1930) i;                         -- 50 null link
INSERT INTO order_items SELECT i, 9001 + (i - 1931), 1 + (i - 1931) FROM generate_series(1931, 1980) i;            -- 50 link to no order
INSERT INTO order_items SELECT i, 1181 + (i - 1981), 1 + (i - 1981) FROM generate_series(1981, 2000) i;            -- 20 orders with no tenant
INSERT INTO order_items SELECT i, NULL, 9051 + (i - 2001) FROM generate_series(2001, 2010) i;                      -- 10 null link and no product: orphans
CREATE TABLE accounts (id int PRIMARY KEY, tenant_id int NOT NULL);
INSERT INTO accounts SELECT i, 1 + (i - 1) / 20 FROM generate_series(1, 60) i;
CREATE TABLE purchase_orders (id int PRIMARY KEY, account_id int);
INSERT INTO purchase_orders SELECT i, CASE WHEN i <= 290 THEN 1 + (i - 1) % 60 WHEN i <= 295 THEN NULL ELSE 901 + (i - 296) END FROM generate_series(1, 300) i;
CREATE TABLE skus (id int PRIMARY KEY, tenant_id int NOT NULL);
INSERT INTO skus SELECT i, 1 + (i - 1) / 30 FROM generate_series(1, 90) i;
CREATE TABLE order_lines (id int PRIMARY KEY, purchase_order_id int, sku_id int);
INSERT INTO order_lines SELECT i, 1 + (i - 1) % 290, 30 * (((i - 1) % 290) % 60 / 20) + 1 + i % 30 FROM generate_series(1, 800) i;
INSERT INTO order_lines SELECT i, 1 + (i - 1) % 290, 30 * ((((i - 1) % 290) % 60 / 20 + 1) % 3) + 1 + i % 30 FROM generate_series(801, 850) i;
INSERT INTO order_lines SELECT i, 1 + (i - 1) % 290, 9001 + i FROM generate_series(851, 870) i;
INSERT INTO order_lines SELECT i, 1 + (i - 1) % 290, NULL FROM generate_series(871, 880) i;
INSERT INTO order_lines SELECT i, 291 + (i - 881) % 5, 1 + i % 90 FROM generate_series(881, 890) i;   -- null link at hop 2
INSERT INTO order_lines SELECT i, 296 + (i - 891) % 5, 1 + i % 90 FROM generate_series(891, 900) i;   -- link to no account at hop 2
CREATE TABLE projects (tenant_id int, id int, PRIMARY KEY (tenant_id, id));
INSERT INTO projects SELECT 1, i FROM generate_series(1, 10) i UNION ALL SELECT 2, i FROM generate_series(1, 10) i
  UNION ALL SELECT 3, i FROM generate_series(1, 5) i UNION ALL SELECT 3, i FROM generate_series(11, 15) i;
CREATE TABLE tasks (tenant_id int, id int, project_id int, PRIMARY KEY (tenant_id, id),
                    FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id));
INSERT INTO tasks SELECT t, i, CASE WHEN t = 3 THEN (ARRAY[1,2,3,4,5,11,12,13,14,15])[1 + i % 10] ELSE 1 + i % 10 END
  FROM generate_series(1, 3) t, generate_series(1, 200) i;
CREATE TABLE tasks_nv (tenant_id int, id int, project_id int, PRIMARY KEY (tenant_id, id));
INSERT INTO tasks_nv SELECT 1 + (i - 1) % 3, i, CASE WHEN (i - 1) % 3 = 2 THEN 1 + (i - 1) % 5 ELSE 1 + (i - 1) % 10 END FROM generate_series(1, 130) i;
INSERT INTO tasks_nv SELECT 3, i, 6 + (i - 131) % 5 FROM generate_series(131, 150) i;     -- 20: projects 6..10 exist only in tenants 1 and 2
ALTER TABLE tasks_nv ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects (tenant_id, id) NOT VALID;
CREATE TABLE project_members (id int PRIMARY KEY, tenant_id int);
INSERT INTO project_members SELECT i, 1 + (i - 1) / 10 FROM generate_series(1, 30) i;
CREATE TABLE task_notes (id int PRIMARY KEY, project_id int, author_id int);
INSERT INTO task_notes SELECT i, 11 + (i - 1) % 5, 21 + (i - 1) % 10 FROM generate_series(1, 60) i;     -- projects only tenant 3 has
INSERT INTO task_notes SELECT i, 1 + (i - 61) % 10, 1 + (i - 61) % 30 FROM generate_series(61, 100) i;  -- projects in two or three tenants
INSERT INTO task_notes SELECT i, 1 + (i - 101) % 10, 99 FROM generate_series(101, 110) i;                -- an ambiguous project and no author: orphans (orphan before ambiguous)
CREATE TABLE warehouses (region text, code int, PRIMARY KEY (region, code));
INSERT INTO warehouses SELECT r, c FROM unnest(ARRAY['eu', 'us']) r, generate_series(1, 5) c;
CREATE TABLE stock (id int PRIMARY KEY, region text, code int, FOREIGN KEY (region, code) REFERENCES warehouses);
INSERT INTO stock SELECT i, (ARRAY['eu', 'us'])[1 + (i - 1) % 2], 1 + ((i - 1) / 2) % 5 FROM generate_series(1, 300) i;
INSERT INTO stock SELECT i, 'eu', NULL FROM generate_series(301, 310) i;
CREATE UNIQUE INDEX stock_id_region ON stock (id) INCLUDE (region);                      -- T8.2: an INCLUDE column is no part of a key
CREATE TABLE people (id int PRIMARY KEY, org_id uuid NOT NULL);
INSERT INTO people SELECT i, md5('org-' || (1 + (i - 1) / 50))::uuid FROM generate_series(1, 200) i;
CREATE TABLE docs (id int PRIMARY KEY, org_id uuid NOT NULL, owner_id int);
INSERT INTO docs SELECT i, md5('org-' || (1 + (i - 1) / 100))::uuid, 50 * ((i - 1) / 100) + 1 + i % 50 FROM generate_series(1, 380) i;
INSERT INTO docs SELECT i, md5('org-4')::uuid, 1 + i % 50 FROM generate_series(381, 400) i;   -- 20 of org 4 owned by org 1
CREATE TABLE guests (id int PRIMARY KEY, org_ref text);
INSERT INTO guests SELECT id, org_id::text FROM people;
CREATE TABLE workspaces (slug text PRIMARY KEY);
INSERT INTO workspaces SELECT 'canary-pii-ws-' || i FROM generate_series(1, 60) i;
CREATE TABLE boards (id int PRIMARY KEY, ws_slug text);
INSERT INTO boards SELECT i, 'canary-pii-ws-' || (1 + (i - 1) % 60) FROM generate_series(1, 120) i;
CREATE TABLE cards (id int PRIMARY KEY, board_id int, ws_slug text);
INSERT INTO cards SELECT i, 1 + (i - 1) % 120, 'canary-pii-ws-' || (1 + ((i - 1) % 120) % 60) FROM generate_series(1, 570) i;
INSERT INTO cards SELECT i, 1 + (i - 1) % 120, 'canary-pii-ws-' || (1 + ((i - 1) % 120 + 1) % 60) FROM generate_series(571, 600) i;  -- 30 cross
CREATE TABLE labels (id int NOT NULL, tenant_id int);                                    -- T8.6: no unique key, labels of no tenant
INSERT INTO labels SELECT i, t FROM generate_series(1, 20) i, generate_series(1, 2) t;
INSERT INTO labels SELECT i, NULL FROM generate_series(21, 30) i UNION ALL SELECT i, 1 FROM generate_series(21, 30) i;
CREATE TABLE tags (id int PRIMARY KEY, tenant_id int NOT NULL, label_id int);
INSERT INTO tags SELECT i, 1 + (i - 1) % 2, 1 + (i - 1) % 20 FROM generate_series(1, 180) i;
INSERT INTO tags SELECT i, 2, 21 + (i - 181) % 10 FROM generate_series(181, 200) i;      -- 20 shared: labels of no tenant and of tenant 1 (shared before cross)
CREATE TABLE folders (tenant_id int NOT NULL REFERENCES tenants, id int, parent_id int, PRIMARY KEY (tenant_id, id),
                      FOREIGN KEY (tenant_id, parent_id) REFERENCES folders (tenant_id, id));   -- T8.2: a self-referencing composite FK; tenant_id in two FKs
INSERT INTO folders SELECT t, i, CASE WHEN i > 2 THEN 1 + i % 2 END FROM generate_series(1, 3) t, generate_series(1, 10) i;
CREATE TABLE sites (id int PRIMARY KEY, tenant_id int NOT NULL, code int NOT NULL, UNIQUE (code, tenant_id));
INSERT INTO sites SELECT i, 1 + (i - 1) / 10, 1 + (i - 1) % 10 FROM generate_series(1, 30) i;
CREATE TABLE visits (id int PRIMARY KEY, tenant_id int, site_code int);
INSERT INTO visits SELECT i, 1 + (i - 1) % 3, 1 + (i - 1) % 10 FROM generate_series(1, 120) i;
INSERT INTO visits SELECT i, 3, i - 110 FROM generate_series(121, 130) i;                -- 10 orphans
ALTER TABLE visits ADD FOREIGN KEY (tenant_id, site_code) REFERENCES sites (tenant_id, code) NOT VALID;   -- T8.2: to a UNIQUE constraint, columns in another order
CREATE TABLE bins (region text, code int, slot int, PRIMARY KEY (region, code, slot));
INSERT INTO bins SELECT r, c, s FROM unnest(ARRAY['eu', 'us']) r, generate_series(1, 5) c, generate_series(1, 4) s;
CREATE TABLE picks (id int PRIMARY KEY, region text, code int, slot int);
INSERT INTO picks SELECT i, (ARRAY['eu', 'us'])[1 + (i - 1) % 2], 1 + ((i - 1) / 2) % 5, 1 + ((i - 1) / 10) % 4 FROM generate_series(1, 200) i;
INSERT INTO picks SELECT i, 'eu', 1, 5 FROM generate_series(201, 220) i;                -- 20 orphans: no slot 5
INSERT INTO picks SELECT i, 'us', NULL, 1 FROM generate_series(221, 230) i;             -- 10 with a null in the key
ALTER TABLE picks ADD FOREIGN KEY (region, code, slot) REFERENCES bins NOT VALID;       -- T8.2: three columns
CREATE TABLE attachments (id int PRIMARY KEY, tenant_id int, owner_type text NOT NULL, owner_id int);   -- T8.6: a scope with when
INSERT INTO attachments SELECT i, 1 + (i - 1) % 3, 'order', i FROM generate_series(1, 90) i;
INSERT INTO attachments SELECT i, 1, 'order', 2 + 3 * (i - 91) FROM generate_series(91, 100) i;        -- 10 cross: tenant-2 orders
INSERT INTO attachments SELECT i, 1 + (i - 101) % 3, 'invoice', i - 100 FROM generate_series(101, 160) i;
CREATE TABLE activity (id int PRIMARY KEY, subject_type text NOT NULL, subject_id int, actor_id int);   -- T8.7: a path with when
INSERT INTO activity SELECT i, 'order', i, 100 * ((i - 1) % 3) + 1 + i FROM generate_series(1, 45) i;
INSERT INTO activity SELECT i, 'order', 3 * (i - 46) + 1, 101 + (i - 46) FROM generate_series(46, 50) i;  -- 5 cross
INSERT INTO activity SELECT i, 'invoice', i, 1 FROM generate_series(51, 70) i;
CREATE TABLE categories (id int PRIMARY KEY, parent_id int, tenant_id int, owner_id int);    -- T8.7: a path through the same table twice
INSERT INTO categories SELECT i, NULL, i, NULL FROM generate_series(1, 3) i;
INSERT INTO categories SELECT i, 1 + (i - 4) % 3, NULL, NULL FROM generate_series(4, 9) i;
INSERT INTO categories SELECT i, 4 + (i - 10) % 6, NULL, 100 * ((i - 10) % 3) + 1 + i % 50 FROM generate_series(10, 39) i;
INSERT INTO categories SELECT i, 4 + (i - 10) % 6, NULL, 100 * ((i - 9) % 3) + 1 + i % 50 FROM generate_series(40, 45) i;   -- 6 cross
CREATE TABLE batches (code int NOT NULL, account_id int);                                -- T8.7: no unique key; codes 1..5 also link to no account
INSERT INTO batches SELECT c, 1 + (c - 1) * 6 FROM generate_series(1, 10) c;
INSERT INTO batches SELECT c, 901 FROM generate_series(1, 5) c;
CREATE TABLE batch_items (id int PRIMARY KEY, batch_code int, sku_id int);
INSERT INTO batch_items SELECT i, 1 + (i - 1) % 10, 30 * (((i - 1) % 10) * 6 / 20) + 1 + i % 30 FROM generate_series(1, 50) i;
CREATE TABLE refunds (id int PRIMARY KEY, tenant_id int, order_item_id int);             -- T8.7: a path on the target side
INSERT INTO refunds SELECT r, 1 + (29 + r) % 3, 30 + r FROM generate_series(1, 300) r;
INSERT INTO refunds SELECT r, 1 + (30 + r) % 3, r - 270 FROM generate_series(301, 330) r;   -- 30 cross
INSERT INTO refunds SELECT r, 1, 1550 + r FROM generate_series(331, 340) r;                 -- 10 shared: items whose order_id is null
INSERT INTO refunds SELECT r, 2, 9000 + r FROM generate_series(341, 350) r;                 -- 10 orphans
ANALYZE;
GRANT USAGE ON SCHEMA public TO reader;               -- the role seed.sql creates; roles are cluster-wide
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
```

**Expected numbers** (all confirmed by the oracle in 1.4). "0.4.2" is what the
published version gives for the same canned claim, whose `also` and `within`
it drops; for a stated tuple, what it gives for the flattened halves of the
declared key.

| Claim | total | nulls | hits | cross | shared | orphans | unresolved (link / parent / tenant) | ambig. | hit | status | 0.4.2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `orders.customer_id -> customers.id within tenant_id=tenant_id` | 1130 | 80 | 1000 | 60 | 0 | 50, all above | 20 | 0 | 88.5% | broken | 1080/1130 = 95.6%, confirmed |
| `invoices.customer_id -> customers.id within tenant_id=tenant_id` | 1000 | 0 | 995 | 5 | 0 | 0 | 0 | 0 | 99.5% | **broken** | 1000/1000, confirmed |
| `quotes.customer_id -> customers.id within tenant_id=tenant_id` | 300 | 0 | 300 | 0 | 0 | 0 | 0 | 0 | 100.0% | confirmed, floor 1.0% | confirmed |
| `tags.label_id -> labels.id within tenant_id=tenant_id` (shared rows only) | 200 | 0 | 180 | 0 | 20 | 0 | 0 | 0 | 100.0% | confirmed, floor 1.5%, exit 0 | 200/200, confirmed |
| `attachments.owner_id -> orders.id[owner_type=order] within tenant_id=tenant_id` | 100 | 0 | 90 | 10 | 0 | 0 | 0 | 0 | 90.0% | broken | 100/100, confirmed |
| `order_items.product_id -> products.id within (order_id->orders.id).tenant_id=tenant_id` | 1970 | 40 | 1630 | 120 | 40 | 60, all above | 120 (50 / 50 / 20) | 0 | 84.8% | broken | 1910/1970 = 97.0%, confirmed |
| `orders.customer_id -> customers.id within (id->orders.id).tenant_id=tenant_id` (self-walk, PW4) | 1130 | 80 | 1000 | 60 | 0 | 50 | 20 (0 / 0 / 20) | 0 | 88.5% | broken | same as the first row |
| `order_items.order_id -> orders.id` (the hop, unscoped) | 1950 | 60 | 1900 | | | 50, all above | | | 97.4% | confirmed | same |
| `order_lines.sku_id -> skus.id within (purchase_order_id->purchase_orders.id, account_id->accounts.id).tenant_id=tenant_id` | 890 | 10 | 800 | 50 | 0 | 20, all above | 20 (10 / 10 / 0) | 0 | 89.9% | broken | 870/890 = 97.8%, confirmed |
| `task_notes.author_id -> project_members.id within (project_id->projects.id).tenant_id=tenant_id` (grouped hop) | 110 | 0 | 60 | 0 | 0 | 10, all above | 0 | 40 | 54.5% | broken | 100/110 = 90.9%, broken |
| `activity.actor_id -> customers.id[subject_type=order] within (subject_id->orders.id).tenant_id=tenant_id` | 50 | 0 | 45 | 5 | 0 | 0 | 0 | 0 | 90.0% | broken | 50/50, confirmed |
| `categories.owner_id -> customers.id within (parent_id->categories.id, parent_id->categories.id).tenant_id=tenant_id` | 36 | 9 | 30 | 6 | 0 | 0 | 0 | 0 | 83.3% | broken | 36/36, confirmed |
| `batch_items.sku_id -> skus.id within (batch_code->batches.code, account_id->accounts.id).tenant_id=tenant_id` | 50 | 0 | 50 | 0 | 0 | 0 | 0 | 0 | 100.0% | confirmed (a plain `bool_or(pN.<scope> IS NULL)` reads 25 ambiguous) | 50/50, confirmed |
| `refunds.order_item_id -> order_items.id within tenant_id=(order_id->orders.id).tenant_id` | 350 | 0 | 300 | 30 | 10 | 10, all above | 0 | 0 | 88.6% | broken | 340/350 = 97.1%, confirmed |
| `tasks_nv.(project_id, tenant_id) -> projects.(id, tenant_id)` (stated) | 150 | 0 | 130 | | | 20 | | | 86.7% | **broken** | two single-column claims, **100% and 100%, confirmed** |
| `tasks_nv.project_id -> projects.id within tenant_id=tenant_id` | 150 | 0 | 130 | 20 | 0 | 0 | 0 | 0 | 86.7% | broken | 150/150, confirmed |
| `tasks_nv.project_id -> projects.id` (inferred, single) | 150 | 0 | 150 | | | 0 | | | 100.0% | confirmed, with the note, weighed: 28 candidates, alsoFits 27 | confirmed, no note, not weighed |
| `tasks.(project_id, tenant_id) -> projects.(id, tenant_id)` (stated) | 600 | 0 | 600 | | | 0 | | | 100.0% | confirmed | two claims at 100% |
| `stock.(code, region) -> warehouses.(code, region)` (stated) | 300 | 10 | 300 | | | 0 | | | 100.0% | confirmed | `region` 310/310, `code` 300/300 |
| `visits.(site_code, tenant_id) -> sites.(code, tenant_id)` (stated) | 130 | 0 | 120 | | | 10 | | | 92.3% | broken | `site_code` 120/130 broken, `tenant_id` 130/130 confirmed |
| `picks.(code, region, slot) -> bins.(code, region, slot)` (stated) | 220 | 10 | 200 | | | 20 | | | 90.9% | broken | `region` 230/230, `code` 220/220, `slot` 210/230 = 91.3% broken |
| `folders.(parent_id, tenant_id) -> folders.(id, tenant_id)` (stated, self-referencing) | 24 | 6 | 24 | | | 0 | | | 100.0% | confirmed | two claims at 100% |
| `docs.owner_id -> people.id within org_id=org_id` | 400 | 0 | 380 | 20 | 0 | 0 | 0 | 0 | 95.0% | broken (cross) | 400/400, confirmed |
| `docs.owner_id -> guests.id within org_id=org_ref` (uuid against text) | 400 | 0 | 380 | 20 | 0 | 0 | 0 | 0 | 95.0% | broken, after one `::text` retry | 400/400, confirmed |
| `cards.board_id -> boards.id within ws_slug=ws_slug` | 600 | 0 | 570 | 30 | 0 | 0 | 0 | 0 | 95.0% | broken (cross) | 600/600, confirmed |
| `orders.customer_id -> customers.id within id=tenant_id` (a nonsense scope) | 1130 | 80 | 3 | 1077 | 0 | 50 | 0 | 0 | 0.3% | **rejected**, a "rejected scope" line, never a join | |

**Unique keys** (T8.2): `projects` `[["tenant_id", "id"]]`; `sites`
`[["code", "tenant_id"], ["id"]]`; `stock` `[["id"]]` (its INCLUDE index adds
no key); `labels` and `batches` none. **Dense integer keys** for the weighing
of `tasks_nv.project_id` (every single-column integer primary key holding rows
at `denseKeyShare` 0.9): 28 candidates, of which 27 hold 1 to 10 (`tenants`
does not).

**By tenant** (non-null rows, nulls apart). `orders`: tenant 1: 334, no
problem; tenant 2: 393, 60 cross; tenant 3: 373, 40 orphans; no single
tenant: 30 (20 unresolved, and the 10 orphans with no tenant). `invoices`: 1:
332; 2: 332; 3: 336, 5 cross. `docs -> people`: org 4: 100, 20 cross; orgs 1
to 3: 100 each, no problem. `cards` (by the row's `ws_slug`): 60 tenants;
`canary-pii-ws-1` 11 rows and 1 cross, `-32` to `-60` 10 rows and 1 cross
each, `-31` 9 rows, the other 29 10 rows each with no problem.

### 4.3 Database `partitions` (`test/fixtures/partitions.sql`, mounted `80-partitions.sql`)

Every plain table and every leaf is created `WITH (autovacuum_enabled = false)`
(a partitioned parent takes no storage parameter); the leaves of `events_p`,
`logs_p`, `ledger`, `ledger_t` and `swapped_p` also with `fillfactor = 10`, so
100 rows take 7 or 8 pages and a per-leaf sample is stable with few rows. Both
are omitted below for width except in the `\gexec` statements. The file is
complete as written; the numbers were validated on temporary tables (1.4).

```sql
CREATE DATABASE partitions;
\connect partitions
CREATE TABLE customers_p (id int PRIMARY KEY);
INSERT INTO customers_p SELECT generate_series(1, 10000);
CREATE TABLE accounts_l (id int PRIMARY KEY, tenant_id int NOT NULL);
INSERT INTO accounts_l SELECT i, 1 + (i - 1) / 250 FROM generate_series(1, 1000) i;          -- tenants 1 to 4
CREATE TABLE events_p (id int NOT NULL, day date NOT NULL, customer_id int, ref int, status text, PRIMARY KEY (id, day)) PARTITION BY RANGE (day);
SELECT format('CREATE TABLE %I PARTITION OF events_p FOR VALUES FROM (%L) TO (%L) WITH (fillfactor = 10, autovacuum_enabled = false)',
              'events_p_' || to_char(date '2025-01-01' + n, 'YYYYMMDD'), date '2025-01-01' + n, date '2025-01-01' + n + 1)
  FROM generate_series(0, 499) AS n \gexec
INSERT INTO events_p SELECT i, date '2025-01-01' + (i - 1) / 100, 1 + i % 10000,
       CASE WHEN i % 8 = 0 THEN 10000 + i ELSE 1 + i % 10000 END,                         -- 6,250 orphans, all above
       CASE WHEN (i - 1) / 100 >= 470 THEN 'refunded' ELSE (ARRAY['paid', 'open'])[1 + i % 2] END
  FROM generate_series(1, 50000) AS i;
CREATE TABLE logs_p (id int NOT NULL, day date NOT NULL, note text) PARTITION BY RANGE (day);
SELECT format('CREATE TABLE %I PARTITION OF logs_p FOR VALUES FROM (%L) TO (%L) WITH (fillfactor = 10, autovacuum_enabled = false)',
              'logs_p_' || to_char(date '2025-01-01' + n, 'YYYYMMDD'), date '2025-01-01' + n, date '2025-01-01' + n + 1)
  FROM generate_series(0, 499) AS n \gexec
INSERT INTO logs_p SELECT i, date '2025-01-01' + (i - 1) / 100, 'canary-pii log ' || i FROM generate_series(1, 50000) i;
CREATE TABLE ledger (id int, month date, tenant_id int NOT NULL, account_id int NOT NULL, PRIMARY KEY (id, month)) PARTITION BY RANGE (month);
SELECT format('CREATE TABLE %I PARTITION OF ledger FOR VALUES FROM (%L) TO (%L) WITH (fillfactor = 10, autovacuum_enabled = false)',
              'ledger_' || to_char(m, 'YYYY_MM'), m::date, (m + interval '1 month')::date)
  FROM generate_series(timestamp '2025-01-01', timestamp '2026-03-01', interval '1 month') AS m \gexec   -- 2026_01 .. 03 stay empty
INSERT INTO ledger SELECT i, date '2025-01-01' + ((i - 1) / 1000) * interval '1 month', 1 + i % 2,
       CASE WHEN (i - 1) / 1000 = 3 AND i % 1000 BETWEEN 253 AND 372 AND i % 2 = 1 THEN 1 + i % 250   -- April: 60 cross-tenant, tenant 2 -> 1
            WHEN (i - 1) / 1000 = 6 AND i % 1000 < 90 THEN 5001 + i                                    -- July: 90 orphans
            WHEN (i - 1) / 1000 = 9 AND i % 1000 < 150 THEN 5001 + i                                   -- October: 150 orphans
            ELSE 250 * (i % 2) + 1 + i % 250 END
  FROM generate_series(1, 12000) i;
CREATE TABLE ledger_t (id int, tenant_id int, account_id int) PARTITION BY LIST (tenant_id);
SELECT format('CREATE TABLE %I PARTITION OF ledger_t FOR VALUES IN (%s) WITH (fillfactor = 10, autovacuum_enabled = false)', 'ledger_t_' || t, t)
  FROM generate_series(1, 3) AS t \gexec
CREATE TABLE ledger_t_default PARTITION OF ledger_t DEFAULT WITH (fillfactor = 10, autovacuum_enabled = false);
INSERT INTO ledger_t SELECT i, CASE WHEN i <= 3000 THEN 1 + (i - 1) / 1000 ELSE 4 END,
       CASE WHEN i BETWEEN 1001 AND 1100 OR i BETWEEN 3101 AND 3150 THEN 5001 + i        -- 100 orphans in ledger_t_2, 50 in the DEFAULT
            WHEN i BETWEEN 2001 AND 2030 THEN 1 + i % 250                                -- 30 cross-tenant in ledger_t_3
            ELSE 250 * (CASE WHEN i <= 3000 THEN (i - 1) / 1000 ELSE 3 END) + 1 + i % 250 END
  FROM generate_series(1, 3200) i;
CREATE TABLE ledger_s (id int, year int, tenant_id int, account_id int) PARTITION BY RANGE (year);   -- sub-partitioned
CREATE TABLE ledger_s_2024 PARTITION OF ledger_s FOR VALUES FROM (2024) TO (2025) PARTITION BY LIST (tenant_id);
CREATE TABLE ledger_s_2024_t1 PARTITION OF ledger_s_2024 FOR VALUES IN (1);
CREATE TABLE ledger_s_2024_t2 PARTITION OF ledger_s_2024 FOR VALUES IN (2);
CREATE TABLE ledger_s_2025 PARTITION OF ledger_s FOR VALUES FROM (2025) TO (2026);
INSERT INTO ledger_s SELECT i, 2024 + (i - 1) / 200, 1 + i % 2,
       CASE WHEN i <= 40 AND i % 2 = 1 THEN 5001 + i ELSE 250 * (i % 2) + 1 + i % 250 END   -- 20 orphans, all in ledger_s_2024_t2
  FROM generate_series(1, 300) i;
CREATE TABLE swapped_p (a int NOT NULL, b int) PARTITION BY LIST (a);
CREATE TABLE swapped_p_1 (b int, a int NOT NULL) WITH (fillfactor = 10, autovacuum_enabled = false);   -- its columns in another order
ALTER TABLE swapped_p ATTACH PARTITION swapped_p_1 FOR VALUES IN (1);
CREATE TABLE swapped_p_2 PARTITION OF swapped_p FOR VALUES IN (2) WITH (fillfactor = 10, autovacuum_enabled = false);
INSERT INTO swapped_p (a, b) SELECT 1 + i % 2, CASE WHEN i % 10 = 1 THEN 20000 + i ELSE 1 + i % 10000 END
  FROM generate_series(1, 6000) i;                                                        -- 600 orphans, all in swapped_p_2
CREATE TABLE accounts_h (id int PRIMARY KEY) PARTITION BY HASH (id);
SELECT format('CREATE TABLE %I PARTITION OF accounts_h FOR VALUES WITH (MODULUS 4, REMAINDER %s) WITH (autovacuum_enabled = false)', 'accounts_h_' || r, r)
  FROM generate_series(0, 3) AS r \gexec
INSERT INTO accounts_h SELECT generate_series(1, 1000);
CREATE TABLE subscriptions (id int PRIMARY KEY, account_id int REFERENCES accounts_h);
INSERT INTO subscriptions SELECT i, 1 + (i - 1) * 2 FROM generate_series(1, 500) i;
CREATE TABLE users_h64 (id int PRIMARY KEY) PARTITION BY HASH (id);
SELECT format('CREATE TABLE %I PARTITION OF users_h64 FOR VALUES WITH (MODULUS 64, REMAINDER %s) WITH (autovacuum_enabled = false)', 'users_h64_' || r, r)
  FROM generate_series(0, 63) AS r \gexec
INSERT INTO users_h64 SELECT generate_series(1, 640);
CREATE TABLE logins (id int PRIMARY KEY, user_id int REFERENCES users_h64);
CREATE TABLE carts (id int PRIMARY KEY, user_id int REFERENCES users_h64);
CREATE TABLE reviews (id int PRIMARY KEY, user_id int REFERENCES users_h64);
INSERT INTO logins SELECT i, 1 + (i - 1) * 6 FROM generate_series(1, 100) i;           -- and the same rows into carts and reviews
CREATE TABLE pinned (id int PRIMARY KEY, account_id int REFERENCES accounts_h_0 (id));  -- an FK declared to one partition
INSERT INTO pinned SELECT row_number() OVER (ORDER BY id), id FROM (SELECT id FROM accounts_h_0 ORDER BY id LIMIT 10) s;
CREATE TABLE payments_p (id int, paid_on date, account_id int REFERENCES accounts_l, other_id int) PARTITION BY RANGE (paid_on);
CREATE TABLE payments_p_2025 PARTITION OF payments_p FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE payments_p_2026 PARTITION OF payments_p FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
ALTER TABLE payments_p_2026 ADD FOREIGN KEY (other_id) REFERENCES accounts_l;           -- a leaf's own FK
INSERT INTO payments_p SELECT i, date '2025-01-01' + 30 * i, 1 + i, 1 + i FROM generate_series(1, 20) i;
CREATE TABLE ledger_lines (id int, month date, ledger_id int, PRIMARY KEY (id, month),
                           FOREIGN KEY (ledger_id, month) REFERENCES ledger (id, month)) PARTITION BY RANGE (month);   -- partitioned to partitioned
CREATE TABLE ledger_lines_2025_h1 PARTITION OF ledger_lines FOR VALUES FROM ('2025-01-01') TO ('2025-07-01');
CREATE TABLE ledger_lines_2025_h2 PARTITION OF ledger_lines FOR VALUES FROM ('2025-07-01') TO ('2026-01-01');
INSERT INTO ledger_lines SELECT i, date '2025-01-01' + ((i - 1) / 100) * interval '1 month', 1000 * ((i - 1) / 100) + 1 + (i - 1) % 100
  FROM generate_series(1, 1200) i;
CREATE TABLE orders_p (id int, created date, tenant_id int, PRIMARY KEY (id, created)) PARTITION BY RANGE (created);   -- a partitioned parent in a walk
SELECT format('CREATE TABLE %I PARTITION OF orders_p FOR VALUES FROM (%L) TO (%L) WITH (autovacuum_enabled = false)',
              'orders_p_' || to_char(m, 'YYYY_MM'), m::date, (m + interval '1 month')::date)
  FROM generate_series(timestamp '2025-01-01', timestamp '2025-12-01', interval '1 month') AS m \gexec
INSERT INTO orders_p SELECT i, date '2025-01-01' + ((i - 1) / 100) * interval '1 month', 1 + i % 2 FROM generate_series(1, 1200) i;
CREATE TABLE order_items_p (id int PRIMARY KEY, order_id int, account_id int);
INSERT INTO order_items_p SELECT i, i, 250 * ((CASE WHEN i > 570 THEN i + 1 ELSE i END) % 2) + 1 + i % 250
  FROM generate_series(1, 600) i;                                                         -- 30 cross-tenant through the order
SELECT format('ANALYZE %I', c.relname) FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname NOT LIKE 'logs\_p%' \gexec   -- plain tables and leaves; never a parent, nothing of logs_p
CREATE ROLE parent_only LOGIN PASSWORD 'parent_only';                                    -- reads the parent and none of its leaves
GRANT USAGE ON SCHEMA public TO parent_only;
GRANT SELECT ON events_p, customers_p TO parent_only;
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
```

| Table | Expected |
|---|---|
| `events_p` | 500 leaves of 100 rows (7 pages each, 3,530 pages), leaves analyzed. **Precondition** (every matrix cell): `SELECT count(*) FROM events_p TABLESAMPLE SYSTEM (4) REPEATABLE (1)` is 0. **At `--sample-rows 2000`:** the source holds 500 to 3,000 rows from at least 40 leaves whose days reach both 2025 and 2026 (this plan measured 1,845 rows from 97 leaves); `events_p.ref -> customers_p.id` broken at **87.5% +- 3 points** (measured 87.37%), orphans all above; `events_p.customer_id -> customers_p.id` confirmed 100%; a run with `eventsClaims` exits 2; `day` hidden, years [2025, 2026], not categorical; `status` values include `refunded`. **0.4.2:** both joins `empty` ("no non-null rows to test"), the run exits 0, `day` listed as the 20 values 2025-01-01 to 2025-01-20, no `refunded`. |
| `logs_p` | 500 leaves x 100 rows, 8 pages each (4,000), never analyzed. **Precondition:** the parent-seeded pilot at 2.5% (`pilotPages` 100 over 4,000 pages) counts 0. **Required:** estimate within 20% of 50,000, source `pilot` (this plan measured 51,400 from 1,285 rows over 273 arms). **0.4.2:** "size unknown". |
| `ledger` | 12 leaves of 1,000 rows (56 pages each) and three empty. Unscoped `ledger.account_id -> accounts_l.id`: 11,760/12,000 = **98.0%, confirmed**, orphansAbove 240 (the thread's "mildly degraded number"); by partition October 150 and July 90 of 1,000, 10 others none, 3 hold no rows. Scoped `within tenant_id=tenant_id`: hits 11,700, cross 60, orphans 240, 97.5%, broken; the three where-lines of 3.14: cells October/1 75, October/2 75, April/2 60 cross, July/1 45, July/2 45 of 500 each, 19 others none; by tenant 2 180 (60 cross) and 1 120 of 6,000. **At `--sample-rows 1200`:** 12 arms at 10%, 1,378 rows, every leaf a group with at least 54 rows (this plan measured on 16: October 18 orphans of 108, July 18 of 144, April 9 cross of 162, in block 18). **0.4.2:** 98.0% confirmed, no place. |
| `ledger_t` | LIST by tenant: `ledger_t_1` to `_3` of 1,000 rows and `ledger_t_default` of 200 (tenant 4). Unscoped: 3,050/3,200 = 95.3%, confirmed; by partition `ledger_t_2` 100 of 1,000, `ledger_t_default` 50 of 200, 2 others none. Scoped: hits 3,020, cross 30, orphans 150, 94.4%, broken; by partition and by tenant the same three problem groups with the same counts, in the same order (`ledger_t_2` / tenant 2 100, `ledger_t_default` / tenant 4 50, `ledger_t_3` / tenant 3 30 cross), 1 other none of 1,000. |
| `ledger_s` | Sub-partitioned: leaves `ledger_s_2024_t1`, `ledger_s_2024_t2`, `ledger_s_2025` of 100 rows. Unscoped: 280/300 = 93.3%, broken; by partition `ledger_s_2024_t2: 20 of 100 (20.0%)`, 2 others none; `ledger_s_2024` is no group. |
| `swapped_p` | **Precondition:** the leaves' `attnum` orders differ, and every orphan is in `swapped_p_2`, the leaf that sorts after the swapped one. Whole table 5,400/6,000 = 90.0%. At `--sample-rows 1000`: `swapped_p.b -> customers_p.id` within 3 points of 90.0% (this plan measured 1,056 rows, 91.1%); the same arms written `SELECT *` read 100%, since a union takes the first arm's column order and reads `swapped_p_2`'s `a`, always 2, as `b`. |
| `order_items_p` -> `orders_p` | `order_items_p.account_id -> accounts_l.id within (order_id->orders_p.id).tenant_id=tenant_id`: 600, hits 570, cross 30, 95.0%, broken. The hop on `orders_p.id` is keyed by 3.6 (b) and probes all 12 leaves per row. |
| `accounts_h (id int PRIMARY KEY)` HASH 4; `subscriptions` | 1,000 / 500. 1 FK entry. **0.4.2: 5.** |
| `users_h64` HASH 64; `logins`, `carts`, `reviews` | 640 / 100 each. 1 FK entry each. **0.4.2: 65 each.** |
| `pinned` | 10 rows, account ids 1, 12, 14, 16, 17, 26, 28, 30, 32, 34 of `accounts_h_0`. The FK declared to one partition is kept; its stated claim is `unverifiable`, "unknown table accounts_h_0" (known limit). |
| `payments_p` | 12 rows in `payments_p_2025`, 8 in `payments_p_2026`. `withLocalForeignKeys` 1, as in 0.4.2. |
| `ledger_lines` | 1,200 rows. One FK entry `{columns: ["ledger_id", "month"], refTable: "ledger", refColumns: ["id", "month"]}`, where `pg_constraint` holds 18 `'f'` rows: 16 on `ledger_lines` (its own and one clone per leaf of `ledger`, the three empty ones included) and one clone on each of its two leaves, 1 with `conparentid = 0`. The stated tuple: 1,200/1,200, confirmed. **0.4.2:** recorded at T8.1. |

About 1,150 relations load here; T8.1 records the load time per CI cell.

### 4.4 Templates and copies

- `template.sql`, after the `fixture_template` line (so `ci.test.ts:37`
  still matches it right after `\connect postgres`):
  `CREATE DATABASE tenancy_template TEMPLATE tenancy IS_TEMPLATE true ALLOW_CONNECTIONS false;`
  and the same for `partitions_template`.
- `test/copies.ts` gains `copyOf(t, template)`; `copyOfFixture(t)` stays, as
  `copyOf(t, "fixture_template")`, so no caller changes. A missing template
  gives the existing "recreate the fixture databases with docker compose down -v && docker compose up -d --wait".

### 4.5 Throwaway scenarios (copies of `tenancy_template` unless named)

Each: full offline run with the canned claims, then the change, then `check`.

1. **Cross-tenant appears.** Before the run, `UPDATE invoices SET tenant_id = 1 + (id - 1) % 3, customer_id = 100 * ((id - 1) % 3) + 1 + ((id - 1) / 3) % 100 WHERE id > 995`
   (cross 0). Then `UPDATE invoices SET tenant_id = 3, customer_id = id - 995 WHERE id > 995`:
   **regression**, exit 2, the stderr lines of 3.14.
2. **Cross-tenant grows.** On the original data (5 cross, broken 99.5%):
   `UPDATE invoices SET tenant_id = 3, customer_id = id - 975 WHERE id BETWEEN 976 AND 990`
   (20 cross, 2.0%): **regression** although the status stays broken. With
   `WHERE id BETWEEN 986 AND 990` instead (10 cross, 1.0%) the share grows by
   0.5 point, under the tolerance, and the claim is `unchanged`.
3. **Cross-tenant fixed.** `UPDATE orders SET customer_id = 100 + (id - 1000) WHERE id BETWEEN 1001 AND 1060`:
   hit 93.8%, still broken (orphans and rows with no tenant), cross 60 -> 0:
   **improved**, exit 0; exit 2 under `--fail-on change`.
4. **A scope column dropped.** `ALTER TABLE orders DROP COLUMN tenant_id`: the
   scoped `orders` claim is **stale**, exit 2 (T8.6); the `order_items` walk
   is stale too (T8.7 extends the assertion, named under R11).
5. **A composite key broken.** `ALTER TABLE stock DROP CONSTRAINT stock_region_code_fkey; DELETE FROM warehouses WHERE region = 'eu' AND code = 3`:
   the tuple goes 300/300 -> 270/300 = 90.0%, **regression**, exit 2.
   **0.4.2:** both single-column `stock` claims unchanged (310/310, 300/300),
   the note "the schema changed since the snapshot", exit 0.
6. **R4.** `ALTER TABLE orders RENAME COLUMN tenant_id TO x7; ALTER TABLE customers RENAME COLUMN tenant_id TO x7`,
   and the claim written with `x7`: identical numbers.
7. **Cross-tenant through a parent.** `UPDATE order_items SET product_id = 100 + id WHERE id <= 20`
   (items of tenant-1 orders moved to tenant-2 products; cross 120 -> 140,
   share 6.1% -> 7.1%): **regression**, exit 2.
8. **A hostile snapshot** on the unchanged copy: a claim whose hop table is
   `orders"; DROP TABLE customers; --`, one whose `within.column` is
   `tenant_id" = 1 OR true; --`, and one with a 13-step path: each stale or
   `unverifiable` with no statement naming it; the run finishes in seconds and
   `customers` still exists.
9. **A rejected scope grows.** With the nonsense scope in the snapshot
   (rejected, 1,077 cross of 1,130, 95.3%):
   `INSERT INTO orders SELECT i, 1, 1 + (i - 1211) % 100 FROM generate_series(1211, 1610) i`
   (400 same-tenant orders). The nonsense scope's cross share goes to 1,477 of
   1,530 (96.5%), up 1.2 points, more than the tolerance: **unchanged**
   (rejected -> rejected; its hit moves 0.27% -> 0.20%). In the same run the
   scoped `orders` claim reads broken 88.5% -> 91.5% with its cross share
   falling 5.3% -> 3.9%: drift. Exit 0 under the default `--fail-on`.
10. **A sampled count that moves with the sample** (a copy of
    `partitions_template`, `--sample-rows 1200`, the scoped `ledger` claim).
    Before the run: `INSERT INTO ledger SELECT i, date '2025-12-01', 1 + i % 2, 250 * (i % 2) + 1 + i % 250 FROM generate_series(12001, 13200) i; ANALYZE ledger_2025_12`
    (estimate 13,200, 9.091% per arm; on Postgres 16 no cross-tenant row of
    April is sampled, and the claim reads confirmed). Then
    `DELETE FROM ledger WHERE id > 12000; VACUUM ANALYZE ledger_2025_12`
    (estimate 12,000, 10%; April's block 18 and its 9 cross-tenant rows are
    sampled): **regression**, exit 2, on a change that touched no row of April,
    and the where-line names `ledger_2025_04`. The test asserts, on every
    server, the class that its two sampled counts imply (0 -> above 0 is a
    regression), and on 16 the counts 0 and 9. A known limit (3.12).

### 4.6 Canned claims (`test/canned.ts`)

Written with the 0.5 keys; they parse from the task that introduces each key,
and until then serve only the 0.4.2 baseline, which drops them.

- **`tenancyClaims`** (17), basis inferred unless stated: the scoped `orders`
  claim and its unscoped twin; the scoped `invoices` and `quotes`; the
  `order_items` walk and its unscoped twin; the hop `order_items.order_id -> orders.id`;
  the `order_lines` walk; the `task_notes` walk; the tuples of `tasks`,
  `tasks_nv` and `stock` (stated); the scoped `tasks_nv` single and the
  unscoped one; `docs -> people`, `docs -> guests` and `cards`. Statuses: 7
  confirmed (1 on weak evidence), 10 broken of which 8 cross-tenant.
- **`scopeClaims`**: `tenancyClaims` without the three walks (14), the set of
  T8.6, which runs before paths exist: 7 confirmed (1 on weak evidence), 7
  broken of which 6 cross-tenant. A `within.path` in a claim before T8.7 would
  be dropped by the non-strict object (3.3), so no T8.6 test reads a walk.
- **`edgeClaims`** (test-only, outside the summary): `tags` (shared rows
  only), `attachments` (a scope with `when`), the tuples of `visits`, `picks`
  and `folders` (stated), `activity` (a path with `when`), `categories` (a
  path through the same table twice), `batch_items` (a grouped hop with a dead
  branch), `refunds` (a path on the target side), the self-walk (PW4) and the
  nonsense scope. Each task uses the ones its edge cases name.
- **`eventsClaims`**: `events_p.ref -> customers_p.id` and
  `events_p.customer_id -> customers_p.id`.
- **`partitionsClaims`**: `eventsClaims`; `ledger` unscoped and scoped;
  `ledger_t` unscoped and scoped; `ledger_s` unscoped; `swapped_p.b -> customers_p.id`;
  the `order_items_p` walk; the stated FKs of `subscriptions`, `logins`,
  `carts`, `reviews`, `pinned` and `ledger_lines`.
- **`echoForeignKeys`** (T8.5): a transport that answers prompt A with one
  stated claim per declared FK constraint in the request, as the audit's
  driver did.

### 4.7 The 0.4.2 baseline and the committed snapshots (T8.1)

1. `git worktree add ../dbtruth-042 v0.4.2`, then `npm ci` there.
2. A scratch driver in that worktree (not committed) calls its `run()` with
   `fakeModel(<claims>)` against each database; the claim sets are exported
   from this repository's `test/canned.ts` as JSON. For the declared keys it
   also runs one stated claim per FK entry of 0.4.2's own extract: the
   flattened halves of every composite key, and on `partitions` one entry per
   referenced leaf.
3. Every "0.4.2:" value of sections 4.2, 4.3 and 4.5 goes into PROGRESS.md
   with the command.
4. Committed, as the compatibility baseline, under
   `test/fixtures/snapshots/0.4.2/`:
   - `fixture.json` (the canned claims of `test/canned.ts`), `clean.json` (no
     claims), `polymorph.json` (its canned claims), `sampling.json` (claims
     whose numbers depend on the pages sampled over `ev`:
     `inconsistent_values` on `ev.kind` and `ev.id -> analyzed.id`);
   - `tenancy.json`: `tenancyClaims` and `edgeClaims` as 0.4.2 reads them
     (without `also` and `within`), plus one stated claim per FK entry of
     0.4.2's extract, so the flattened halves of `tasks`, `tasks_nv`, `stock`,
     `visits`, `picks` and `folders` are in it;
   - `partitions.json`, at `--sample-rows 2000`: `partitionsClaims` as 0.4.2
     reads them, plus one stated claim per FK entry of 0.4.2's extract (5 for
     `subscriptions`, 65 each for `logins`, `carts` and `reviews`, and the
     entries of `ledger_lines`);
   - `fixture.request.json`: the user message of the prompt A request 0.4.2
     sends on `fixture` (the extract JSON). The system prompt is not kept: T8.5
     to T8.7 change it on purpose.
5. Committed under `test/fixtures/snapshots/live/`: `fixture-r4c.json` and
   `pagila-pagila2.json`, the `context/snapshot.json` of the recorded live runs
   in `../dbtruth-live/r4c` (12 verdicts) and `../dbtruth-live/pagila2` (29).
   Only those two files are read from `dbtruth-live`; never a `.env` there.
6. NOTES records the commands.

`compat.test.ts` (T8.3, then every task) checks each committed 0.4.2 snapshot
with this build on its unchanged database, and asserts:

- every snapshot: exit 0 under the default `--fail-on`, no `regression` and
  no `stale` item, and from T8.4 on the one settings note
  `sampleMaxLeaves 0 (this run 256)`;
- `fixture`, `clean`, `polymorph`, `sampling` and `tenancy`: no `drift`,
  `changed` or `not measured` item either, identical statuses and hit rates,
  and the fingerprint 0.4.2 wrote (no "schema changed" note). On `tenancy`
  that is D6: the flattened halves of the composite keys stay single-column
  claims, measured with 0.4.2's statements;
- `partitions`: the "schema changed" note (its FK entries to `accounts_h`,
  `users_h64` and `ledger` are one each now; T8.2); the `events_p` joins,
  empty in 0.4.2 from an empty sample, read `not measured` with `EMPTY_SAMPLE`
  (T8.4); the phantom claims to `accounts_h_0` .. `_3`, `users_h64_0` .. `_63`
  and the leaves of `ledger` stay `unchanged` (they named tables the snapshot's
  schema never listed); every other claim unchanged with its hit rate;
- the live `fixture-r4c` claims, run offline with `fakeModel` and the
  snapshot's `measuredWith`, reproduce its 12 statuses and numbers.

Each row of the upgrade table of T8.10 is one of these assertions.

### 4.8 Opt-in scale databases (manual, never in CI; numbers into NOTES and `acceptance/manual.json`)

`scripts/scale/*.sql` build each database from nothing; `scripts/scale/run.mjs`
runs the canned claims of each with no model, first with 0.4.2 from the
`../dbtruth-042` worktree and then with this build, on the same machine and
server in one session, after one warm-up run, recording per-statement time
and peak RSS. Every table is analyzed after its load, autovacuum is left at
its default, and only the indexes named exist.

- **`pr_parts`** (the audit's replica, rebuilt from this description):
  `customers_p` 100,000 ids; `events_p` as in 4.3 with 10,000 rows per daily
  leaf (5,000,000 rows: `i` 1 to 5,000,000, day `(i - 1) / 10000`, `ref` an
  orphan above when `i % 8 = 0`, `status` `refunded` in the last 30 days),
  default fillfactor (the audit measured 72 to 84 pages per leaf), leaves
  analyzed and the parent never; `logs_p` 500 leaves of 4,000 rows, never
  analyzed. Default settings, `eventsClaims`.
  **0.4.2:** joins "empty", exit 0, `logs_p` size unknown, `day` as 5 values,
  no `refunded`. **Required:** `ref` broken at 87.5% +- 1, exit 2; `logs_p`
  within 20% of 2,000,000; `refunded` listed; `day` hidden; the full offline
  run at most twice 0.4.2's time and under 60 s; the snapshot's size and its
  largest stored query recorded.
- **`tenancy_big`**, 1,000 tenants:
  - `customers (id bigint PRIMARY KEY, tenant_id int NOT NULL)`, 5,000,000,
    tenant `1 + (id - 1) % 1000`;
  - `orders (id bigint PRIMARY KEY, tenant_id int, customer_id bigint)`,
    20,000,000, tenant `1 + (id - 1) % 1000`, `customer_id` the same tenant's
    `1000 * ((id - 1) / 1000 % 5000) + 1 + (id - 1) % 1000`, except
    `id % 10000 = 0`: that value minus 1 (the previous tenant: 2,000
    cross-tenant rows), `id % 10000 = 5000`: `5000000 + id` (2,000 orphans),
    `id % 200 = 7`: NULL;
  - `products (id bigint PRIMARY KEY, tenant_id int)`, 1,000,000, tenant
    `1 + (id - 1) % 1000`; `order_items (id bigint PRIMARY KEY, order_id bigint, product_id bigint)`,
    16,000,000, `order_id = id`, `product_id` the order's tenant's
    `1000 * ((id - 1) / 1000 % 1000) + 1 + (id - 1) % 1000`, minus 1 when
    `id % 10000 = 0`;
  - `accounts (id int PRIMARY KEY, tenant_id int NOT NULL)` 100,000, tenant
    `1 + (id - 1) % 1000`; `purchase_orders (id bigint PRIMARY KEY, account_id int)`
    2,000,000, `account_id = 1 + (id - 1) % 100000`; `skus (id bigint PRIMARY KEY, tenant_id int NOT NULL)`
    1,000,000, tenant `1 + (id - 1) % 1000`; `order_lines (id bigint PRIMARY KEY, purchase_order_id bigint, sku_id bigint)`
    10,000,000, `purchase_order_id = 1 + (id - 1) % 2000000`, `sku_id` that
    account's tenant's `1000 * ((id - 1) / 1000 % 1000) + 1 + ((id - 1) % 2000000) % 1000`;
  - `projects (tenant_id int, id int, PRIMARY KEY (tenant_id, id))`, 1,000
    ids in each tenant, no index on `id` alone; `project_members (id bigint PRIMARY KEY, tenant_id int)`
    1,000,000; `task_notes (id bigint PRIMARY KEY, project_id int, author_id bigint)`
    2,000,000, `project_id = 1 + (id - 1) % 1000`, `author_id = 1 + (id - 1) % 1000000`;
  - `orders_p24` and `orders_p500 (id bigint, created date, tenant_id int, PRIMARY KEY (id, created))`,
    the 20,000,000 rows of `orders` again, RANGE by month (24 leaves) and by
    day (500 leaves).

  Claims, each with its form (3.5, 3.6), at default settings:

  | # | Claim | Form | Required |
  |---|---|---|---|
  | 1 | `orders.customer_id -> customers.id within tenant_id=tenant_id` | path 0; found and same keyed on `customers` | under 5 s |
  | 2 | `order_items.product_id -> products.id within (order_id->orders.id).tenant_id=tenant_id` | 1 hop, probe | under 5 s |
  | 3 | `order_lines.sku_id -> skus.id within (purchase_order_id->purchase_orders.id, account_id->accounts.id).tenant_id=tenant_id` | 2 hops, probe | under 5 s |
  | 4 | `task_notes.author_id -> project_members.id within (project_id->projects.id).tenant_id=tenant_id` | grouped hop, restricted to the sampled links (D17) | under 5 s |
  | 5 | `orders.customer_id -> customers.id` | 0.4.2's statement | within 20% of 0.4.2 (the audit: 2.5 s) |
  | 6 | claim 2 through `orders_p24` | keyed hop into 24 leaves | finishes; time recorded |
  | 7 | claim 2 through `orders_p500` | keyed hop into 500 leaves | finishes or ends `unverifiable` with the statement timeout's words; which one is recorded, and the README limit states it |

  Under 5 s is a 2x margin under the 10 s statement timeout; claims 1 to 4 do
  not pass by timing out. Every number equals a hand rerun of its stored
  query; nothing hangs. `describe_table orders` over MCP: time recorded
  against 0.4.2 (the audit: 0.9 s).
- **`wide`**: 1,000 tables in the shape of `test/fixtures/scale.sql` (which
  has 300), for `check` over 1,000 tables.
- **Pagila** (release acceptance, BUILD_PLAN 5.5): the public Pagila schema and
  data loaded into a database `pagila` on the fixture server by
  `scripts/scale/pagila.sh`. The claims of `pagila-pagila2.json`, run offline,
  reproduce its 29 verdicts except the named `basis` and note changes;
  `check` of that snapshot exits 0; `withLocalForeignKeys` unchanged.
- **Baselines**, 0.5 within 20% of 0.4.2 measured in the same session (the
  audit's numbers in brackets, for reference only): `doctor` (0.87 to 3.3 s);
  the catalog read of 1,000 partitions (0.25 to 0.31 s); the full run without
  the model on `fixture` (0.3 s), Pagila (5.9 s) and `scale` (5.4 s); `check`
  on `fixture` (1.0 s), Pagila (6.3 s), `scale` (6.7 s) and `wide` (28 s);
  `measure_join` on `fixture` (55 ms) and Pagila (1.1 to 1.9 s);
  `describe_table` on the 20M-row `orders` (0.9 s); the profile's
  `TABLESAMPLE` read per plain table (0.5 to 1.0 s; on a partitioned table it
  is a per-leaf union now, held to `pr_parts`' own limit instead); the budget
  overshoot at most one statement timeout, and a timed-out statement stops at
  10.0 to 10.3 s; peak RSS (61 to 126 MB) at most 0.4.2's plus 20%.

### 4.9 Standing assertions for every new output

BUILD_PLAN 5.3 applies to every new output: the files, the snapshot, the check
report, the PR comment, the MCP answers, and the prompt A and B requests.

- **Canary sources:** `customers.name` and `products.name` (`canary-pii`),
  `logs_p.note`, every `canary-pii-ws-*` slug, and the four org uuids
  (`md5('org-1')::uuid` .. `md5('org-4')::uuid`), which appear in no output.
  A leaf's name is a catalog name, shown where a table's name would be (R3
  row of 3.1), and is no canary.
- **`reader`:** each new fixture file ends by granting the `reader` role
  (created by `seed.sql`, which runs first) `USAGE` on `public` and `SELECT` on
  every table, leaves included; every new test that measures also runs as
  `reader`.
- **Time:** a full offline run on `tenancy` under 5 s; on `partitions` under
  20 s; `check` on `tenancy` under 5 s.

---

## 5. Tasks

Overview:

| Id | Task | Priority |
|---|---|---|
| T8.1 | Harness, fixtures, oracles and the 0.4.2 baseline | P0 |
| T8.2 | Keys as the catalog declares them: one per constraint, none per partition, unique keys read | P0 |
| T8.3 | Snapshot format 2 and the compatibility guarantee | P0 |
| T8.4 | Partitioned tables sampled per leaf, and no empty from an empty sample | P0 |
| T8.5 | Composite keys measured whole | P0 |
| T8.6 | Joins within a tenant, path of length zero | P0 |
| T8.7 | The parent walk | P0 |
| T8.8 | Where the problems live: by tenant and partition | P0 |
| T8.9 | Measured at scale | P0 |
| T8.10 | What a user reads: README, upgrade guide, skill, CHANGELOG | P0 |
| T8.11 | The Action: default version and a cross-tenant case | P0 |
| T8.12 | A Claude Code backend for the full run's model calls | P1 |
| T8.13 | Release 0.5.0 | P0 |

**Order, dependencies and effort** (about 17 working days, 15.5 without
T8.12):

1. T8.1 (2 d), nothing before it: two fixtures of about 1,150 relations, some
   70 oracle constants on four Postgres versions, the 0.4.2 baseline over
   every scenario of 4.5, six committed snapshots and two live ones.
2. T8.2 (0.5 d), then T8.3 (0.5 d): the compatibility assertions T8.3
   writes include T8.2's one-time "schema changed" on `partitions`.
3. T8.4 (2 d), after T8.3. It fixes a P0 blocker on its own, and it changes
   the source text that later statement-shape tests pin, so it lands before
   the new claim shapes.
4. T8.5 (1.5 d), after T8.2 and T8.3. It creates `src/join.ts`.
5. T8.6 (2.5 d), after T8.5: the scope reuses the tuple lookups and adds the
   resolution interface.
6. T8.7 (2 d), after T8.6: it adds hops on either side behind that
   interface, nothing else.
7. T8.8 (2 d), after T8.4 and T8.7: the partition dimension needs the
   leaves, the tenant dimension the resolved scope.
8. T8.9 (1 d, manual), after T8.8: the scale scripts and every manual run of
   4.8.
9. T8.10 (0.5 d), after T8.2 to T8.8.
10. T8.11 (0.5 d plus HUMAN), after T8.10.
11. T8.12 (1.5 d plus one HUMAN run), after T8.11. It touches `model.ts`,
    `doctor.ts`, the model part of `cli.ts` and the README's step 1, which no
    tenant task changes, so a slip in it holds up nothing but itself.
12. T8.13 (0.5 d plus HUMAN), last.

A P0 task that goes BLOCKED stops the release; later tasks continue only when
they do not depend on it (BUILD_PLAN 4.6). Only the maintainer may take a task
out of 0.5.0, by the `deferred` priority of section 0.

---

### Phase 8: tenant-safe joins

#### T8.1 Harness, fixtures, oracles and the 0.4.2 baseline (P0)

**Why.** Every later task asserts exact numbers. If the data, its ground truth
and 0.4.2's behavior on it are not pinned first, a bug in the data cannot be
told from a bug in the code. And the harness reads its task list from
`BUILD_PLAN.md` only (`scripts/acceptance.mjs:125-129`): without this task no
T8 id counts toward the score, and a release could print 100 with Phase 8
unfinished.

**Build.**
- `scripts/acceptance.mjs` `planTasks(root)`: the overview rows of
  `BUILD_PLAN.md`, then of `BUILD_PLAN_0.5.md` when it exists, with the same
  row pattern and the same exclusion of a priority of exactly `HUMAN`, and
  also leaving out a row whose priority starts with `deferred` (section 0,
  item 3). An id in both files stops the harness with a sentence naming it.
  The root is a parameter, so a test can hand it a temporary directory.
- `CLAUDE.md`: the line at the top of this file. `PROGRESS.md`: a "Phase 8"
  heading.
- The fixtures of 4.2 and 4.3, each with a header comment listing every
  deliberate problem and its counts; mounts `70-tenancy.sql` and
  `80-partitions.sql`; the templates and `copyOf` of 4.4; the `reader` grants
  of 4.9 at the end of each file; `ci.test.ts` expects the new mounts and
  template lines.
- `test/canned.ts`: the claim sets of 4.6.
- `test/fixtures.test.ts`: every constant of 4.2 and 4.3 from an oracle, and
  the preconditions. An oracle counts over the whole table, never with
  dbtruth's statement; a row's tenant set is an array from a correlated
  subquery. Example, `crossTenant` on `orders`:

  ```sql
  SELECT count(*) FROM orders o
   WHERE o.customer_id IS NOT NULL AND o.tenant_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id)
     AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.tenant_id = o.tenant_id)
     AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.tenant_id IS NULL)
  ```

  Preconditions, asserted on every matrix cell: the parent-seeded samples of
  4.3 count 0; `pg_constraint` holds 5 `'f'` rows for `subscriptions`, 65
  each for `logins`, `carts` and `reviews`, and 18 for the FK of
  `ledger_lines` (a version that clones otherwise names itself here, and the
  0.4.2 values of 4.3 are recorded per version); `tasks_nv`'s FK has
  `convalidated = false`; `swapped_p_1`'s `attnum` order differs from its
  parent's; `cards.ws_slug` has 60 distinct values; autovacuum is off on every
  table and leaf.
- The baseline and the committed snapshots of 4.7.
- `package.json`: `fixtures.test.ts` in `test:db`.

**Edge cases.** A developer's Docker volume without the new databases (the
recreate sentence). A future Postgres whose `SYSTEM` hash no longer empties the
parent-seeded sample: the precondition test names the version and the task
goes BLOCKED with the evidence. Postgres 12 has no `DROP DATABASE ... FORCE`
(`copies.ts` already copes). Fixture load time across the eight CI cells.

**Tests.**
- `acceptance.test.ts`, each over plan files written to a temporary
  directory: "the task list is the overview rows of BUILD_PLAN.md, then of
  BUILD_PLAN_0.5.md when it exists"; "a task id in both plans stops the
  harness and names it"; "a task whose priority starts with deferred is left
  out of the overall score, and a HUMAN one still is".
- `fixtures.test.ts`: "every tenancy number of the plan equals its oracle";
  "every partitions number of the plan equals its oracle"; "the 0.4 sample
  reads no row of events_p at 4% or of logs_p at the pilot's share, on this
  server"; one test per remaining precondition.
- `ci.test.ts`: every fixture mounted, the templates last.
- A copy of each new template made while another test file holds sessions,
  then dropped.

**Acceptance.**
- A1 The three `acceptance.test.ts` tests above pass: the task list reads
  both plans, refuses an id in both, and leaves out deferred and HUMAN rows.
  (`--task` scores whatever id it is given without reading a plan, 1.5 item
  14, and running the whole harness inside one of its own checks would
  recurse, so neither is the check.)
- A2 Both fixtures load on Postgres 12, 14, 16 and 18, and every oracle equals
  its constant.
- A3 Every precondition holds on every matrix cell.
- A4 Copies of `tenancy_template` and `partitions_template` work in parallel
  with other test files.
- A5 Manual: 0.4.2's value for every "0.4.2:" number is in PROGRESS.md with its
  command, and the snapshots of 4.7 are committed.
- A6 The CI fixture-load step stays under 60 s per cell (recorded in NOTES).
- A7 Each new test file is in exactly one of `test:unit` and `test:db`.

**Sabotage.** Change the 60 cross-tenant orders to 59: the oracle test names
the count. Make `planTasks` read only `BUILD_PLAN.md`: the first acceptance
test fails naming T8.1. Drop the `deferred` rule: the third fails with the
deferred task in the list.

**Docs.** NOTES "The 0.5 fixtures": what each database holds, why fillfactor
10, why no uuid or text tenant column is a declared key. README "Development":
the two databases. Troubleshooting: the recreate sentence covers them.

---

#### T8.2 Keys as the catalog declares them: one per constraint, none per partition, unique keys read (P0)

**Why.**
- Audit P1 12: an FK to a partitioned table is listed once per partition (5
  entries for one FK to a 4-way hash table; 195 for three FKs to a 64-way one,
  68.2% of prompt A, 196 "unverifiable" claims, phantom targets in
  `describe_table`).
- Audit P0 5, first half: `extract.ts:324` splits a composite FK into
  single-column entries, so prompt A and `declares()` see two joins that do not
  exist.
- The lookups of 3.6 and the note of 3.14 need unique keys.

**Build.**
- **`listKeys`: one statement**, so `readCatalog` still issues three:
  - constraint rows `WHERE contype IN ('p', 'f') AND (contype = 'p' OR conparentid = 0) AND conrelid = ANY($1::oid[])`,
    with `(to_jsonb(k) ->> 'conperiod')::boolean` for the temporal flag: the
    column exists only from Postgres 18, and read this way the one statement
    runs on 12 to 18 (NULL before 18);
  - `UNION ALL` unique-index rows from `pg_index` (`indisunique AND indisvalid AND indpred IS NULL AND indexprs IS NULL`),
    with `(indkey::int2[])[0:indnkeyatts - 1]` (the key columns only: an
    INCLUDE column is no part of the key, 1.5 item 11) and the index name;
  - ordered by relation, then kind, then name.
- **Foreign keys:** one entry per `'f'` row. Length 1 gives
  `{column, refTable, refColumn}`, byte-identical to 0.4.2; longer gives
  `{columns, refTable, refColumns}` in constraint order, and `period: true`
  for a temporal key (D19). An FK declared to one partition
  (`conparentid = 0`) is kept with that partition's name.
- **`Table.uniqueKeys?: string[][]`**, present only when the table has one,
  sorted by index name, the primary key's index included.
- **`schemas.ts`:** the `ForeignKey` union; `keyColumns(fk)` and
  `pairsOf(fk)`; `declares(from, pairs, to)`: true when an FK of `from` to `to`
  has exactly these pairs, as a set; `schemaOnly` flattens FKs to 0.4's
  per-column form and never picks `uniqueKeys` (D6); `modelView(extract)`
  drops `uniqueKeys` (and, from T8.4, `leaves`).
- **Callers:** `profile` builds its key-column set with `keyColumns`, so no
  column's visibility changes; `contextualize` sends `modelView`;
  `fitToContext` sizes `modelView`; `worthWeighing` and `measureJoin`'s basis
  call `declares` with one pair; `described` returns `foreignKeys` as the
  catalog now gives them and no `uniqueKeys`.
- `summarizePartitions` is unchanged: every kept `'f'` row is the relation's
  own, as `local` meant.

**Edge cases** (each a table of 4.2 or 4.3). A partitioned table referencing a
partitioned table (`ledger_lines`). A self-referencing composite FK
(`folders`). A three-column FK (`picks`). One column in two FKs
(`folders.tenant_id`). An FK to a UNIQUE constraint rather than the primary
key, with its columns in another order than the target key (`visits`). An
INCLUDE column (`stock_id_region`). A partial, expression or invalid unique
index (ignored; unit). A temporal key (unit, an injected catalog row with
`conperiod` true, since only Postgres 18 can declare one).

**Tests** (`partitions.test.ts`, `tenancy.test.ts`, `extract.test.ts`,
`integration.test.ts`):
1. "a foreign key to a partitioned table is one entry, however many
   partitions Postgres clones it to": `subscriptions` 1 (0.4.2: 5); `logins`,
   `carts`, `reviews` 1 each (0.4.2: 65 each).
2. "a foreign key declared to one partition stays listed": `pinned -> accounts_h_0`.
3. "partitions with foreign keys of their own are counted as before":
   `payments_p.partitions.withLocalForeignKeys` is 1.
4. "a foreign key of several columns is one entry, in the constraint's order":
   `tasks` has exactly `[{columns: ["tenant_id", "project_id"], refTable: "projects", refColumns: ["tenant_id", "id"]}]`;
   `stock` has `{columns: ["region", "code"], refTable: "warehouses", refColumns: ["region", "code"]}`;
   `visits` `{columns: ["tenant_id", "site_code"], refTable: "sites", refColumns: ["tenant_id", "code"]}`
   (against `UNIQUE (code, tenant_id)`); `picks` three columns; `folders` two
   entries, `{column: "tenant_id", refTable: "tenants", refColumn: "id"}` and
   the self-reference `{columns: ["tenant_id", "parent_id"], refTable: "folders", refColumns: ["tenant_id", "id"]}`;
   `ledger_lines` one entry to `ledger` (0.4.2: recorded at T8.1).
5. "unique keys come from valid whole-column unique indexes, the primary key's
   included, without INCLUDE columns": `projects` `[["tenant_id", "id"]]`,
   `customers` `[["id"]]`, `warehouses` `[["region", "code"]]`, `sites`
   `[["code", "tenant_id"], ["id"]]`, `stock` `[["id"]]` (not
   `["id", "region"]`); a partial index in a unit fixture is ignored.
6. "one column of a composite key is not a declared join": `declares` false;
   `measure_join tasks.project_id -> projects.id` answers basis `inferred`
   (0.4.2: `stated`).
7. "the fingerprints of fixture, clean, polymorph, sampling and tenancy are
   the ones 0.4.2 computed": against the committed snapshots; on `tenancy`
   this is D6's flattening of six composite keys.
8. "prompt A's input on the fixture is byte-identical to 0.4.2's": the user
   message against `fixture.request.json` (4.7; the system prompt changes in
   T8.5 to T8.7 on purpose, so it is not compared).
9. Unit: "a temporal foreign key is listed with period true, and the
   fingerprint does not see it".
10. "no partition name reaches prompt A or describe_table unless a key was
    declared to it".
11. `extract.test.ts:257`: three catalog statements, keys as the catalog now
    gives them (named in NOTES).

**Acceptance.**
- A1 An FK to a partitioned table is one entry in the extract, prompt A's
  input and `describe_table`.
- A2 A composite FK is one entry in constraint order; single-column entries
  are byte-identical to 0.4.2's.
- A3 The fingerprints of `fixture`, `clean`, `polymorph`, `sampling` and
  `tenancy`, and prompt A's user message on `fixture`, are 0.4.2's.
- A4 `withLocalForeignKeys` and an FK declared to one partition are unchanged.
- A5 Unique keys are read as 3.6 needs them, INCLUDE columns left out, and
  reach neither prompt A nor `describe_table`.
- A6 Every edge case above has its test, the temporal key included.

**Sabotage.** Remove the `conparentid` condition: test 1 fails with 5. Flatten
again: test 4 fails with two entries. Read the whole `indkey`: test 5 fails
on `stock` with `["id", "region"]`.

**Docs.** NOTES "Keys as the catalog declares them": what, why, and what was
not done (an FK declared to one partition stays an "unknown table" claim;
unique keys do not change the existing keyed rule; a temporal key is listed
but not measured, and a MATCH FULL key is measured with MATCH SIMPLE nulls,
D19). README "How it works": one sentence. CHANGELOG.

---

#### T8.3 Snapshot format 2 and the compatibility guarantee (P0)

**Why.** Per-leaf sampling (T8.4) and the new claim keys (T8.5 to T8.7) would
be misread by a 0.4.x reader, which drops unknown keys and samples a
partitioned table as one relation. The format must rise once, before the first
such change. And an upgrade alone must not fail a pull request (R13): the
committed 0.4.2 snapshots must keep checking as they did, in every later task.

**Build.**
- `SNAPSHOT_FORMAT = 2`, with a comment saying why (D5): the highest format
  this build reads and writes. `SnapshotSchema.snapshot` accepts the literals
  1 and 2; `parseSnapshot` refuses above 2 with the existing sentence.
- `formatFor(claims, extract)` in `snapshot.ts` (3.12), used by `toSnapshot`:
  format 2 when a claim's from-table or to-table is a partitioned table,
  otherwise 1. T8.5 adds "or a claim has `also`" and T8.6 "or `within`" (a
  path table is checked from T8.7), each with its test.
- One documented place, `measuredWithOf(snapshot)` in `snapshot.ts`, where
  each optional `measuredWith` key says what its absence means. It starts
  empty; T8.4 and T8.6 add their rows (3.12).
- `test/compat.test.ts`: every committed 0.4.2 snapshot of 4.7 (`fixture`,
  `clean`, `polymorph`, `sampling`, `tenancy`, `partitions`) and the live
  `fixture-r4c` replay, checked by this build on the unchanged databases with
  the assertions of 4.7 that hold from this task on (the settings note and
  `events_p`'s `not measured` are added by T8.4, named under R11).

**Edge cases.** A format-1 file hand-edited to hold a 0.5 key: read, and
measured as its keys say. `snapshot: 3`: refused. A format-2 file with no new
key: read. A claim that appears or goes between two runs: the format moves
with it (recorded in NOTES, D5).

**Tests.**
- `snapshot.test.ts`: "snapshots of format 1 and 2 are read, and one of format
  3 is refused with the upgrade sentence"; the round trip of format 2; "a
  snapshot is format 2 only when an older reader would misread it": `fixture`
  writes 1 (the assertion at `snapshot.test.ts:237` stays), `partitions`
  writes 2.
- `compat.test.ts`: "a snapshot 0.4.2 wrote checks unchanged", one test per
  committed snapshot, with the assertions of 4.7: for `fixture`, `clean`,
  `polymorph`, `sampling` and `tenancy` the same statuses, hit rates and
  fingerprint and no `regression`, `stale`, `drift`, `changed` or
  `not measured` item; for `partitions` exit 0, no `regression` or `stale`
  item, the "schema changed" note once, and the phantom claims `unchanged`;
  the `fixture-r4c` replay reproduces its 12 statuses and numbers.

**Acceptance.**
- A1 A full run on `fixture` writes `"snapshot": 1` and one on `partitions`
  `"snapshot": 2`; formats 1 and 2 are read; 3 is refused with "`<file>` was
  written by a newer dbtruth (snapshot format 3); upgrade dbtruth to check
  it".
- A2 Every committed 0.4.2 snapshot checks with exit 0 and no regression or
  stale item, with the per-snapshot assertions of 4.7.
- A3 Manual (needs npm): `npx -y dbtruth@0.4.2 check` on this build's
  `partitions` snapshot exits 1 with "... (snapshot format 2); upgrade dbtruth
  to check it", and on its `fixture` snapshot exits 0 (recorded).

**Sabotage.** Write format 1 always: A1's `partitions` test fails. Write 2
always: A1's `fixture` test fails.

**Docs.** NOTES "Snapshot format 2": when a file is format 2 and why (D5),
that a format can change between two runs as claims come and go, how a
format-1 file is measured, that the Action's default must move with the
release. Troubleshooting: the newer-format row gains "or raise the Action's
dbtruth-version". CHANGELOG.

---

#### T8.4 Partitioned tables sampled per leaf, and no empty from an empty sample (P0)

**Why.** Audit P0 4, a blocker on tables with many small leaves. One
`REPEATABLE` seed makes every leaf keep the same block numbers; on the fixture's
500 leaves the sample holds 0 rows at 2, 4 and 5% (1.4). 0.4.2 turns that into
"empty" with exit 0 on a join with 12.5% orphans, "size unknown" on a
never-analyzed table, and value lists from the first 20 of 500 days. It
contradicts the 0.4.0 claim (BUILD_PLAN section 2, NOTES T2.1) that "sampling
is unbiased on partitioned tables". And `verify.ts:95` reports any empty sample
as `empty` (the audit also reproduced it on `fixture` with `--sample-rows 100`).

**Build.**
1. **Catalog** (`extract.ts` `listRelations`): the leaves JSON keeps every
   leaf's size (`estimate`, `pages`) as today, so `estimateRows` is unchanged
   for every role (1.5 item 12), and adds `schema`, `name` and `oid`,
   `json_agg(... ORDER BY n.nspname, l.relname)`, only when every leaf is
   readable by the role (3.9); the code sorts the named leaves again by code
   units. The `Catalog` type and `Relation.leaves` follow; `Table.leaves`
   carries `{schema, name, oid, pages}` when named (3.9). `modelView` drops
   it; `TableFacts`, `described`, `schemaOnly` and the snapshot's
   relation list never pick it (a test pins each).
2. **`config.ts`:** `sampleMaxLeaves` (Appendix C), with its `overridable` row,
   variable, flag, and the `measuredWithOf` row "absent: 0".
3. **`safety.ts`:** `leafSeed` and `leafDraw` (`node:crypto`);
   `sampleSource(t, cfg, random = true, opts = {columns?, leaf?})` builds 3.9,
   two-stage included; `leaf: true` adds `tableoid` to the arms, and on the
   plain form gives `(SELECT tableoid, * FROM ... LIMIT n)`. A relation without
   leaves gets today's text. `querySampled` does not retry a per-leaf source
   with the plain form.
4. **`extract.ts`:** `pilot` and `integerKeys` use the per-leaf pilot when the
   relation has leaves and `sampleMaxLeaves > 0`; `profile` names all columns
   in its source and follows the fallback rule of 3.10.
5. **`verify.ts`:** measurements pass the columns they read; the empty rule of
   3.10 for relationships, `inconsistent_values` and `duplicate_entity`, with
   one helper `sampledNothing(db, source)` and the reason `EMPTY_SAMPLE`.
6. The existing settings note names `sampleMaxLeaves 0 (this run 256)` when a
   format-1 snapshot is checked.
7. **`write.ts` `fitForWriter`:** every stored per-leaf source is shortened
   to its first arm and `/* <n> more arms, one per sampled leaf */` in what
   prompt B receives (3.9); the snapshot, `--json` and `measure_join` keep the
   whole statement.

**Edge cases.** A tree with a foreign leaf (no leaves; `mixed` at -1,
unchanged). A role that may read the parent and not its leaves (sizes, no
named leaves: the 0.4 form, whose empty sample is then `unverifiable`, never
`empty`).
Sub-partitioning (leaves at any depth; `nested` holds). A leaf
attached with its columns in another order (`swapped_p`). An empty leaf (no
arm). 1,000 leaves (unit: k = 2, about 250 arms). `sampleMaxLeaves` 0 and 1.
A leaf dropped between the catalog read and the statement (`unverifiable` with
the server's words). A budget spent before the pilot (size unknown, as
today). A `when` branch absent from a non-empty sample (`empty`). A 0-row
relation (`empty`, no statement).

**Tests.**
- Unit (`safety.test.ts`, `extract.test.ts`, `verify.test.ts`):
  1. "a partitioned table is sampled with one arm per leaf with pages, in name
     order, each seeded from sampleSeed and its own name, selecting named
     columns": exact text for three leaves, one empty.
  2. "above sampleMaxLeaves, one leaf in 2^k is sampled, chosen by its name,
     each at p times 2^k, capped at 100": 500 and 1,000 fake leaves, one
     statement each, under 110 KB with one column.
  3. "adding a leaf changes no other leaf's seed or draw".
  4. "a table without leaves, or sampleMaxLeaves 0, keeps the 0.4 source byte
     for byte".
  5. "a sampled statement that reads no row is not measured, a plain one is
     empty, and a branch absent from a sample that has rows is empty"; and
     "a sample whose every row has a null reference is empty, with its
     nulls" (`total = 0`, `nulls > 0`, 3.10).
  6. "the leaves field is never sent to the model, and never in TableFacts,
     describe_table, the fingerprint or the snapshot's relation list" (a
     leaf's name does appear in a stored per-leaf query and in a breakdown
     label, by design: R3 row of 3.1).
- DB (`partitions.test.ts`, at `--sample-rows 2000` with `eventsClaims`):
  7. "a table of 500 small partitions is sampled across its leaves in one
     statement, and its broken join is broken": the numbers of 4.3; a
     recording `Db` shows no statement over `events_p` without `TABLESAMPLE`;
     exit 2 (0.4.2: both joins empty, exit 0).
  8. "statistics of a partitioned table come from across its leaves": `day`
     hidden, years [2025, 2026]; `status` values include `refunded` (0.4.2:
     `day` listed as 20 values, no `refunded`).
  9. "a never-analyzed table of 500 partitions is sized by a pilot over its
     leaves": `logs_p` within 20% of 50,000, source `pilot` (0.4.2: size
     unknown).
  10. "a leaf attached with its columns in another order is sampled by name":
      `swapped_p` within 3 points of 90.0%; the test also runs a `SELECT *`
      union and shows it differs.
  11. "two runs give byte-identical snapshots of partitions, and check passes
      on them with identical numbers".
  12. "the snapshot of partitions stays under 2 MB": sizes per verdict query
      recorded in NOTES, with planning and execution time at 500 leaves.
  13. "a role that may read a partitioned table but not its leaves samples it
      as 0.4 did": as `parent_only` (4.3), `events_p` keeps its estimate of
      50,000 from the leaves' sizes and has no named leaves, no statement
      names a leaf, and its joins read `unverifiable` with `EMPTY_SAMPLE`,
      never `empty` and never a `LIMIT` read of the first leaves.
- DB (`integration.test.ts`):
  14. "a sampled measurement that reads no row is never empty": `fixture` at
      `--sample-rows 100`; no relationship over a table with rows is `empty`
      (0.4.2: `order_items.order_id -> orders.id` empty); `cars` stays
      `empty`.
  15. "a snapshot edited down to a sample that reads nothing gets not
      measured, never empty": `measuredWith.sampleRows` 1 on a copy; every
      claim over a table with rows reads `unverifiable` with `EMPTY_SAMPLE`,
      so a broken claim is `not measured` and fails no build. This is the
      accepted behavior of 3.10, named in NOTES; range checks on snapshot
      settings are later work (Appendix E).
- Unit (`extract.test.ts`, with an injected `Db`):
  16. "a profile whose sample read no row reads the plain form, and keeps its
      statistics when that read came back short" and "... marks the table
      unmeasured when that read filled up" (the two branches of 3.10).
- DB (`partitions.test.ts`, `partitionsClaims`):
  17. "prompt B receives one arm of each per-leaf source": in the request
      `fakeModel` records, no stored query holds a second `TABLESAMPLE`, and
      its size is recorded in NOTES beside the snapshot's.
- Existing: `sampling.test.ts` holds for `ev`, `nested`, `mixed` and
  `fresh_big`; any assertion on the exact sampled text of `ev` or `nested`
  changes (named, R11). `compat.test.ts` still passes, now with the
  `sampleMaxLeaves 0` note on the `sampling` snapshot.

**Acceptance.**
- A1 `events_p` at `--sample-rows 2000`: a sample across leaves inside its
  band; `ref` broken at 87.5% +- 3; `customer_id` confirmed; exit 2 (0.4.2:
  empty, exit 0).
- A2 `logs_p` sized within 20% by a per-leaf pilot (0.4.2: size unknown).
- A3 `day` and `status` statistics come from across the leaves (0.4.2: the
  first 20 days).
- A4 Seeds depend on `sampleSeed` and each leaf's own name only; snapshots are
  byte-identical run to run; a new leaf moves no other leaf's arm.
- A5 A leaf with another column order is measured right.
- A6 No sampled measurement reports `empty` from a sample that read no rows;
  statistics never come from a plain read that did not cover the table (tests
  5, 14 to 16).
- A7 One statement per measurement at 500 and 1,000 leaves; the `partitions`
  snapshot under 2 MB; `sampleMaxLeaves` is a validated tunable whose 0
  reproduces 0.4's text; a 0.4 snapshot is measured as 0.4 measured it.
- A8 No leaf name reaches prompt A, and prompt B gets one arm per per-leaf
  source.

The run on the `pr_parts` replica is T8.9's (4.8).

**Sabotage.** Give every arm `sampleSeed` itself: test 7 fails with 0 rows.
Select `*` in the arms: test 10 fails. Drop the empty rule: test 14 fails
with `empty`. Send prompt B the whole statement: test 17 fails.

**Docs.** NOTES "Partitioned tables are sampled per leaf": the mechanism with
the audit's and 1.4's numbers; the correction of the 0.4.0 claim, worded for
declaratively partitioned tables (a table partitioned by inheritance, such
as a TimescaleDB hypertable, is still sampled as one relation, and a parent
of no pages of its own still reads empty from the catalog, R14); why names,
not oids or ordinals; the two-stage rule; the empty rule; why a stored query of
about 37 KB is accepted (R7); what was not done (a page floor per leaf,
statistics from `pg_stats`). The Known-limits entry "One sample, one target"
names per-leaf seeds. README "How it works" (one sentence), "Tuning"
(`--sample-max-leaves`), Troubleshooting (`EMPTY_SAMPLE`, and the profile's
`unmeasured` sentence). CHANGELOG.

---

#### T8.5 Composite keys measured whole (P0)

**Why.** Audit P0 5, second half. A NOT VALID composite FK with 20 of 150 rows
violating reads "confirmed 100%" twice; a broken two-column key passes `check`
as unchanged; `measure_join` takes one pair. A join on one column of a
per-tenant key repeats rows silently (387 rows for 150 on `tasks_nv`), and
nothing says so.

**Build.**
- **`schemas.ts`:** `also` (3.3) with its normalization and id; `pairsOf(r)`;
  `namesOf(r)` (every `[table, column]` a claim uses, 3.12);
  `TableFacts.uniqueKeys` (for the note).
- **`src/join.ts`** (new, pure; imports `safety` and `schemas`):
  `keyed(lookup, table)` (3.6) and `relationshipStatement(claim, from, to, cast)`
  for the unscoped single form (0.4.2's text, moved here unchanged) and the
  tuple form (3.5). `structure.test.ts` gains the row and the assertion that
  `join.ts` never calls `db.` (Appendix B).
- **`verify.ts`:** validation of every pair (3.8), the temporal-key sentence
  included; numbers of 3.4; the text fallback casts every pair;
  `worthWeighing` is false for tuples.
- **`check.ts`:** `claimNames` uses `namesOf`.
- **`snapshot.ts`:** `formatFor` also returns 2 when a claim has `also` (D5).
- **`write.ts` `joinLine`:** the tuple edge, the nulls sentence and the note
  (3.14). `tableFile` passes the target's facts.
- **`prompts/contextualize.md`**, the rule at lines 34-36 becomes:
  > Propose every declared foreign key constraint as one relationship with
  > basis "stated", so each gets measured and reported with its hit rate, and
  > add the ones you infer on top. A constraint listed with "columns" and
  > "refColumns" is one relationship on all of its column pairs: one pair in
  > "from" and "to", every other pair in "also", as {"from": column, "to":
  > column}.

  The schema gains `"also"?: [{"from": string, "to": string}]`. No other rule
  changes meaning.
- **`prompts/write.md`:** "A relationship with "also" joins on all of its
  column pairs together: write it as one join ON every pair, never as one of
  its columns."
- **`mcp.ts`:** `also` (3.14); `lookUp` checks every column; `basis` from
  `declares(pairsOf(claim))`; the tool description gains one sentence.
- **`test/canned.ts`:** `echoForeignKeys` (4.6).

**Edge cases.** A target tuple that is not unique (existence only). One pair's
types differing (the whole statement retries as text). An empty target ("no
rows to match against"); an empty source (`empty`). `when` with a tuple. Three
columns (`picks`). Pairs in another order than the target key, into a UNIQUE
constraint (`visits`, keyed by 3.6 (a)). A self-referencing key (`folders`).
The same pair twice (deduped). Hostile names in `also` from a snapshot (stale,
no statement). A claim on exactly a temporal key's pairs (`unverifiable`,
D19; unit).

**Tests** (`tenancy.test.ts`, `join.test.ts`, `schemas.test.ts`,
`write.test.ts`, `mcp.test.ts`, `remeasure.test.ts`):
1. "a composite key is one claim measured on the whole tuple, nulls apart":
   `tasks` 600/600 confirmed; `tasks_nv` 130/150 broken (0.4.2: 100% and
   100%); `stock` 300 with 10 nulls, confirmed; `visits` 120/130 broken;
   `picks` 200/220 with 10 nulls, broken; `folders` 24/24 with 6 nulls,
   confirmed (the numbers and 0.4.2 values of 4.2); the run's snapshot is
   format 2 (D5).
2. "a composite key dropped and its rows broken is a regression": scenario 5
   of 4.5 (0.4.2: unchanged, exit 0).
3. "a join on one column of a unique key of several says it is not unique in
   the target": the `tasks_nv.project_id -> projects.id` line ends with the
   note of 3.14; `orders.customer_id -> customers.id` on `fixture` has none.
4. "a model that proposes each declared key gets one claim per constraint":
   `echoForeignKeys` on `tenancy` yields one stated tuple for each of `tasks`,
   `tasks_nv`, `stock`, `visits`, `picks` and the self-reference of
   `folders`, the single-column keys as 0.4.2 yields them, and none on
   `tasks.tenant_id` alone.
5. `join.test.ts`: "0.4.2's statement text is kept for every unscoped
   single-column claim" (the fixture's and polymorph's claims, byte for
   byte); "a tuple is probed through a unique key it covers, in any order, and
   hashed otherwise" (`warehouses`, `projects`, a view).
6. `schemas.test.ts`: "a tuple's pairs in any order are one claim with one
   id"; "ids of tuples are injective under names holding , ( ) -> [ ] . \" and
   line breaks" (200 generated claims, 200 ids; the generator varies column
   names only, over two fixed table names, since the table part keeps 0.4's
   form, 3.3); every existing id unchanged.
7. `mcp.test.ts`: "measure_join measures a composite key with also, and
   refuses a malformed also before any statement"; the pinned key list gains
   `also` (named).
8. The replay of the recorded live run on `fixture` (`fixture-r4c`, 12/12,
   in `compat.test.ts`) still reproduces its verdicts; the Pagila replay
   (29/29) is manual, in T8.9 (4.8).
9. `verify.test.ts`: "a claim on a temporal key's pairs is not measured, and
   says why" (D19, an injected extract).
10. Canary, `reader` and time on every new output.

**Acceptance.**
- A1 A composite key is one claim, measured on the whole tuple with MATCH
  SIMPLE nulls apart, with the numbers of 4.2.
- A2 A broken composite key fails `check` (0.4.2 passed it).
- A3 A single-column join into part of a unique key carries the note.
- A4 Prompt A proposes one stated claim per constraint (canned replay), and
  both prompts carry the new rules (`write.test.ts` pins their text).
- A5 `measure_join` measures tuples; every 0.4.2 input answers as before,
  except the named `basis`.
- A6 Existing ids and statements are unchanged (R12); tuple ids are injective.
- A7 A snapshot holding a tuple is written as format 2; a temporal key is
  never measured as an equality tuple.

**Sabotage.** Measure only the first pair: test 1 reads `tasks_nv` at 100%.
Drop the `IS NOT NULL` row test: `stock`'s nulls fail.

**Docs.** NOTES "Composite keys measured whole": MATCH SIMPLE, the note, both
prompt changes quoted, why ids and fingerprints stay. README: "What it does not
do" loses the composite line; "How it works" gains one sentence; the MCP
section documents `also`. CHANGELOG.

---

#### T8.6 Joins within a tenant, path of length zero (P0)

**Why.** Thread item 1. Today a match under another tenant is a hit: it looks
correct and silently corrupts results. On `tenancy`, `invoices` reads 100%
confirmed with 5 cross-tenant rows, `orders` 95.6% with 60. Only a scoped
measurement can see it, and the cross-tenant count is what should fail a pull
request.

**Build.**
- **`schemas.ts`:** `within {column, toColumn}` (3.3; `path` and `toPath` are T8.7), its id
  part, `namesOf` for scope columns, `Measurement`/`VerdictSchema` unchanged
  but for the numbers.
- **`join.ts`:** the scoped statement of 3.5 with the fence; the found and same
  lookups, each keyed or hashed by 3.6; tenant resolution behind one interface,
  `resolution(claim, tables) -> {joins, unresolved, ambiguous, tenant, subCounts}`,
  path 0 now.
- **`verify.ts`:** validation (3.8); the numbers of 3.4; `worthWeighing`
  false for scoped claims.
- **`verdict.ts` `decide`:** 3.11.
- **`config.ts`:** `crossTenantMaxShare` (Appendix C) with its `measuredWithOf`
  row "absent: this run's".
- **`check.ts`:** the cross-tenant rules of 3.12 in `classify`, applied only
  when both statuses are confirmed or broken; `crossTenantBefore`; `side()`.
- **`snapshot.ts`:** `formatFor` also returns 2 when a claim has `within`
  (D5).
- **`write.ts`:** `joinLine`'s scoped lines and the twin clause on the
  unscoped line of the same pairs (3.14); the "rejected scope" line under
  "Known problems" in the from-table's file for a rejected scoped claim with
  cross-tenant rows, which is never a join line (D3).
- **`cli.ts` summary:** `(N cross-tenant)` inside broken, cross-tenant lines
  first, then the "rejected scope" lines (3.14).
- **`prompts/contextualize.md`**, a new rule after the polymorphic one:
  > A join can hold only inside a scope both rows belong to: a tenant,
  > account, workspace or organisation that the application keeps rows apart
  > by. When the from-table and the to-table each have a column you infer
  > holds that scope, propose the join with "within": {"column": that column
  > of the from-table, "toColumn": that column of the to-table}, in place of
  > the unscoped one; the two names may differ. A declared foreign key is
  > still proposed unscoped as stated, and the scoped one beside it, inferred.
  > A declared key whose columns include the scope column on both tables,
  > such as ("tenant_id", "project_id") to ("tenant_id", "id"), is proposed as
  > stated and also as the join on its other columns within that scope, so
  > that a row whose key exists only under another scope value is told apart
  > from an orphan. A match found only under another scope value is counted
  > apart from orphans, as cross-tenant. Never propose a scope you see no
  > column for.

  The schema gains `"within"?: {"column": string, "toColumn": string}`.
- **`prompts/write.md`:** crossTenant, shared, unresolved and ambiguous join
  the numbers paragraph, and one rule:
  > A relationship with "within" is measured inside a tenant scope.
  > crossTenant counts rows whose key exists only under another tenant: the
  > most serious finding, since an inner join on the key alone returns another
  > tenant's row without an error. Write it first, with the count and the join
  > condition that adds the scope. Never merge the rate of a scoped
  > relationship with that of the same columns unscoped.
- **`mcp.ts`:** `tenant_column` and `to_tenant_column` with their refine
  (3.14); `lookUp` checks both.
- **`skills/dbtruth/SKILL.md`:** the bullets of 3.14 on scope and
  cross-tenant.
- **`readme.test.ts`:** `REPORT` accepts `(\*\*BROKEN(, CROSS-TENANT)?\*\* )?`;
  `UNSEEN` gains the refine sentence (named).

**Edge cases.** Scope columns with different names (`org_id` against
`org_ref`). uuid against text (one retry). A scope with `when` (the value stays
`$1`; `attachments`). A scoped tuple (unit statement shape). A NULL tenant on
the source (unresolved) and on the target (shared). Shared rows alone
(`tags`: confirmed, exit 0, D18). A key under the same and another tenant (a
hit, by precedence). A key under no tenant and another tenant (shared, by
precedence; `tags`). A row with no tenant and no match (an orphan, by
precedence; `orders` 1201 to 1210). A nonsense scope (rejected, never a join
line, shown as a "rejected scope" line). A scope column that is also a key
column (measured as written). A tenant column that is not categorical
(measured all the same; no value leaves the database). A model that proposes
no scope (nothing is scoped).

**Tests** (`tenancy.test.ts` unless named; the claim set is `scopeClaims` of
4.6 plus the `edgeClaims` a test names, since no walk exists before T8.7):
1. "a join within its tenant counts same-tenant hits, cross-tenant hits,
   orphans, shared rows and rows with no tenant apart, and each equals its
   oracle": every path-0 row of 4.2 (`attachments` with its `when` included),
   `docs -> guests` through the text retry.
2. "a scoped claim splits exactly what its unscoped twin calls hits": the
   invariants of 3.4 on `orders`, `invoices`, `quotes`.
3. "any cross-tenant row breaks the join and the run exits 2": `invoices`
   (0.4.2: confirmed, exit 0); `quotes` alone exits 0.
4. "a scope that most rows fail is rejected, and shown as a rejected scope,
   never as a join": the nonsense scope reads `rejected` at 0.3%; the
   `orders` file has its "rejected scope" line of 3.14 under "Known
   problems" and no join line for it; the summary has its line after the
   broken ones.
5. "the scoped statement is fenced": `EXPLAIN (ANALYZE, FORMAT JSON)` on the
   `orders` claim: the loops of every scan of `customers` sum to at most 2 per
   sampled row, and more than 5 without the fence; on the `tasks_nv` scope,
   whose found lookup into `projects` is hashed, every scan of `projects` has
   `loops = 1`. Loops, not SubPlan names, so the assertion holds on Postgres
   12 to 18 (3.5).
6. Scenarios 1 to 4 and 9 of 4.5: "cross-tenant rows that appear are a
   regression, named with both counts"; "a cross-tenant share that grows by
   the tolerance is a regression"; "cross-tenant rows fixed are an
   improvement"; "a dropped scope column makes its claim stale"; "a rejected
   scope whose share grows fails no build" (unchanged, and the scoped
   `orders` claim drift, exit 0). The stderr lines of 3.14 exactly, without
   the where-line, which T8.8 adds (named under R11); `--json` validates with
   `crossTenantBefore`.
7. R4: scenario 6 gives identical numbers; `tenancyClaims` without `within`
   produce no `crossTenant` key anywhere; `structure.test.ts` "no string
   literal in src names a tenant column": no literal in `src/*.ts` matches
   `/\b(tenant|org|account|workspace)_(id|ref|slug)\b/`.
8. R3, R8: the canary of 4.9 on every output; stored queries hold no literal
   but `$1`; scenario 8's hostile scope runs nothing.
9. Unit: `verdict.test.ts` "a cross-tenant row breaks a join whatever its hit
   rate, after the rejected band"; `check.test.ts` every cross-tenant pair of
   3.12, "moves to or from rejected keep the status rules" (a rejected scope
   whose share grows by more than the tolerance is unchanged; confirmed ->
   rejected is a regression), and the markdown and stderr strings;
   `write.test.ts` the path-0 lines, the twin clause and the rejected scope
   line of 3.14 exactly, and both prompts' new rules; `cli.test.ts` "7 broken
   (6 cross-tenant)" over `scopeClaims` (T8.7 pins "10 broken (8
   cross-tenant)" over `tenancyClaims`), and with the nonsense scope added
   "1 rejected" and its line; `config.test.ts` the range, variable and flag.
10. MCP: "a scoped measure_join gives a full run's numbers and line, and
    refuses half a scope before any statement" (the answer without
    where-lines, which T8.8 adds, named under R11).
11. Standing assertions: `reader`; no model in `check` and `mcp`; the full
    offline run on `tenancy` under 5 s.
12. "an unscoped join says how many of its matches are under another tenant
    when a scoped claim on the same columns counted them": the `orders` twin
    line of 3.14 ends with the twin clause naming 60; the `tasks_nv.project_id`
    line ends with its note and the clause naming 20 (3.14); the `order_items`
    twin, with no scoped claim beside it in `scopeClaims`, has no clause.
13. "shared rows alone keep a scoped join confirmed": `tags` reads confirmed
    at 100.0% with 20 shared rows and the shared clause of 3.14, and a run
    with it alone exits 0 (D18).

**Acceptance.**
- A1 A scoped join's buckets equal the oracle on every path-0 claim of 4.2,
  and the invariants with the unscoped twin hold.
- A2 Any cross-tenant row makes the join broken and the run exit 2
  (`invoices`; 0.4.2: confirmed, exit 0).
- A3 `check` fails a pull request on 0 -> above 0 and on growth by the
  tolerance, reports a fix as improved, and names both counts.
- A4 The file line, the twin clause, the rejected scope line, the summary and
  the MCP answer read as 3.14.
- A5 Tenant values never leave the database (canary, stored queries, error
  messages).
- A6 The scope comes only from a claim (R4 tests and the literal scan).
- A7 `crossTenantMaxShare` is a validated tunable recorded in `measuredWith`.
- A8 A rejected scope fails no build however its share moves (scenario 9),
  and shared rows alone never break a join (`tags`).

Whether the real prompt A proposes these scopes is checked live in T8.13
(A4), with the published build's prompt.

**Sabotage.** Drop the tenant condition from the same lookup: `invoices` reads
confirmed and test 3 fails. Swap the orphan and unresolved precedence: test 2
fails (`orders` counts 40 orphans against its twin's 50). Put cross before
shared: `tags` reads 20 cross-tenant and broken, and test 13 fails. Drop the
fence: test 5 fails. Classify by status only: scenario 2 passes as drift and
test 6 fails. Apply the cross-tenant rules to rejected claims: scenario 9
reads regression and test 6 fails.

**Docs.** NOTES "Joins within a tenant": the buckets, the precedence and why
orphans come first; shared rows counted as matches and why (D18); why
rejected is checked first, how a rejected scope is still shown, and the known
limit it leaves (D3); the detection floor (3 / sampled rows); that on a
sampled read a cross-tenant row can enter or leave the sample with no row of
the claim changed (3.12); the prompt changes quoted; what was not done (a
full count, a flag for designs where shared rows are wrong, a floor for
sampled counts). The Known-limits entry on unconditional joins names the
scope. README "How it works" (one paragraph), "Keeping context true" (the
cross-tenant rules of D4 and the sampled-count caveat), "Tuning", the MCP
section, Troubleshooting (the refine sentence). The skill. CHANGELOG.

---

#### T8.7 The parent walk (P0)

**Why.** Thread item 2, "support the parent walk first". `order_items ->
orders -> tenant` is normal in normalized schemas, and that is where
wrong-tenant bugs hide: on `tenancy`, `order_items.product_id -> products.id`
reads 97.0% confirmed while 120 items point at another tenant's product. The
same walk from the other end is needed when the target holds no tenant
column: `refunds.order_item_id -> order_items.id` reads 97.1% confirmed while
30 refunds point at another tenant's order items (D11).

**Build.**
- **`schemas.ts`:** `within.path` and `within.toPath` (3.3), their id parts,
  `claimsSchema` spells hop tables, `namesOf` covers every hop of either
  path.
- **`join.ts`:** resolution for one or more hops, probe or grouped (3.5), with
  the sub-counts; a path is all probe or all grouped. Path 0 goes through the
  same interface (PW4: one code path), and so does a path on the to side,
  run from the target row inside the found and same lookups (3.5).
- **`verify.ts`:** validation of every hop of either path (3.8); `noLink`,
  `noParent`, `noTenant` on from-side path claims.
- **`config.ts`:** `tenantPathMaxHops` (Appendix C), never read from a
  snapshot; it bounds each path.
- **`snapshot.ts`:** `formatFor` also returns 2 when a path table is a
  partitioned table (D5).
- **`check.ts`:** nothing new: `claimNames` already uses `namesOf`, so
  `remeasure` profiles every hop table.
- **`mcp.ts`:** `tenant_path` and `to_tenant_path` with their refines (3.14),
  bounded before any lookup; `lookUp` per hop, refusing with the closest
  names; the extract profiles the hop tables.
- **`write.ts` `joinLine`:** the path edge ("through ...", and "... on the
  target side"), the unresolved, ambiguous and path-shared clauses, and the
  join to write (3.14).
- **`prompts/contextualize.md`**, the scope rule gains:
  > When the from-table has no such column but reaches a table that has one
  > through its own references, give the shortest such path in "path", one
  > step per reference: {"column": the referencing column of the current
  > table, "table": the table it points at, "key": the column it points at};
  > "column" then names the scope column of the path's last table. When the
  > to-table has no such column, give its path the same way in "toPath", and
  > "toColumn" names the scope column of that path's last table. Propose each
  > step as a relationship of its own too, so its orphans are measured.

  The schema gains `"path"?` and `"toPath"?`, each
  `[{"column": string, "table": string, "key": string}]`.
- **`prompts/write.md`:** "noLink, noParent and noTenant say why a row's tenant
  could not be resolved through its path; ambiguous rows reach more than one
  tenant. Say which step failed."
- **Skill:** the `tenant_path` and `to_tenant_path` sentence of 3.14.

**Edge cases** (each a claim of 4.2 or 4.3). A NULL link at hop 1 or 2, and a
link to no row at either hop (`order_items`, `order_lines`). A NULL tenant at
the end (`order_items`). A hop into a key that is not unique alone
(`projects.id`: ambiguous, grouped form; `task_notes`). An ambiguous row whose
reference is an orphan (an orphan, by precedence; `task_notes` 101 to 110). A
dead branch beside a live one in a grouped hop (not ambiguous; `batch_items`).
A hop into a partitioned parent with PK `(id, created)` (keyed by 3.6 (b),
probed per leaf; `order_items_p` on `partitions`, and at 24 and 500 leaves in
4.8). A path on the to side, with a target row whose path reaches no tenant
(shared; `refunds`). A path at exactly `tenantPathMaxHops` and one step over.
A path through the same table twice (allowed; `categories`). `when` with a
path (`activity`).

**Tests** (`tenancy.test.ts`, `partitions.test.ts`, `join.test.ts`; the
claim set is `tenancyClaims` with the `edgeClaims` each test names):
1. "a leaf's tenant is resolved through its parent, and its buckets equal the
   oracle": `order_items` (0.4.2: 97.0% confirmed), `order_lines` two hops,
   `activity` (a path with `when`), `categories` (the same table twice).
2. "rows whose path reaches no tenant are counted apart, by the step that
   failed": `order_items` 50 / 50 / 20, `order_lines` 10 / 10 / 0; never cross
   or orphan.
3. "a link that is not unique alone makes its rows ambiguous": `task_notes` 60
   and 40, and 10 orphans, through the grouped form (`EXPLAIN (ANALYZE, FORMAT JSON)`:
   every scan of `projects` has `loops = 1`, so it is read once and grouped,
   never scanned per sampled row).
4. "a path of one step through a table's own key measures what its own columns
   measure": the self-walk equals the path-0 `orders` numbers, and its
   `noTenant` is 20.
5. "the kept query of a walk reruns to its numbers as reader".
6. Scenarios 4, 7 and 8 of 4.5: a dropped path column makes the walk stale; a
   cross-tenant row reached through the parent is a regression; a hostile or
   over-long path runs no statement and `customers` survives.
7. MCP: "measure_join walks a tenant path and gives a full run's numbers"
   (the call of 3.14 gives the numbers listed there); an unknown hop column is
   refused with the closest names and no statement.
8. `config.test.ts`: `tenantPathMaxHops` range, variable and flag; a snapshot
   cannot raise it.
9. "a reference into a table with no tenant column is scoped through the
   target's own path": `refunds` 300 same, 30 cross, 10 shared (their
   `order_items` rows have a null `order_id`), 10 orphans, 88.6% broken
   (0.4.2: 97.1% confirmed); its line of 3.14 exactly; MCP
   `to_tenant_path` gives the same numbers.
10. "a dead branch is no ambiguous row": `batch_items` reads 50/50 confirmed
    with 0 ambiguous; `join.test.ts` pins the `untenanted` aggregate of 3.5.
11. "a walk through a partitioned parent is measured": on `partitions`,
    `order_items_p` reads 600, 570 same, 30 cross, 95.0% broken, and its hop
    into `orders_p` is keyed (3.6 (b)).
12. `cli.test.ts`: the summary of 3.14 over `tenancyClaims`, "7 confirmed (1
    on weak evidence), 10 broken (8 cross-tenant)", with its lines in order
    (T8.6's line over `scopeClaims` stays; named under R11).

**Acceptance.**
- A1 A leaf's tenant is resolved through 1 to `tenantPathMaxHops` hops, and
  its buckets and sub-counts equal the oracle.
- A2 Unresolved and ambiguous rows are counted apart and never become
  cross-tenant or orphans; a dead branch makes no row ambiguous.
- A3 A path of length 0 and a self-walk give identical numbers from one code
  path.
- A4 Every hop is looked up before SQL; the length is bounded by this run's
  setting; a hostile path runs nothing; a dropped path column is stale.
- A5 A target with no tenant column is scoped through its own path (`refunds`,
  file line and MCP).
- A6 A walk through a partitioned parent gives the numbers of 4.3.

The timings at scale (`tenancy_big`, 4.8) are T8.9's; whether the real prompt
A proposes the walks is checked live in T8.13 (A4).

**Sabotage.** Take the tenant from the first parent row without counting
distinct tenants: test 3 loses its 40 ambiguous rows. Put ambiguous before
orphan: `task_notes` reads 50 ambiguous and 0 orphans, and test 3 fails. Probe
a hop that is not keyed: test 3's loops assertion fails. Write `untenanted` as
`bool_or(pN.<scope> IS NULL)`: `batch_items` reads 25 ambiguous and test 10
fails. Leave out the `x.tenants = 0` test, so a target row whose path reaches
no tenant is not shared: `refunds` reads 40 cross-tenant and 0 shared, and
test 9 fails.

**Docs.** NOTES "The parent walk": tenant sets and sub-counts, the probe and
grouped forms and why never mixed, why cycles are allowed and the length
bounded, the path on the target side through the same interface, and a keyed
hop into a partitioned parent probing every leaf (measured, pruning later
work). README "How it works" (one sentence), "Tuning", the MCP section,
Troubleshooting (the path-length sentence and the refines). CHANGELOG.

---

#### T8.8 Where the problems live: by tenant and partition (P0)

**Why.** Thread item 3: "A join that is clean today but broken in old
partitions shows up as a mildly degraded number ... If only one view can be
built: orphan rate by tenant + partition". `ledger` reads 98.0% confirmed
while October and July hold all 240 orphans, and a cross-tenant count says
there is a leak, not whose. The view the thread ranked first is the cell,
tenant and partition together: the two marginals alone cannot say which
tenant's rows in which partition are broken (D12).

**Build.**
- **`join.ts`:** `breakdownStatement(claim, ...)` (3.13): one statement with
  the grouping sets that apply, `(leaf, tenant)`, `(leaf)` and `(tenant)`,
  reusing the claim's bucket subquery (the scoped CASE of 3.5, or the
  unscoped bucket subquery) over a source built with `leaf: true`.
- **`verify.ts`:** after every claim and every weighing, one budgeted
  statement per eligible measurement; parse it into `breakdown.cell`,
  `breakdown.partition` and `breakdown.tenant`, labels by 3.13 (the gate
  `verify.ts:62` uses); `unsampled` and `empty` from the leaves; keep the
  query after `;`.
- **`schemas.ts`:** the optional `measurement.breakdown` on `Measurement` and
  `VerdictSchema` (3.13); `decide` copies it. No format change: only a scoped
  claim or one over a partitioned table carries it, and its snapshot is
  format 2 already (D5).
- **`config.ts`:** `breakdownMaxRows` (Appendix C).
- **`src/where.ts`** (new, pure; imports `schemas`): the where-lines of 3.14
  from a breakdown, the cell line first. `structure.test.ts` gains its row
  (Appendix B). `check.ts` may not import `write.ts` (1.5 item 10), so every
  printer goes through this module.
- **`write.ts`:** the where-lines under the join, through `where.ts`;
  `fitForWriter` drops the queries first, then the breakdowns.
- **`check.ts`:** the stderr where-line under a failing row and the folded
  `where` part of the comment (3.14), through `where.ts`; `classify` ignores
  breakdowns.
- **`mcp.ts`:** the where-lines in the text; `breakdown` in the JSON.
- **`prompts/write.md`:** "A breakdown says where the orphans and
  cross-tenant rows were sampled, by tenant and partition together, by
  partition and by tenant: a place, never a cause."

**Edge cases** (each a claim of 4.2 or 4.3). An unscoped join from a
partitioned table (partition only: `ledger`, `ledger_t`, `ledger_s`). A scoped
join from a plain table (tenant only: `orders`, `docs`, `cards`). Both (cell,
partition and tenant: `ledger` and `ledger_t` scoped). Empty future leaves
(`ledger`'s three). The DEFAULT partition, with orphans (`ledger_t_default`).
Sub-partitions, with orphans in one sub-leaf (leaf level: `ledger_s`, where
`ledger_s_2024` is no group). A table partitioned by its tenant (`ledger_t`:
the cell and both marginals name the same three groups). A hidden or uuid
tenant (ranks: `docs`, `cards`). More problem groups than `breakdownMaxRows`
(a rest row with problems: `cards`). `check` under `wider` settings (ranks).
The two-stage sample (unsampled leaves counted: `events_p`). A LIMIT cut (the
sum invariant is only claimed without a cut; documented). The budget spent
before the breakdown (the claim keeps its numbers). `breakdownMaxRows` 0.

**Tests** (`partitions.test.ts`, `tenancy.test.ts`, `where.test.ts`,
`write.test.ts`, `check.test.ts`, `snapshot.test.ts`):
1. "a confirmed join names the partitions its orphans are in": `ledger`
   unscoped at default settings, its line of 3.14 exactly (October before
   July: by problems, never by name).
2. "a scoped join on a partitioned table is broken down by tenant and
   partition, by partition and by tenant": `ledger` scoped, its three lines of
   3.14 exactly, the cell line first.
3. "each group states the rows sampled in it, and the groups sum to the
   claim": `ledger` at `--sample-rows 1200` (12 leaf groups of at least 54
   rows, 3 hold no rows; the cell, partition and tenant rows each sum to the
   claim); `events_p` at `--sample-rows 2000` (groups plus not sampled make
   500; this plan measured 97 and 403).
4. "the DEFAULT partition is a group of its own": `ledger_t` unscoped reads
   `where, by partition: ledger_t_2: 100 of 1000 (10.0%), ledger_t_default: 50 of 200 (25.0%); 2 others: none of 2000.`;
   scoped, the cell, partition and tenant lines each name `ledger_t_2` /
   tenant 2, `ledger_t_default` / tenant 4 and `ledger_t_3` / tenant 3 (30
   cross-tenant), in that order (4.3).
5. "tenants are named by value only when their column is categorical, and by
   rank otherwise": `orders` by value (3.14); `docs` and `cards` by rank; no
   slug or org uuid in any output.
6. "the breakdown's query is kept after the join's and reruns to its rows as
   reader".
7. "a breakdown never moves a claim's class" (unit), and the where-line and
   folded part of scenario 1 exactly (T8.6's lines gain it, named under R11).
8. Snapshots stay byte-stable with breakdowns; one without them reads as
   before.
9. "a breakdown costs one statement per eligible claim": a recording `Db`
   over the `partitions` run counts exactly one breakdown statement per
   eligible claim and none for the rest; the run stays under the 20 s of 4.9.
10. "a sub-partitioned table is broken down by its leaves": `ledger_s` reads
    `where, by partition: ledger_s_2024_t2: 20 of 100 (20.0%); 2 others: none of 200.`
11. Scenario 10 of 4.5: "a cross-tenant row that enters the sample with no
    row of the claim changed is a regression, and its where-line names the
    partition": the class its two sampled counts imply, on every server; on
    16 the counts 0 and 9 and `ledger_2025_04`.
12. `where.test.ts`: every form of 3.14 with no database: kept groups; the
    rest with no problem and with problems (`cards`' "55 others: 25 of 549
    (4.6%, 25 cross-tenant)"); "had no sampled row" and "hold no rows";
    labels by value and by rank.

**Acceptance.**
- A1 Orphans and cross-tenant rows come by tenant and partition together, by
  partition and by tenant, with n per group, each dimension summing to the
  claim (the numbers of 4.3 and 3.14).
- A2 A leaf with no sampled row or no rows is never a 0% group.
- A3 A tenant is named by value only through the categorical gate, otherwise
  by rank (canary).
- A4 The breakdown is bounded by `breakdownMaxRows`, deterministic,
  rerunnable, one statement per eligible claim, and never classified by
  `check`.
- A5 The where-lines come from one pure module shared by the files, `check`
  and MCP, and `check.ts` still reaches no `model.ts` (structure test).

**Sabotage.** Order the groups by label instead of by problems: test 1 names
July before October, and test 2 names `ledger_2025_04` first. Build only the
two marginals: test 2 misses the cell line. Select the tenant value whatever
the gate: test 5's canary fails.

**Docs.** NOTES "Where the problems live": the cell and the two marginals
from one statement, and why the cell is the thread's one view; n per group
instead of a floor; a sampled count that moves with the sample (scenario 10).
README "How it works" with the `ledger` example, "Tuning", the `check`
section. CHANGELOG.

---

#### T8.9 Measured at scale (P0)

**Why.** The fixtures prove the numbers; they cannot prove time on 20M rows,
a 37 KB statement over 500 real leaves, or a keyed hop into 500 leaves. Every
manual run at scale lives here, so no earlier task waits on it (section 0).

**Build.** `scripts/scale/pr_parts.sql`, `scripts/scale/tenancy_big.sql`,
`scripts/scale/wide.sql`, `scripts/scale/pagila.sh` and
`scripts/scale/run.mjs` (4.8): canned claims, no model, 0.4.2 from the
`../dbtruth-042` worktree and this build in one session on one machine,
timing per statement, peak RSS. Opt-in, never in CI, and not in the package
(section 6, step 3).

**Tests.** Manual, recorded in `acceptance/manual.json` and NOTES with the
command of each: every "Required" of 4.8 and every baseline.

**Acceptance.**
- A1 `pr_parts` meets 4.8: `ref` broken at 87.5% +- 1, exit 2, `logs_p` within
  20%, `refunded` listed, the run under 60 s and at most twice 0.4.2's.
- A2 `tenancy_big`: claims 1 to 4 each under 5 s without timing out, claim 5
  within 20% of 0.4.2, claim 6 finishes, claim 7's outcome is recorded and
  the README states it as a limit.
- A3 Pagila: the 29 verdicts of `pagila-pagila2.json`, run offline, are
  reproduced except the named `basis` and note changes, and `check` of that
  snapshot exits 0.
- A4 Every baseline of 4.8 holds within 20% of 0.4.2 measured in the same
  session, peak RSS at most 0.4.2's plus 20%.
- A5 No scoped measurement at scale hangs, or returns a bucket that disagrees
  with a hand rerun of its stored query; every number is recorded with the
  machine and the Postgres version.

**Sabotage.** Remove the fence and rerun claim 1: the recorded time rises past
the fenced one. Drop the restriction of D17 and rerun claim 4: it ends
`unverifiable` with the timeout's words (both recorded).

**Docs.** NOTES "0.5 at scale". README "What it does not do": claim 7's
outcome, in words a user can act on.

---

#### T8.10 What a user reads: README, upgrade guide, skill, CHANGELOG (P0)

**Why.** Each task updated its own lines. This task makes the whole read true
for someone who never saw the change, and makes the upgrade path explicit. The
audit found the README promising what the code did not do; that must not
happen again.

**Build.**
- **README:**
  - a section "Joins within a tenant": the buckets and their precedence
    (shared rows count as matches, D18), the lines of 3.14, where the scope
    comes from (a claim, never a name), the path on either side, the
    detection floor (a cross-tenant rate below about 3 / sampled rows can be
    missed), what a rejected scope means (D3), what it does not do
    (soft-deleted rows count as existing; a keyed hop into a partitioned
    parent probes every leaf, with T8.9's outcome at 500 leaves; a table
    partitioned by inheritance is sampled as one relation);
  - a section "Upgrading from 0.4":

    | You have | What happens | What to do |
    |---|---|---|
    | A committed 0.4 `context/`, checked by 0.5 | Measured as 0.4 measured it, one settings note (`sampleMaxLeaves 0`). A schema with an FK to a partitioned table gets "the schema changed" once. A join 0.4 called empty from an empty sample reads "not measured". Exit codes as before. | Nothing. Run `npx dbtruth` when convenient. |
    | A full run with 0.5, committed | `snapshot.json` becomes format 2 when it holds a composite key, a scoped claim or a partitioned table, and stays format 1 otherwise; composite keys become one claim; scoped claims appear; partitioned tables are sampled per leaf, so their numbers move once; the run may exit 2 on cross-tenant rows nobody knew about. | Read the **BROKEN, CROSS-TENANT** lines, then commit `context/`. |
    | The Action at `@v1` with its default version | Runs 0.5.0 from release day and reads formats 1 and 2. | Nothing. |
    | The Action with `dbtruth-version: 0.4.x` and a format-2 snapshot | `result=error`; the comment quotes "written by a newer dbtruth (snapshot format 2)" and adds the hint of T8.11. A format-1 snapshot keeps working. | Raise the pin, or remove it. |
    | The MCP server | The same four tools and inputs, plus optional keys. | Restart the client. |

  - "Keeping context true": one row for the cross-tenant rules (D4), and the
    sampled-count caveat of 3.12 (a cross-tenant row can enter the sample
    with no row of the claim changed; the where-line names its partition);
  - "What it does not do": no composite line; the user-facing items of
    Appendix E;
  - "Privacy": a partition's name is shown like a table's (R3 row of 3.1);
  - "Tuning": the four new rows of T8.4 to T8.8; Troubleshooting complete
    (`readme.test.ts` green);
  - the privacy warning of `0778e6a` stays: the value gate is later work.
- **Skill:** the final text of 3.14, under 5,000 characters.
- **NOTES:** Known limits updated (unconditional joins, one sample one target,
  the rejected-first rule of D3, the rule of three, sampled cross-tenant
  counts, a snapshot edited to sample nothing, inheritance trees, MATCH FULL
  and temporal keys).
- **CHANGELOG 0.5.0:** every change a user can see, the format bump, the
  Action step, and the one-time moves.

**Tests.** `readme.test.ts` and `skill.test.ts` green. New: "every flag and MCP
key the README names exists" (flags from `overridable`, keys from
`JoinSchema.shape`).

**Acceptance.**
- A1 Every string of 3.14 the README quotes is the one the tests pin.
- A2 Troubleshooting has a row for every new message.
- A3 The skill names only real tools, and the new keys in quotes.
- A4 Manual review, recorded: nothing in README or CHANGELOG promises what is
  not built.

**Sabotage.** Remove one Troubleshooting row: `readme.test.ts` names the
message.

**Docs.** This task is docs.

---

#### T8.11 The Action: default version and a cross-tenant case (P0)

**Why.** A 0.5 snapshot with a composite key, a scope or a partitioned table
is format 2, which the Action's default 0.4.1 refuses: `result=error` on every
pull request. The cross-tenant failure must be proven in the Action's own CI,
not only in dbtruth's.

**Build** (repository `dbtruth-action`):
- `action.yml`: `dbtruth-version` default `0.5.0`, on a branch, tested against
  a local `npm pack` tarball of 0.5.0 (the workflow installs the tarball when
  one is given) and merged right after `npm publish` (T8.13).
- `scripts/check.sh`: when check exits 1 and its stderr holds "was written by
  a newer dbtruth", the comment adds "Set dbtruth-version to 0.5.0 or later, or
  remove it to use this action's default." (a match on dbtruth's own message,
  syntax not meaning; the Action's NOTES says so).
- `scripts/make-fixture-snapshot.mjs` (dbtruth) gains `--database <name>` and
  `--claims <set>`; the Action vendors `tenancy.sql` and a `tenancy` snapshot
  at tag `v0.5.0`, plus `test/regress-tenant.sql` (scenario 1 of 4.5).
- The workflow: pass on the unchanged database; the cross-tenant regression
  (`result=fail`, `regressions=1`, the comment holds "cross-tenant"); a
  format-2 snapshot with `dbtruth-version: 0.4.2` (`result=error` and the hint
  line); the existing pass, fail, skipped and error cases.
- The Action README: "Upgrading" and an example cross-tenant comment.

**Acceptance** (all before `npm publish`, against the tarball):
- A1 The Action's CI on the branch passes the three new cases and the four old
  ones.
- A2 With the 0.5.0 tarball, the pass case on a format-2 `tenancy` snapshot
  passes.
- A3 A pinned 0.4.x gets the hint line.

Merging the branch, moving `v1` and the Marketplace notes happen after
`npm publish`, so they are T8.13's (A3).

**Sabotage.** Leave the default at 0.4.1: the pass case on a format-2
snapshot errors.

**Docs.** The Action README; dbtruth README "CI" links it.

---

#### T8.12 A Claude Code backend for the full run's model calls (P1)

**Why.** Step 1 needs `ANTHROPIC_API_KEY` for its two model calls (prompt A
and prompt B). Many Claude Code users have a subscription and no key; today
they can use `check` and `mcp` but not step 1. BUILD_PLAN T5.3 left the
backend open "only if offered"; the maintainer has decided to build it. The
`Transport` is already injectable (`model.ts`), so the backend is one more
transport behind the same `ask()`, and nothing else in the pipeline moves.

**Build.**
- **`config.ts`:** `backend`, `"api"` (default) or `"claude-code"`, set by
  `DBTRUTH_BACKEND` or `--backend`, checked like `modelEffort` (an unknown
  value is refused with a sentence naming both); `claudeCodeTimeoutSeconds`
  (Appendix C). The CLI's path is a setting, not a number:
  `DBTRUTH_CLAUDE_PATH`, read from the environment or the settings file like
  `ANTHROPIC_MODEL`.
- **`model.ts`**, still the only module that talks to a model (R2):
  - `Transport` gains an optional fourth argument, the JSON Schema of the
    reply. `ask()` passes `z.toJSONSchema(schema, { io: "input" })` (the
    claims schema holds a transform, which the default output mode refuses;
    in input mode it converts, about 2,000 characters; `FilesSchema` about
    220). The API transport ignores it; `fakeModel` is untouched.
  - `ModelOptions.backend`; `createModel` builds the Claude Code transport
    and its preflight when it is `"claude-code"`. An injected `transport`
    still wins, so every existing test runs as before.
  - **Finding the CLI:** `DBTRUTH_CLAUDE_PATH` when set, else the first
    `claude` on `PATH` (on Windows `claude.exe`). A path ending in `.js`,
    `.mjs` or `.cjs` is run with this Node (`process.execPath`), so an npm
    install's script and the test's fake run the same way on every system.
    On Windows a `.cmd` or `.bat` shim is refused with a sentence naming
    `DBTRUTH_CLAUDE_PATH`: Node runs a shim only through `cmd.exe`, which
    would reparse the prompt text and cap the line at 8,191 characters. The
    VS Code extension puts no `claude` on `PATH`, so the not-found sentence
    names where its copy lives.
  - **One call:** `spawn(file, args, { cwd, env, shell: false, windowsHide: true })`
    with `cwd` a new empty directory from `mkdtemp(join(tmpdir(), "dbtruth-claude-"))`,
    removed in a `finally`, and `args` exactly
    `["-p", "--safe-mode", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json", "--model", <model>, "--system-prompt", <prompt>, "--json-schema", <schema JSON>]`,
    plus `["--effort", <effort>]` when the call has one (the CLI takes the
    same five levels as `EFFORTS`). D20 records why these flags and not
    `--bare`. The request's input goes on stdin, never into an argument: the
    first user message as it is; for the retry, that message, then "Your
    previous reply was:" and the first reply, then the validation message
    `ask()` already writes. `env` is dbtruth's own environment without
    `ANTHROPIC_API_KEY`, so the call runs under the Claude Code login the
    disclosure names, with `CLAUDE_CODE_MAX_OUTPUT_TOKENS` set to
    `modelMaxOutputTokens`.
  - **The reply:** stdout is one JSON object. `is_error: true` becomes one
    sentence with its `subtype` and the first line of `result`; a
    `stop_reason` of `refusal` becomes the API path's refusal sentence; a
    non-zero exit becomes "Claude Code exited with <code>: <its last stderr
    line>"; no exit within `claudeCodeTimeoutSeconds` kills the process and
    names the tunable. Otherwise the reply text is
    `JSON.stringify(structured_output)` when that field is present, else
    `result`, and `ask()` validates it and retries once exactly as on the API
    path (the raw replies saved after a second failure). `usage.input_tokens`
    and `usage.output_tokens`, when present, feed `usage()`. The field names
    follow Claude Code's headless documentation; the manual run (A7) records
    the real reply, and if it differs the parser and the fake change together
    in one commit.
  - **Preflight**, before the database is touched, with no model call: the
    CLI is found; `<claude> --version` answers; `<claude> auth status --json`
    reports a login (its fields are read from the installed CLI while
    building, which costs no tokens, and the fake mirrors them). Each
    failure is one sentence (not found, shim refused, not signed in: "run
    claude and sign in, then run dbtruth again").
- **`cli.ts`:** `--backend` on the full run; the disclosure line becomes, for
  this backend, `Sending to <model> through Claude Code <version>, on your own Claude subscription, not an API key, at effort ...`
  followed by today's text, or names the login method `auth status` reports
  when it is not a subscription; the tokens line as today, when usage came
  back. `check`, `mcp` and `init` never start the CLI.
- **`doctor.ts`:** `doctor --backend claude-code` (or the variable) replaces
  the key check with three lines: the CLI found, with its version and path;
  the login; and one trivial call through the same transport (a two-line
  system prompt asking for `{"ok": true}`, a one-property schema), which the
  line says spends a few tokens of the subscription. With the default
  backend, no key and a CLI found, the existing "no API key" note adds
  "Claude Code is installed at <path>: dbtruth --backend claude-code runs
  step 1 on your subscription", without calling it. The header comment of
  `doctor.ts` says which check spends tokens.
- **`structure.test.ts`:** only `cli.ts` and `model.ts` import
  `node:child_process` (Appendix B).
- **`test/fake-claude/claude.mjs`** (with a `claude` shell launcher that runs
  it, committed executable, for `PATH` on Linux and macOS; on Windows the
  tests point `DBTRUTH_CLAUDE_PATH` at the `.mjs`): answers `--version`,
  `auth status --json` and `-p` calls by
  `FAKE_CLAUDE_MODE` (`valid`, `malformed-then-valid`, `malformed`,
  `refusal`, `exit-1`, `hang`, `signed-out`), writes its argv, cwd, stdin and
  environment names to `FAKE_CLAUDE_LOG`, and keeps its call count in
  `FAKE_CLAUDE_STATE`, both files in the test's own temporary directory.
- **README:** step 1 and the quick start name `--backend claude-code` for
  Claude Code users with no API key, with this note: "For personal, local
  use with your own Claude subscription. Check Anthropic's terms for your
  plan before relying on it for anything else; for CI and teams, use an API
  key." "Tuning" gains the two settings; Troubleshooting gains a row for
  each new sentence.

**Edge cases.** No CLI on `PATH` and no variable (the sentence names
`DBTRUTH_CLAUDE_PATH` and the VS Code location). Only `claude.cmd` on Windows
(refused). `DBTRUTH_CLAUDE_PATH` to a missing file. A `.mjs` path. Not signed
in. An older CLI that lacks a flag (a non-zero exit quoting "unknown option";
Troubleshooting says to update Claude Code). `ANTHROPIC_API_KEY` also set
(not passed to the CLI; the disclosure is still true). A reply without
`structured_output` (the `result` text is validated). A reply cut short (fails
validation, retried once). The CLI closing stdin early (`EPIPE`, one
sentence). The temporary directory removed after a failure too. Two calls in
one run, each in its own directory. `--backend claude-code` with `check` or
`mcp` (not an option there).

**Tests** (`claude-code.test.ts` unless named; no test calls a model):
1. "a valid reply is validated with the prompt's schema and returned with its
   token usage".
2. "a malformed reply is retried once with the validation error, and the
   second reply is used": the log holds two calls, and the second stdin holds
   the first reply and the error.
3. "a reply malformed twice saves both replies and fails in one sentence".
4. "a refusal is one sentence, and nothing is retried".
5. "a non-zero exit is one sentence quoting the CLI's last stderr line".
6. "a call past claudeCodeTimeoutSeconds is killed and named": `hang` with
   the tunable at 1; the fake's process is gone when the call returns.
7. "the request's input goes on stdin and never into an argument": in
   `valid` mode with the log, argv equals the list above exactly; no argv
   element contains a marker string planted in the user message; stdin
   equals the message; the cwd was an empty directory and no longer exists;
   the child's environment has no `ANTHROPIC_API_KEY`.
8. "Claude Code is found through DBTRUTH_CLAUDE_PATH or on PATH, a script
   path runs with this Node, and a lone .cmd on Windows is refused": the
   pure lookup with an injected file check, on every system; on Linux and
   macOS also the fake's launcher on a real `PATH`.
9. "both prompts' schemas convert to JSON Schema, and each call's argv stays
   under 30,000 characters" (Windows allows 32,767).
10. "preflight finds the CLI, its version and its login, or says which is
    missing, before any database work" (`signed-out`, not found, shim).
11. `doctor.test.ts`: "with the claude-code backend, doctor reports the CLI,
    the login and a trivial call"; "with no key and a CLI on PATH, doctor
    suggests the backend and makes no -p call" (the log holds none).
12. `integration.test.ts` (`test:db`): "a full offline run through the Claude
    Code backend reaches fakeModel's verdicts": the fake answers prompt A
    with the fixture's canned claims and prompt B with fixed files; the
    verdicts equal those of the `fakeModel` run; stderr holds the disclosure
    naming Claude Code and the tokens line; exit code as the `fakeModel`
    run's.
13. `config.test.ts`: `backend` values, variable and flag, an unknown value
    refused; `claudeCodeTimeoutSeconds` range, variable and flag.
14. `structure.test.ts`: only `cli.ts` and `model.ts` import
    `node:child_process`.
15. `readme.test.ts`: the note, the option in step 1 and the quick start, and
    a Troubleshooting row for every new sentence.

**Acceptance.**
- A1 With `--backend claude-code` or `DBTRUTH_BACKEND=claude-code` and no
  `ANTHROPIC_API_KEY`, a full run reaches the same verdicts as the API path
  with the same replies (test 12).
- A2 Each model request is one pinned, single-shot CLI call: the argv of D20
  exactly, the input on stdin only, an empty temporary directory removed
  after, no API key in the child's environment (tests 7 and 9).
- A3 Replies are validated and retried exactly as on the API path; a refusal,
  a non-zero exit and a timeout each end in one sentence (tests 1 to 6).
- A4 The disclosure names Claude Code and the user's own subscription before
  the first call, and the tokens line appears when the CLI reports usage.
- A5 `doctor` says whether the backend can run (CLI, login, a trivial call),
  and suggests it when there is no key and the CLI is there (test 11).
- A6 README step 1 and the quick start name the option with the note, and
  Troubleshooting has a row for every new sentence.
- A7 Manual, HUMAN (the maintainer's Claude Code login): after
  `npm run build`, in an empty directory with no `ANTHROPIC_API_KEY` and
  `DBTRUTH_CLAUDE_PATH` set to the VS Code extension's `claude.exe` (its path
  holds the extension's version, so it changes when the extension updates),
  run `node <repo>/dist/cli.js --backend claude-code --url postgres://dbtruth:dbtruth@localhost:54329/fixture`;
  record in `acceptance/manual.json` and PROGRESS.md: `claude --version`, the
  disclosure line, the summary and exit code, the tokens line, the time, the
  verdict counts beside the recorded API run on `fixture` (`fixture-r4c`, 12
  verdicts), and the field names of the CLI's real reply.

**Sabotage.** Pass the input as an argument: test 7 fails. Drop the retry for
this transport: test 2 fails. Do not kill the process at the timeout: test 6
fails at its limit. Pass `--bare`: test 7's argv assertion fails.

**Docs.** NOTES "A Claude Code backend": what and why (T5.3, the maintainer's
decision), the flags and why not `--bare` (D20), stdin and never argv, the
environment without the API key, the Windows rule, what was not done (an
agent loop, sessions, streaming, running it in CI; the output-token limit is
Claude Code's). README as above. CHANGELOG.

---

#### T8.13 Release 0.5.0 (P0; publish HUMAN)

**Why.** Section 6.

**Build.** The checklist of section 6, each step recorded in PROGRESS.md.

**Acceptance.**
- A1 Every checklist step is recorded with its evidence.
- A2 The published package passes the smoke test of section 6.
- A3 HUMAN, the day of `npm publish`: the Action's branch of T8.11 merged,
  `v1` moved to it, the Marketplace notes published (links in PROGRESS.md).
- A4 HUMAN, live (the key lives in `dbtruth-live`): a full run on `tenancy`
  with the release build, where prompt A proposes `within` for at least
  `orders.customer_id`, `invoices.customer_id` and `tasks_nv.project_id`
  (the declared key that holds the tenant), and the `order_items.product_id`
  walk through `orders`; whether it proposes the `refunds` path on the
  target side is recorded (reply excerpts in `acceptance/manual.json`).
- A5 The manual acceptance numbers of T8.9 and T8.12 are in NOTES.

**Docs.** NOTES section "0.5.0"; CHANGELOG dated.

---

## 6. Release 0.5.0 (the T7.1 checklist applied)

| Release | Contains |
|---|---|
| 0.5.0 | T8.2 to T8.12, less any task the maintainer deferred (section 0), which ships in 0.5.1. T8.1 and T8.9 ship no code of the package: fixtures, tests and scripts. |

1. `npm run verify` green locally and on every CI cell (Postgres 12, 14, 16,
   18; Node 20, 22).
2. `npm run acceptance` prints 100 for T0.1 to T7.1 and for T8.1 to T8.12,
   less any deferred task. T8.13 is this checklist and is scored after it.
3. `npm pack --dry-run` lists `dist/`, `dist/prompts/` (both prompts),
   `skills/`, `README.md`, `LICENSE`, and nothing from `src/`, `test/`,
   `scripts/scale/` or `context/`.
4. The CHANGELOG entry and a NOTES section "0.5.0", with the manual numbers of
   T8.9 and T8.12.
5. README fixture output regenerated from a live run, and the live run on
   `tenancy` of T8.13 A4 (HUMAN: the key lives in `dbtruth-live`).
6. Version 0.5.0 in `package.json`, tag `v0.5.0`, GitHub release notes that
   say: a 0.4.x `check` cannot read a 0.5 snapshot of format 2 (one with a
   composite key, a tenant scope or a partitioned table); the Action's
   default moves; partitioned tables' numbers move once on the first full
   run; `--backend claude-code` is for personal, local use.
7. `npm publish` (HUMAN, 2FA).
8. The Action's branch of T8.11 merged and `v1` moved the same day (HUMAN,
   T8.13 A3).
9. Smoke test of the published package in an empty directory:
   `npx -y dbtruth@0.5.0 --version`; `--help` lists `--backend`; `doctor`
   against the fixture; `check` against the committed 0.4.2 `fixture`
   snapshot (exit 0, the one settings note) and against a 0.5 `tenancy` one;
   `npx -y dbtruth@0.4.2 check` on that `tenancy` snapshot (exit 1, the
   upgrade sentence).
10. Manual acceptance (BUILD_PLAN 5.5): the published package against Pagila,
    recorded in NOTES beside T8.9's numbers. Anything false is a blocker.
11. HUMAN: reply on issue #19 and in the r/mcp thread with what 0.5.0 measures
    (the buckets, the parent walk on either side, where the problems live by
    tenant and partition) and its limits (the detection floor, sampled
    counts, D3, a keyed hop into a partitioned parent at hundreds of leaves),
    and any task deferred, with its reason. The README's privacy warning
    stays as it is.

---

## Appendix A: files this plan adds or changes

| File | Tasks |
|---|---|
| `scripts/acceptance.mjs`, `test/acceptance.test.ts`, `CLAUDE.md`, `PROGRESS.md`, `acceptance/checks.json`, `acceptance/manual.json` | T8.1, then every task |
| `test/fixtures/tenancy.sql`, `test/fixtures/partitions.sql`, `test/fixtures/template.sql`, `docker-compose.yml`, `test/ci.test.ts`, `test/copies.ts`, `test/canned.ts` | T8.1 |
| `test/fixtures/snapshots/0.4.2/*.json`, `test/fixtures/snapshots/live/*.json`, `test/fixtures.test.ts`, `test/compat.test.ts`, `test/partitions.test.ts`, `test/tenancy.test.ts`, `test/join.test.ts`, `package.json` (test lists, version) | T8.1 to T8.8, T8.13 |
| `src/extract.ts` (`listKeys`, leaves with names, per-leaf pilot, the profile fallback, `modelView` sizing) | T8.2, T8.4 |
| `src/safety.ts` (`leafSeed`, `leafDraw`, `sampleSource` options, the retry rule) | T8.4 |
| `src/schemas.ts` (`ForeignKey`, `uniqueKeys`, `leaves`, `modelView`, `declares`, `schemaOnly`, `also`, `within` with `path` and `toPath`, normalization, ids, `namesOf`, `SNAPSHOT_FORMAT`, `measuredWith`, `breakdown`, `crossTenantBefore`, `TableFacts.uniqueKeys`) | T8.2 to T8.8 |
| `src/join.ts` (new, pure) | T8.5 to T8.8 |
| `src/where.ts` (new, pure: the where-lines), `test/where.test.ts` | T8.8 |
| `src/verify.ts` (validation, empty rule, scoped and tuple measurement, breakdown pass) | T8.4 to T8.8 |
| `src/verdict.ts` (3.11, `breakdown` copied) | T8.6, T8.8 |
| `src/snapshot.ts` (format 2, `formatFor`, `measuredWithOf`) | T8.3 to T8.7 |
| `src/check.ts` (`namesOf`, cross-tenant rules, `side()`, where-lines through `where.ts`) | T8.5, T8.6, T8.8 |
| `src/config.ts` (Appendix C, `backend`) | T8.4, T8.6 to T8.8, T8.12 |
| `src/write.ts` (`joinLine`, twin clause, rejected scope line, where-lines through `where.ts`, `fitForWriter`) | T8.4 to T8.8 |
| `src/contextualize.ts` (sends `modelView`) | T8.2 |
| `src/mcp.ts` (`also`, tenant keys and paths, hop lookups and extract, where-lines) | T8.2, T8.5 to T8.8 |
| `src/cli.ts` (summary, flags, the backend's disclosure) | T8.4, T8.6 to T8.8, T8.12 |
| `src/model.ts` (the JSON Schema argument, the Claude Code transport and preflight), `src/doctor.ts` (the backend's checks), `test/claude-code.test.ts`, `test/fake-claude/*` | T8.12 |
| `src/prompts/contextualize.md`, `src/prompts/write.md` | T8.5 to T8.8 |
| `skills/dbtruth/SKILL.md` | T8.6, T8.7, T8.10 |
| `scripts/make-fixture-snapshot.mjs` (`--database`, `--claims`), `scripts/scale/*` | T8.9, T8.11 |
| `README.md`, `NOTES.md`, `CHANGELOG.md` | every task; T8.10 |
| repository `dbtruth-action` (`action.yml`, `scripts/check.sh`, workflow, vendored SQL and snapshot, README) | T8.11, T8.13 |

## Appendix B: `structure.test.ts` after this plan

```
join.ts        safety, schemas                  (new; pure: builds SQL, runs nothing)
where.ts       schemas                          (new; pure: the where-lines)
verify.ts      safety, schemas, config, join
write.ts       model, schemas, where
check.ts       schemas, config, extract, verify, verdict, snapshot, safety, where
mcp.ts         config, safety, extract, verify, verdict, schemas, snapshot, check, write, where
```

Every other row is unchanged: `contextualize.ts` already imports `schemas`,
where `modelView` lives; `model.ts` still imports only `config`; `check.ts`
and `snapshot.ts` still reach no `model.ts` (`where.ts` imports only
`schemas`). Three assertions are added: `join.ts` never calls `db.` (a source
scan for `/\bdb\./`); the R4 literal scan of T8.6; and only `cli.ts` and
`model.ts` import `node:child_process` (T8.12).

## Appendix C: new tunables in `config.ts`

Each gets its comment, an `overridable` row, a `DBTRUTH_*` variable, a flag, a
README Tuning row and a `config.test.ts` case (R5).

| Name | Default | Range | Variable / flag | In `measuredWith` | Comment (what breaks) | Task |
|---|---|---|---|---|---|---|
| `sampleMaxLeaves` | 256 | integer 0 to 1024; 0 samples a partitioned table as one relation, as 0.4 did | `DBTRUTH_SAMPLE_MAX_LEAVES` / `--sample-max-leaves` | yes, optional; absent means 0 | Leaves sampled each with its own seed, in one statement; above it, one leaf in 2^k by a draw on its name. Too high: every kept query on such a table grows by about 150 characters per leaf. Too low: fewer leaves are read on a very partitioned table. 0: every leaf is sampled at the same page positions, and a table of small leaves can come back empty. | T8.4 |
| `crossTenantMaxShare` | 0 | 0 to 1 | `DBTRUTH_CROSS_TENANT_MAX_SHARE` / `--cross-tenant-max-share` | yes, optional; absent means this run's | A scoped join is broken when more than this share of its sampled rows match only under another tenant. Too high: a real cross-tenant leak reads confirmed. Above 0: a leak below the share passes silently. | T8.6 |
| `tenantPathMaxHops` | 3 | integer 0 to 10 | `DBTRUTH_TENANT_PATH_MAX_HOPS` / `--tenant-path-max-hops` | no: it bounds untrusted input, so it is always this run's | Steps a claim's tenant path may take to the table holding the tenant. Too low: a deep normalized schema cannot be scoped. Too high: a claim, or an edited snapshot, makes one statement join many tables per sampled row. | T8.7 |
| `breakdownMaxRows` | 5 | integer 0 to 100; 0 turns breakdowns off | `DBTRUTH_BREAKDOWN_MAX_ROWS` / `--breakdown-max-rows` | no: it changes no verdict | Groups kept per dimension, most problems first; the rest are summed into one. Too high: long files, comments and MCP answers. Too low: a second problem place goes unnamed. | T8.8 |
| `claudeCodeTimeoutSeconds` | 600 | integer 1 to 3600 | `DBTRUTH_CLAUDE_CODE_TIMEOUT_SECONDS` / `--claude-code-timeout-seconds` | no: it changes no verdict | How long one Claude Code call may run before it is killed. Too low: prompt B on a large schema is cut off and the run fails. Too high: a CLI that hangs holds the run that long. | T8.12 |

`backend` (`api` or `claude-code`, `DBTRUTH_BACKEND` / `--backend`) is a
choice, not a number, and is checked the way `modelEffort` is (T8.12).

## Appendix D: format changes

- **Snapshot:** `"snapshot": 2` when a claim has `also` or `within` or names a
  partitioned table, otherwise 1 (D5). Readers accept 1 and 2. New,
  optional: a claim's `also` and `within`; a verdict measurement's
  `breakdown`; `measuredWith.sampleMaxLeaves` (absent: 0) and
  `measuredWith.crossTenantMaxShare` (absent: this run's). A scoped claim as the
  snapshot stores it (keys canonical):

  ```json
  {
    "basis": "inferred",
    "confidence": 0.8,
    "from": { "column": "product_id", "table": "order_items" },
    "reason": "tenant through the order",
    "to": { "column": "id", "table": "products" },
    "within": { "column": "tenant_id", "path": [{ "column": "order_id", "key": "id", "table": "orders" }], "toColumn": "tenant_id" }
  }
  ```

- **Check report:** `"report": 1`, the same class set. A claim gains the
  optional `crossTenantBefore`; `after.measurement` carries the new numbers and
  the optional `breakdown`. `check.sh` needs no parsing change.
- **Extract (internal and prompt A):** `foreignKeys` entries are
  `{column, refTable, refColumn}` or `{columns, refTable, refColumns}`, with
  `period: true` on a temporal key; `uniqueKeys` and `leaves` exist on
  `Table` but never reach prompt A.
- **MCP:** `measure_join` gains the optional `also`, `tenant_column`,
  `to_tenant_column`, `tenant_path` and `to_tenant_path`; the six existing
  keys and their refine are unchanged. `describe_table` shows a composite FK
  once and no partition targets.
- **Model transport (internal):** `Transport` takes an optional JSON Schema
  of the reply (T8.12); the API transport ignores it.

## Appendix E: later work (not in this plan)

**From the audit** (verdict P0 1 to 3, P1 6 to 13 except 12, P2):
- per-transaction settings, a client timeout and keepalive (poolers);
- `row_security = off` and a `doctor` note (RLS);
- the value-visibility rule and key types (domain, `bpchar`, `citext`);
- coverage of wide schemas, views-first ordering, "not examined" in place of
  "unknown table";
- model output limits and `charsPerToken`;
- `dead_table` measured against a reference time;
- keyed probes through non-PK unique keys for the existing single-column joins
  (P1 9: one line in `keyed()` now);
- `--schema` and `--exclude-schema`;
- the "not weighed (time budget)" label;
- column grants;
- the MCP `check` reply size;
- range checks on every snapshot setting;
- every P2 item.

**Beyond issue #19:**
- a condition on the target side, such as soft-deleted parents;
- a full, non-sampled cross-tenant count for rare leaks;
- a floor for sampled cross-tenant counts in `check` (the rule of three, or
  a count that must also move outside the sample's noise), so a row that only
  entered the sample is not a regression (3.12, scenario 10);
- a claim flag for designs where rows of no tenant are wrong;
- time buckets on tables that are not partitioned;
- orphan ends for tuples, text, uuid and dates;
- a keyed probe into a partitioned target or parent that avoids probing every
  leaf (partition pruning through the key);
- tables partitioned by inheritance, TimescaleDB hypertables among them:
  sampled per child, and a parent of no pages of its own not read as empty
  from the catalog (R14);
- measuring a temporal key's `PERIOD` pair as range containment, and a MATCH
  FULL key's partial NULLs as violations (D19);
- a scope read from declared RLS policies (a catalog fact, not a name);
- `inconsistent_values` telling an empty sample from an all-null column
  precisely;
- a Claude Code backend for `check` or CI (T8.12 is for the full run on one
  machine);
- MySQL and other engines.

## Appendix F: risks and mitigations

| Risk | Mitigation |
|---|---|
| The per-leaf union makes kept queries long (snapshot, prompt B, MCP) | `sampleMaxLeaves` 256 with two-stage above it; arms select only the columns read; empty leaves get no arm; `fitForWriter` drops queries first; sizes are an A-item (T8.4 A7). |
| A leaf attached with another column order misaligns a union | Named columns, never `*`; `swapped_p` and its test. |
| Old snapshots re-measured with the new sampling flag false regressions | `sampleMaxLeaves` absent reads 0 (R13); `compat.test.ts` in every task. |
| Format 2 breaks users who pin the Action | The default moves the same day; the hint line; the README upgrade table; the smoke test with 0.4.2. |
| The planner copies the per-row CASE into every FILTER | The fence is mandatory; an `EXPLAIN (ANALYZE)` test counts the loops over the target, which reads the same on Postgres 12 to 18. |
| A per-row probe on a column no index leads with | The keyed rule of 3.6; loop counts on the hashed forms; `task_notes` exercises the grouped hop; D17 restricts every hashed or grouped read to the sampled values; timings at scale (T8.9). |
| A hop or target partitioned into hundreds of leaves is probed per leaf | Measured on 12 leaves (`order_items_p`) and at 24 and 500 leaves (T8.9); past the statement timeout it ends `unverifiable` with the reason; the README states T8.9's outcome; pruning is later work. |
| A wrong scope claim raises a false alarm, or puts a wrong predicate in front of agents | A scope most rows fail is rejected (D3) and never written as a join; the prompt limits scopes to tenant-like columns on both rows; every line names both columns and says inferred; `check` fails only on change, and never on a rejected scope. |
| A real majority leak is read as a rejected scope | Judged improbable, and not silent: the rejected scope's line gives its cross-tenant count in the file and the summary, and the unscoped line on the same columns says how many of its matches are under another tenant (D3, 3.14); a move from confirmed or broken to rejected is still a regression. The run still exits 0 on a claim first measured this way: recorded as a known limit. |
| A cross-tenant row enters the sample with no row changed, and `check` calls it a regression | Recorded in NOTES and README; the where-line names the partition, which tells a reviewer the rows are old (scenario 10); a floor for sampled counts is later work. |
| Claude Code's flags or reply shape change under the backend (T8.12) | The flags were checked against 2.1.283 (D20); a missing flag ends in a sentence that says to update Claude Code; the manual run records the real reply, and the fake follows it; the API path is unchanged and stays the default. |
| Using a subscription through a tool breaks a plan's terms | Opt-in only; the README says it is for personal, local use and to check Anthropic's terms for one's plan; an API key stays the documented path for CI and teams. |
| Rare cross-tenant rows are missed by the sample | The floor `3 / total` is stated on every confirmed scoped line; a full count is later work. |
| Tenant values leak through labels or error messages | The categorical gate, ranks otherwise, the `wider` guard; only `::text` casts, whose errors quote no value; canary tests on slugs, names and uuids in every output. |
| `SYSTEM`'s page choice differs across Postgres versions | Preconditions asserted on every matrix cell; sampled assertions use bands; oracles read whole tables. |
| Prompt changes shift what the model proposes on existing schemas | Single-column FK entries byte-identical; every existing rule kept; the recorded replays; the live A-items. |
| The model proposes no scope, so the feature is invisible | Canned tests prove the measurement; `measure_join` lets an agent ask; the skill tells agents to; without a claim, output is as in 0.4. |
| CI load time of about 1,150 partition tables on eight cells | fillfactor keeps rows few; measured in T8.1 A6; the 1,000-leaf bound is a unit test of the builder. |
