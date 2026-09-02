-- A clean ten-table database with nothing wrong: every FK declared and valid,
-- every table keyed and populated, every enum consistent. Used to check that
-- the tool says "you probably don't need this" when there is nothing to find.
CREATE DATABASE clean;
\connect clean

CREATE TABLE roles (
  id    integer PRIMARY KEY,
  name  text NOT NULL UNIQUE
);
INSERT INTO roles VALUES (1, 'admin'), (2, 'editor'), (3, 'reader');

CREATE TABLE users (
  id          integer PRIMARY KEY,
  handle      text NOT NULL UNIQUE,
  role_id     integer NOT NULL REFERENCES roles(id),
  created_at  timestamptz NOT NULL
);
INSERT INTO users
SELECT i, 'user' || i, 1 + i % 3, now() - (i || ' days')::interval
FROM generate_series(1, 40) AS i;

CREATE TABLE categories (
  id    integer PRIMARY KEY,
  slug  text NOT NULL UNIQUE
);
INSERT INTO categories VALUES (1, 'news'), (2, 'howto'), (3, 'opinion'), (4, 'release');

CREATE TABLE posts (
  id            integer PRIMARY KEY,
  author_id     integer NOT NULL REFERENCES users(id),
  category_id   integer NOT NULL REFERENCES categories(id),
  state         text NOT NULL,
  word_count    integer NOT NULL,
  published_at  timestamptz
);
INSERT INTO posts
SELECT i, 1 + i % 40, 1 + i % 4,
       (ARRAY['draft','published','archived'])[1 + i % 3],
       200 + (i * 53) % 1800,
       CASE WHEN i % 3 = 1 THEN now() - (i || ' hours')::interval END
FROM generate_series(1, 120) AS i;

CREATE TABLE comments (
  id          integer PRIMARY KEY,
  post_id     integer NOT NULL REFERENCES posts(id),
  author_id   integer NOT NULL REFERENCES users(id),
  approved    boolean NOT NULL,
  created_at  timestamptz NOT NULL
);
INSERT INTO comments
SELECT i, 1 + i % 120, 1 + i % 40, i % 5 <> 0, now() - (i || ' minutes')::interval
FROM generate_series(1, 400) AS i;

CREATE TABLE tags (
  id    integer PRIMARY KEY,
  name  text NOT NULL UNIQUE
);
INSERT INTO tags
SELECT i, 'tag' || i FROM generate_series(1, 12) AS i;

CREATE TABLE post_tags (
  post_id  integer NOT NULL REFERENCES posts(id),
  tag_id   integer NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);
INSERT INTO post_tags
SELECT DISTINCT 1 + i % 120, 1 + (i * 7) % 12 FROM generate_series(1, 300) AS i;

CREATE TABLE media (
  id        integer PRIMARY KEY,
  post_id   integer NOT NULL REFERENCES posts(id),
  kind      text NOT NULL,
  bytes     integer NOT NULL
);
INSERT INTO media
SELECT i, 1 + i % 120, (ARRAY['image','video','audio'])[1 + i % 3], 1000 + (i * 977) % 900000
FROM generate_series(1, 150) AS i;

CREATE TABLE settings (
  id        integer PRIMARY KEY,
  user_id   integer NOT NULL UNIQUE REFERENCES users(id),
  theme     text NOT NULL,
  digest    boolean NOT NULL
);
INSERT INTO settings
SELECT i, i, (ARRAY['light','dark','system'])[1 + i % 3], i % 2 = 0
FROM generate_series(1, 40) AS i;

CREATE TABLE user_roles_history (
  id          integer PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id),
  role_id     integer NOT NULL REFERENCES roles(id),
  changed_at  timestamptz NOT NULL
);
INSERT INTO user_roles_history
SELECT i, 1 + i % 40, 1 + i % 3, now() - (i || ' days')::interval
FROM generate_series(1, 60) AS i;

ANALYZE;
