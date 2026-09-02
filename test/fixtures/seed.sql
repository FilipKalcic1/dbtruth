-- dbtruth fixture. Every problem below is deliberate.
--
--   1. orders.customer_id -> customers.id matches only ~88% of rows. No FK is declared.
--   2. cars is empty beside a populated vehicles.
--   3. orders.status mixes 'shipped' / 'SHIPPED' and 'pending' / 'Pending'.
--   4. audit_log has no primary key.
--   5. customers carries high-cardinality fake personal data. Every such value
--      contains the marker "canary-pii" so tests can prove it never reaches the API.
--   6. products and products_legacy store the same rows.

CREATE TABLE customers (
  id          integer PRIMARY KEY,
  full_name   text NOT NULL,
  email       text NOT NULL,
  address     text,
  country     text NOT NULL,
  created_at  timestamptz NOT NULL
);
INSERT INTO customers
SELECT i,
       'canary-pii Person ' || i,
       'person' || i || '@canary-pii.example',
       CASE WHEN i % 10 = 0 THEN NULL ELSE i || ' canary-pii Street' END,
       (ARRAY['CZ','SK','DE','AT'])[1 + i % 4],
       now() - (i || ' hours')::interval
FROM generate_series(1, 250) AS i;

CREATE TABLE orders (
  id           integer PRIMARY KEY,
  customer_id  integer NOT NULL,
  status       text NOT NULL,
  total_cents  integer NOT NULL,
  created_at   timestamptz NOT NULL
);
-- 3 of every 25 rows point at a customer that does not exist: 440 of 500 match (88%).
INSERT INTO orders
SELECT i,
       CASE WHEN i % 25 < 3 THEN 9000 + i ELSE 1 + i % 250 END,
       (ARRAY['shipped','SHIPPED','pending','cancelled','Pending'])[1 + i % 5],
       (i * 37) % 20000 + 100,
       now() - (i || ' hours')::interval
FROM generate_series(1, 500) AS i;

CREATE TABLE products (
  id           integer PRIMARY KEY,
  sku          text NOT NULL UNIQUE,
  name         text NOT NULL,
  category     text NOT NULL,
  price_cents  integer NOT NULL
);
INSERT INTO products
SELECT i,
       'SKU-' || lpad(i::text, 5, '0'),
       'Product ' || i,
       (ARRAY['tools','parts','fluids'])[1 + i % 3],
       i * 150
FROM generate_series(1, 80) AS i;

CREATE TABLE products_legacy (LIKE products INCLUDING ALL);
INSERT INTO products_legacy SELECT * FROM products WHERE id <= 70;

CREATE TABLE order_items (
  id          integer PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES orders(id),
  product_id  integer NOT NULL REFERENCES products(id),
  quantity    integer NOT NULL
);
INSERT INTO order_items
SELECT i, 1 + i % 500, 1 + i % 80, 1 + i % 5
FROM generate_series(1, 1200) AS i;

CREATE TABLE vehicles (
  id             integer PRIMARY KEY,
  vin            text NOT NULL UNIQUE,
  make           text NOT NULL,
  model          text NOT NULL,
  model_year     integer NOT NULL,
  customer_id    integer REFERENCES customers(id),
  registered_at  timestamptz NOT NULL
);
COMMENT ON TABLE vehicles IS 'Fleet vehicles currently managed. Replaced the old cars table.';
INSERT INTO vehicles
SELECT i,
       'VIN' || lpad(i::text, 14, '0'),
       (ARRAY['Skoda','Volkswagen','Toyota','Ford'])[1 + i % 4],
       (ARRAY['Octavia','Fabia','Golf','Passat','Corolla','Yaris','Focus','Transit'])[1 + i % 8],
       2010 + i % 14,
       1 + i % 250,
       now() - (i || ' days')::interval
FROM generate_series(1, 120) AS i;

CREATE TABLE cars (
  id             integer PRIMARY KEY,
  vin            text,
  make           text,
  model          text,
  model_year     integer,
  customer_id    integer,
  registered_at  timestamptz
);
-- cars is intentionally empty.

CREATE TABLE audit_log (
  entity       text NOT NULL,
  entity_id    integer NOT NULL,
  action       text NOT NULL,
  actor        text NOT NULL,
  happened_at  timestamptz NOT NULL
);
-- audit_log intentionally has no primary key.
INSERT INTO audit_log
SELECT (ARRAY['order','customer','vehicle'])[1 + i % 3],
       1 + i % 100,
       (ARRAY['insert','update','delete','login'])[1 + i % 4],
       (ARRAY['system','admin','api'])[1 + (i / 7) % 3],
       now() - (i || ' minutes')::interval
FROM generate_series(1, 300) AS i;

-- Without ANALYZE, pg_class.reltuples is -1 on fresh tables.
ANALYZE;

-- 7. customers.api_token holds the same opaque secret on every row, exactly 32 characters
--    like an MD5 hash. Low cardinality, so the distinct-count gate alone would show it;
--    the value-length gate must hide it.
ALTER TABLE customers ADD COLUMN api_token text NOT NULL
  DEFAULT 'canary-pii-0123456789abcdef01234';

-- 8. A view and a partitioned table, so both kinds of relation are exercised.
CREATE VIEW shipped_orders AS
  SELECT id, customer_id, total_cents, created_at FROM orders WHERE lower(btrim(status)) = 'shipped';

CREATE TABLE events (
  id           integer NOT NULL,
  happened_on  date NOT NULL,
  kind         text NOT NULL,
  PRIMARY KEY (id, happened_on)
) PARTITION BY RANGE (happened_on);
CREATE TABLE events_2025 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE events_2026 PARTITION OF events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
INSERT INTO events
SELECT i, date '2025-01-01' + (i % 600), (ARRAY['click','view','buy'])[1 + i % 3]
FROM generate_series(1, 300) AS i;

ANALYZE;

-- 9. A materialized view that was never refreshed. Postgres refuses to read it until
--    REFRESH MATERIALIZED VIEW runs, so the tool must learn that from the catalog.
CREATE MATERIALIZED VIEW order_totals AS
  SELECT customer_id, count(*) AS orders, sum(total_cents) AS total_cents FROM orders GROUP BY customer_id
  WITH NO DATA;

-- 10. A careful user's role: SELECT only, no CREATE on the schema (the Postgres 15+ default
--     for non-owners). A CREATE TABLE attempt from it fails with 42501, not 25006, and the
--     session is read-only all the same.
CREATE ROLE reader LOGIN PASSWORD 'reader';
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
