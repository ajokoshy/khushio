-- khushio-sql-phase-3a.sql  (Release 3A: categories, brands and merchants admin)
-- Adds:
--   1. brands.is_active (boolean, default true): lets a brand that products use be ARCHIVED instead of deleted.
--      Existing rows become active. It has a default, so the old code keeps working unchanged.
--   2. a unique index on categories (parent, lower(name)): one category name per parent, ignoring case.
--      Top-level categories share one "no parent" bucket. If this statement fails with "could not create
--      unique index", two categories already share a name under the same parent: rename one and run it again.
-- Safe to run again. Run BEFORE deploying the Release 3A code, on preview first, then production.

ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "categories_parent_name_uq"
  ON "categories" (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name"));

-- =============================================================================
-- DONE. Check the result (is_active column present, index present):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'is_active') AS brands_is_active,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'categories_parent_name_uq') AS category_name_index,
  'khushio-sql-phase-3a applied' AS status;
