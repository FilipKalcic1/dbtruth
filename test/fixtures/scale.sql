-- 300 generated tables for the scale test: budget respected, output still renders.
CREATE DATABASE scale;
\connect scale
DO $$
BEGIN
  FOR i IN 1..300 LOOP
    EXECUTE format('CREATE TABLE t_%s (id int PRIMARY KEY, ref_id int, kind text NOT NULL, amount numeric NOT NULL, created_at timestamptz NOT NULL)', i);
    EXECUTE format('INSERT INTO t_%s SELECT g, 1 + g %% 200, (ARRAY[''a'',''b'',''c''])[1 + g %% 3], g * 1.5, now() - (g || '' hours'')::interval FROM generate_series(1, 200) g', i);
  END LOOP;
END $$;
ANALYZE;
