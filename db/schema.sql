-- FULL CURRENT SCHEMA (safe to re-run). Fresh database: run this file, then optionally db/seed.sql.
-- Existing database: run only the migrations you have not applied yet (see db/README.md).

CREATE TABLE IF NOT EXISTS merchants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  website     text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);

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
  image_url   text,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_status_idx   ON products (status);

CREATE TABLE IF NOT EXISTS offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  merchant    text NOT NULL,
  url         text NOT NULL,
  merchant_id uuid REFERENCES merchants(id)
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

CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  updated_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip  text NOT NULL,
  at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_at_idx ON login_attempts (ip, at);

CREATE INDEX IF NOT EXISTS clicks_offer_at_idx ON clicks (offer_id, at);

CREATE TABLE IF NOT EXISTS brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  about       text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  icon        text NOT NULL DEFAULT 'Sparkles',
  tone        text NOT NULL DEFAULT 'sand',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_products (
  collection_id  uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at      timestamp DEFAULT now(),
  actor   text NOT NULL,
  action  text NOT NULL,
  target  text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);

-- ---- 008 additions (kept here so a fresh database gets the full schema) ----
ALTER TABLE products  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE products  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS last_verified_at timestamp;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
CREATE INDEX IF NOT EXISTS offers_product_idx  ON offers (product_id);
CREATE INDEX IF NOT EXISTS offers_merchant_idx ON offers (merchant_id);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS approved_domains text NOT NULL DEFAULT '';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS verified_at timestamp;
ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE articles  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE clicks    ADD COLUMN IF NOT EXISTS merchant_id uuid;
CREATE INDEX IF NOT EXISTS clicks_at_idx ON clicks (at);

CREATE TABLE IF NOT EXISTS import_staging (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'products',
  csv         text NOT NULL,
  created_at  timestamp DEFAULT now()
);
