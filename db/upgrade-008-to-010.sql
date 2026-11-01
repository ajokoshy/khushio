-- Khushio upgrade: migrations 008, 009 and 010 in one file.
-- Safe to run more than once (every statement is idempotent) and safe if you already ran 008 and/or 009.
-- Run in the Neon SQL Editor against your existing database BEFORE deploying the new code. Try it on a Neon branch first.

-- ================= 008_integrity_and_lifecycle.sql =================
-- 008: offer/deal/coupon lifecycle, merchant approved domains, timestamps, SEO fields, click context, import staging
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
UPDATE deals SET expires_at = (ends::date + interval '23 hours 59 minutes 59 seconds' - interval '5 hours 30 minutes')
  WHERE expires_at IS NULL AND ends ~ '^\d{4}-\d{2}-\d{2}$';

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

-- ================= 009_offer_prices_fks_search_redirects.sql =================
-- 009: offer-level prices, real brand/category foreign keys, category hierarchy, redirects, full-text search
ALTER TABLE offers ADD COLUMN IF NOT EXISTS price integer;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS mrp integer;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS price_checked_at timestamp;
-- Start every offer from the product's reference price. price_checked_at stays NULL: nobody has verified it per retailer yet.
UPDATE offers o SET price = p.price, mrp = p.mrp FROM products p WHERE o.product_id = p.id AND o.price IS NULL;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE RESTRICT;
UPDATE products p SET brand_id = b.id FROM brands b WHERE p.brand_id IS NULL AND b.slug = p.brand;
UPDATE products p SET category_id = c.id FROM categories c WHERE p.category_id IS NULL AND c.slug = p.category;
CREATE INDEX IF NOT EXISTS products_status_created_idx ON products (status, created_at);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand);

CREATE TABLE IF NOT EXISTS redirects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path   text NOT NULL UNIQUE,
  to_path     text NOT NULL,
  status      integer NOT NULL DEFAULT 301,
  note        text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);

-- Full-text search over name (A), brand (B), category and blurb (C). 'simple' keeps Indian brand names intact (no English stemming).
ALTER TABLE products ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('simple', replace(coalesce(brand, ''), '-', ' ')), 'B') ||
  setweight(to_tsvector('simple', replace(coalesce(category, ''), '-', ' ') || ' ' || coalesce(blurb, '')), 'C')
) STORED;
CREATE INDEX IF NOT EXISTS products_search_idx ON products USING gin (search);

-- ================= 010_content_cms.sql =================
-- 010: content and media CMS (media library, articles, pages, homepage sections, navigation, occasions, comparisons, click roll-up)
CREATE TABLE IF NOT EXISTS media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL DEFAULT 'cloudinary',
  public_id   text NOT NULL UNIQUE,
  hash        text UNIQUE,                 -- sha256 of the uploaded file: the same picture is never stored twice
  alt         text NOT NULL DEFAULT '',
  width       integer,
  height      integer,
  bytes       integer,
  format      text,
  created_at  timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS article_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0
);

ALTER TABLE articles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS publish_at timestamp;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES article_categories(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS product_slugs text[] NOT NULL DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_media_id uuid REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS seo_description text;
CREATE INDEX IF NOT EXISTS articles_tags_idx ON articles USING gin (tags);
CREATE INDEX IF NOT EXISTS articles_products_idx ON articles USING gin (product_slugs);
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status, publish_at);

-- Only the last few revisions of an article are kept (pruned on every save).
CREATE TABLE IF NOT EXISTS article_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  excerpt     text NOT NULL DEFAULT '',
  body        text NOT NULL,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS article_revisions_article_idx ON article_revisions (article_id, created_at);

-- Only customised pages are stored; pages never edited use the built-in default text.
CREATE TABLE IF NOT EXISTS pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  seo_description text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'published',
  updated_at      timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  enabled       boolean NOT NULL DEFAULT true,
  publish_at    timestamp,
  unpublish_at  timestamp,
  config        jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nav_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu      text NOT NULL,
  label     text NOT NULL,
  href      text NOT NULL,
  position  integer NOT NULL DEFAULT 0,
  enabled   boolean NOT NULL DEFAULT true,
  new_tab   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS nav_items_menu_idx ON nav_items (menu, position);

CREATE TABLE IF NOT EXISTS gift_occasions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  intro       text NOT NULL DEFAULT '',
  categories  text NOT NULL DEFAULT '',
  min_price   integer,
  max_price   integer,
  query       text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS comparisons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  intro          text NOT NULL DEFAULT '',
  verdict        text NOT NULL DEFAULT '',
  product_slugs  text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'published',
  updated_at     timestamp DEFAULT now()
);

ALTER TABLE deals ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
UPDATE deals SET slug = trim(both '-' from left(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), 50)) || '-' || left(id::text, 6) WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS deals_slug_idx ON deals (slug);

-- Daily totals kept after raw click rows are pruned, so history survives in a few bytes per offer per day.
CREATE TABLE IF NOT EXISTS click_daily (
  day          date NOT NULL,
  offer_id     uuid NOT NULL,
  merchant_id  uuid,
  clicks       integer NOT NULL,
  PRIMARY KEY (day, offer_id)
);
