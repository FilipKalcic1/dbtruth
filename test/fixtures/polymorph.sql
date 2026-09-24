-- A polymorphic reference, and orphans that fall in different places. Every problem below is
-- deliberate.
--
--   1. comments.commentable_id points at posts where commentable_type = 'post' and at photos
--      where it is 'photo'. The 300 post rows point at posts 1 to 100, three each, and all exist.
--      The 180 photo rows point at photos 1 to 60, three each, but photos stops at 40: 120 of 180
--      match (66.7%), and all 60 orphans are above the highest photos.id. Measured without its
--      condition, the reference matches all 480 rows, because every photo id from 1 to 60 is
--      also a post id.
--   2. accounts holds ids 1 to 50 except 10 to 19, as if deleted: 40 rows over a range of 50.
--      invoices.account_id runs over 1 to 50, four invoices each: 160 of 200 match (80%), and all
--      40 orphans are inside the accounts.id range.
--   3. No foreign key is declared. The text columns hold canary-pii and are hidden.
--
-- Autovacuum is off on every table here, so nothing changes the catalog's row estimates behind a
-- test's back.
CREATE DATABASE polymorph;
\connect polymorph
CREATE TABLE posts (id integer PRIMARY KEY, title text NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO posts SELECT i, 'canary-pii post ' || i FROM generate_series(1, 100) AS i;
CREATE TABLE photos (id integer PRIMARY KEY, caption text NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO photos SELECT i, 'canary-pii photo ' || i FROM generate_series(1, 40) AS i;
CREATE TABLE comments (id integer PRIMARY KEY, commentable_type text NOT NULL, commentable_id integer NOT NULL, body text NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO comments SELECT i, CASE WHEN i <= 300 THEN 'post' ELSE 'photo' END, CASE WHEN i <= 300 THEN 1 + i % 100 ELSE 1 + i % 60 END, 'canary-pii comment ' || i FROM generate_series(1, 480) AS i;
CREATE TABLE accounts (id integer PRIMARY KEY, name text NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO accounts SELECT i, 'canary-pii account ' || i FROM generate_series(1, 50) AS i WHERE i NOT BETWEEN 10 AND 19;
CREATE TABLE invoices (id integer PRIMARY KEY, account_id integer NOT NULL) WITH (autovacuum_enabled = false);
INSERT INTO invoices SELECT i, 1 + i % 50 FROM generate_series(1, 200) AS i;
ANALYZE;
