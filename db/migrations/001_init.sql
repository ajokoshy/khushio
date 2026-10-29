-- 001: initial tables
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  brand       text NOT NULL DEFAULT '',
  category    text NOT NULL,
  blurb       text NOT NULL DEFAULT '',
  price       integer NOT NULL,
  mrp         integer,
  status      text NOT NULL DEFAULT 'published',
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_status_idx   ON products (status);

CREATE TABLE IF NOT EXISTS offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  merchant    text NOT NULL,
  url         text NOT NULL
);

CREATE TABLE IF NOT EXISTS clicks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    uuid NOT NULL,
  at          timestamp DEFAULT now(),
  referrer    text
);

CREATE TABLE IF NOT EXISTS deals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  merchant    text NOT NULL,
  url         text NOT NULL,
  ends        text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  merchant    text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  url         text NOT NULL,
  created_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  excerpt     text NOT NULL DEFAULT '',
  body        text NOT NULL,
  date        text NOT NULL,
  created_at  timestamp DEFAULT now()
);
