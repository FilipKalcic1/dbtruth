-- A role for dbtruth doctor on the fixture database. Every problem below is deliberate.
--
--   1. partial may SELECT customers and orders and none of the other nine relations, so doctor
--      has relations to count that the role cannot read.
--   2. Its password holds characters a URL must escape, so the URL only works percent-encoded,
--      and the canary marker, so tests can prove it is never printed.
CREATE ROLE partial LOGIN PASSWORD 'canary-pii :/?#[]@%&=+''';
GRANT SELECT ON customers, orders TO partial;
