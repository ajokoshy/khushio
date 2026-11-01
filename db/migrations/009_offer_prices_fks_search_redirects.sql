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
