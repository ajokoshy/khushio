-- khushio-sql-phase-3c.sql  (Release 3C: public catalogue pages, search and filters)
-- Adds (nothing is dropped or changed; the old code keeps working):
--   1. the pg_trgm extension (typo-tolerant matching).
--   2. products.search_vector: a tsvector column that POSTGRES keeps up to date by itself from name (most weight),
--      summary and description. The app never writes it. Adding it rewrites the products table once; at
--      this size that takes a moment.
--   3. indexes: full-text (GIN on search_vector), typo-tolerant name matching (GIN trigram on lower(name)),
--      newest-first listing of visible products, products by category, price range filter and a store's products.
-- Safe to run again. Run BEFORE deploying the Release 3C code, on preview first, then production.
-- CREATE EXTENSION needs the project owner role, which the Neon SQL Editor uses.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS "products_search_idx" ON "products" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_listing_idx" ON "products" ("created_at" DESC, "id" DESC) WHERE "status" IN ('PUBLISHED', 'SCHEDULED');

CREATE INDEX IF NOT EXISTS "pc_category_product_idx" ON "product_categories" ("category_id", "product_id");
CREATE INDEX IF NOT EXISTS "variants_product_price_idx" ON "product_variants" ("product_id", "currency", "price_minor");
CREATE INDEX IF NOT EXISTS "links_merchant_product_idx" ON "affiliate_links" ("merchant_id", "product_id") WHERE "is_active";

-- =============================================================================
-- DONE. Check the result (extension 1, column 1, six indexes):
-- =============================================================================
SELECT
  (SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm') AS pg_trgm,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'search_vector') AS search_vector,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('products_search_idx', 'products_name_trgm_idx', 'products_listing_idx', 'pc_category_product_idx', 'variants_product_price_idx', 'links_merchant_product_idx')) AS indexes_found_of_6,
  'khushio-sql-phase-3c applied' AS status;
