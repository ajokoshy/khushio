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
