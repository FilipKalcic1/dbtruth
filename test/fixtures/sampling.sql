-- Relations the catalog has no row estimate for, and the partition trees and locks around them.
-- Every problem below is deliberate.
--
--   1. ev is partitioned by year into ev_2024, ev_2025 and ev_2026, 100,000 rows each. Only the
--      leaves are analyzed, as autovacuum does: the parent never is, so its reltuples stays -1
--      (Postgres 14 and later) or 0 (12 and 13). kind = 'only_2026' exists in the 2026 leaf only,
--      and the plain form, SELECT * FROM ev LIMIT n, reads ev_2024 first.
--   2. fresh_big holds 300,000 rows inserted after the last ANALYZE and never analyzed itself:
--      reltuples -1 (or 0 on 12 and 13) and relpages 0, over some 1,600 pages on disk. batch runs
--      from 1 to 30 in insertion order, and status = 'introduced_late' is in the last 5% of rows
--      only, which the plain form, from the oldest pages, never reaches.
--   3. nested is partitioned two levels deep: nested_1, 100,000 rows, and nested_2, itself
--      partitioned into nested_2a and nested_2b, 50,000 rows each. The three leaves are analyzed,
--      neither partitioned table is, and kind = 'only_deep' is in nested_2b only.
--   4. mixed is partitioned into mixed_remote, a foreign table over the 1,000 rows a program
--      prints, and mixed_local, 59,000 rows never analyzed. TABLESAMPLE on mixed does not sample
--      mixed_remote: Postgres reads a foreign partition whole.
--   5. analyzed is an ordinary table analyzed after its load, the one kind the catalog sizes, for
--      a test that holds it under another session's lock.
--
-- Autovacuum is off on every table here, so nothing analyzes them behind a test's back. No ANALYZE
-- of the whole database and no index built after the rows are loaded: either would fill in the
-- estimates this database exists to leave out.
CREATE DATABASE sampling;
\connect sampling

CREATE TABLE ev (
  id           integer NOT NULL,
  happened_on  date NOT NULL,
  kind         text NOT NULL
) PARTITION BY RANGE (happened_on);
CREATE TABLE ev_2024 PARTITION OF ev FOR VALUES FROM ('2024-01-01') TO ('2025-01-01') WITH (autovacuum_enabled = false);
CREATE TABLE ev_2025 PARTITION OF ev FOR VALUES FROM ('2025-01-01') TO ('2026-01-01') WITH (autovacuum_enabled = false);
CREATE TABLE ev_2026 PARTITION OF ev FOR VALUES FROM ('2026-01-01') TO ('2027-01-01') WITH (autovacuum_enabled = false);
INSERT INTO ev
SELECT i,
       make_date(2024 + (i - 1) / 100000, 1, 1) + i % 365,
       CASE WHEN i > 200000 AND i % 4 = 0 THEN 'only_2026' ELSE (ARRAY['click','view','buy'])[1 + i % 3] END
FROM generate_series(1, 300000) AS i;
ANALYZE ev_2024, ev_2025, ev_2026;

CREATE TABLE fresh_big (
  id      integer NOT NULL,
  batch   integer NOT NULL,
  status  text NOT NULL
) WITH (autovacuum_enabled = false);
INSERT INTO fresh_big
SELECT i,
       1 + (i - 1) / 10000,
       CASE WHEN i > 285000 THEN 'introduced_late' ELSE (ARRAY['active','paused','closed'])[1 + i % 3] END
FROM generate_series(1, 300000) AS i;

CREATE TABLE nested (
  id    integer NOT NULL,
  kind  text NOT NULL
) PARTITION BY RANGE (id);
CREATE TABLE nested_1 PARTITION OF nested FOR VALUES FROM (1) TO (100001) WITH (autovacuum_enabled = false);
CREATE TABLE nested_2 PARTITION OF nested FOR VALUES FROM (100001) TO (200001) PARTITION BY RANGE (id);
CREATE TABLE nested_2a PARTITION OF nested_2 FOR VALUES FROM (100001) TO (150001) WITH (autovacuum_enabled = false);
CREATE TABLE nested_2b PARTITION OF nested_2 FOR VALUES FROM (150001) TO (200001) WITH (autovacuum_enabled = false);
INSERT INTO nested
SELECT i, CASE WHEN i > 150000 AND i % 4 = 0 THEN 'only_deep' ELSE (ARRAY['click','view','buy'])[1 + i % 3] END
FROM generate_series(1, 200000) AS i;
ANALYZE nested_1, nested_2a, nested_2b;

CREATE EXTENSION file_fdw;
CREATE SERVER programs FOREIGN DATA WRAPPER file_fdw;
CREATE TABLE mixed (id integer NOT NULL) PARTITION BY RANGE (id);
CREATE FOREIGN TABLE mixed_remote PARTITION OF mixed FOR VALUES FROM (1) TO (1001)
  SERVER programs OPTIONS (program 'seq 1 1000', format 'csv');
CREATE TABLE mixed_local PARTITION OF mixed FOR VALUES FROM (1001) TO (60001) WITH (autovacuum_enabled = false);
INSERT INTO mixed_local SELECT i FROM generate_series(1001, 60000) AS i;

CREATE TABLE analyzed (id integer NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO analyzed SELECT i FROM generate_series(1, 1000) AS i;
ANALYZE analyzed;
