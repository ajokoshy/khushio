-- khushio-sql-phase-3b.sql  (Release 3B: products, variants and Cloudinary uploads)
-- Adds (nothing is dropped or changed; the old code keeps working):
--   1. media_assets: a UNIQUE index on content_hash (only where it is set), so the same picture is stored once.
--      (The old plain index media_hash_idx stays; a later release may drop it.)
--   2. product_images: indexes on (product_id, sort_order) and (public_id).
--   3. product_variants.sort_order (integer, default 0) and a UNIQUE index on sku (only where a SKU is set).
--   4. product_categories: at most ONE primary category per product (partial unique index).
-- Safe to run again. Run BEFORE deploying the Release 3B code, on preview first, then production.
-- If a unique index fails with "could not create unique index", the table already holds duplicates:
-- fix them (two variants with one SKU, two primary categories on one product) and run the file again.

CREATE UNIQUE INDEX IF NOT EXISTS "media_hash_uq" ON "media_assets" ("content_hash") WHERE "content_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "images_product_order_idx" ON "product_images" ("product_id", "sort_order");
CREATE INDEX IF NOT EXISTS "images_public_id_idx" ON "product_images" ("public_id");

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "variants_sku_uq" ON "product_variants" ("sku") WHERE "sku" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "pc_one_primary_uq" ON "product_categories" ("product_id") WHERE "is_primary";

-- =============================================================================
-- DONE. Check the result (all five indexes and the new column should be 1):
-- =============================================================================
SELECT
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('media_hash_uq', 'images_product_order_idx', 'images_public_id_idx', 'variants_sku_uq', 'pc_one_primary_uq')) AS indexes_found_of_5,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'sort_order') AS variants_sort_order,
  'khushio-sql-phase-3b applied' AS status;
