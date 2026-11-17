-- khushio-sql-phase-5b.sql  (Release 5B: CSV import and export)
-- Adds to the existing table affiliate_import_logs (nothing else changes):
--   1. entity (text, nullable): what a CSV import was for (products, links, deals, brands, conversions). Rows written
--      before this release keep NULL. A nullable column with no default, so the old code keeps working unchanged.
--   2. import_logs_started_idx: an index on started_at, for the import history (newest first).
-- Safe to run again. Run BEFORE deploying the Release 5B code, on preview first, then production.

ALTER TABLE "affiliate_import_logs" ADD COLUMN IF NOT EXISTS "entity" text;

CREATE INDEX IF NOT EXISTS "import_logs_started_idx" ON "affiliate_import_logs" USING btree ("started_at");

-- =============================================================================
-- DONE. Check the result (column 1, index 1):
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'affiliate_import_logs' AND column_name = 'entity') AS entity_column,
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'import_logs_started_idx') AS history_index,
  'khushio-sql-phase-5b applied' AS status;
