-- 006: merchants table (linked from offers) and collections
CREATE TABLE IF NOT EXISTS merchants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  website     text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id);
INSERT INTO merchants (slug, name)
SELECT trim(both '-' from lower(regexp_replace(merchant, '[^a-zA-Z0-9]+', '-', 'g'))), min(merchant)
FROM offers WHERE merchant <> '' GROUP BY 1
ON CONFLICT (slug) DO NOTHING;
UPDATE offers o SET merchant_id = m.id FROM merchants m
WHERE o.merchant_id IS NULL AND m.slug = trim(both '-' from lower(regexp_replace(o.merchant, '[^a-zA-Z0-9]+', '-', 'g')));

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
