-- fixture_template: an untouched copy of fixture, for the tests that must change data. Each
-- makes a copy of its own, CREATE DATABASE <name> TEMPLATE fixture_template, and drops it after.
-- Every choice below is deliberate.
--
--   1. It is made by the last init file, from the postgres database: a database cannot be copied
--      while a session is connected to it, and each init file starts connected to fixture.
--   2. IS_TEMPLATE true: DROP DATABASE refuses it, so no test can drop it by mistake.
--   3. ALLOW_CONNECTIONS false: no session can connect to it, so none can hold it and make a copy
--      fail, as copying fixture itself would whenever another test file is connected to fixture.
\connect postgres
CREATE DATABASE fixture_template TEMPLATE fixture IS_TEMPLATE true ALLOW_CONNECTIONS false;
