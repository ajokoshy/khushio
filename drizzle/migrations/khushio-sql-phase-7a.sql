-- khushio-sql-phase-7a.sql  (Release 7A: SEO, structured data and redirects)
-- Adds ONE new table, "redirects", with its indexes and two safety checks. Nothing existing changes.
--   redirects.from_path      the old address (a path such as /products/old-name, lower case, unique)
--   redirects.to_path        the new address; empty only for a 410 "gone" row
--   redirects.status_code    301 (moved for good), 302 (moved for now) or 410 (removed on purpose)
--   redirects.source         'auto' (made by a slug change or a delete) or 'manual' (typed on /admin/redirects)
-- The two checks keep bad rows out even if someone edits the table by hand:
--   redirects_status_chk     only 301, 302 or 410
--   redirects_target_chk     a 410 row has no target; every other row has one and it is not the same as from_path
-- seo_metadata needs no new index: its unique index (entity_type, entity_id) already serves every lookup 7A makes
-- (the table is now also used for products, categories, brands and stores, see src/modules/seo).
-- Safe to run BEFORE the 7A code (the 6B code ignores the table) and safe to run again.
-- Run on the preview branch first, then production, then merge the pull request.

CREATE TABLE IF NOT EXISTS "redirects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_path" text NOT NULL,
  "to_path" text,
  "status_code" integer DEFAULT 301 NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "redirects_status_chk" CHECK ("status_code" in (301, 302, 410)),
  CONSTRAINT "redirects_target_chk" CHECK (("status_code" = 410 and "to_path" is null) or ("status_code" <> 410 and "to_path" is not null and "to_path" <> "from_path"))
);

CREATE UNIQUE INDEX IF NOT EXISTS "redirects_from_path_uq" ON "redirects" USING btree ("from_path");
CREATE INDEX IF NOT EXISTS "redirects_to_path_idx" ON "redirects" USING btree ("to_path");

-- =============================================================================
-- DONE. Check the result (table 1, indexes 2, checks 2):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'redirects') AS redirects_table,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'redirects' AND indexname IN ('redirects_from_path_uq', 'redirects_to_path_idx')) AS redirects_indexes,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.redirects'::regclass AND contype = 'c') AS redirects_checks,
  'khushio-sql-phase-7a applied' AS status;
