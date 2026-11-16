-- khushio-sql-phase-4b.sql  (Release 4B: click roll-up, retention and reports)
-- Adds:
--   1. conv_converted_at_idx: an index on affiliate_conversions (converted_at), for the conversion reports and list.
--   2. the retention setting row in site_settings: key 'affiliate.click_retention_days', value 30 (days that raw clicks
--      are kept before the daily job deletes them). INSERT ... ON CONFLICT DO NOTHING, so running this file again
--      never overwrites a value you changed later.
-- Safe to run again. Run BEFORE deploying the Release 4B code, on preview first, then production.

CREATE INDEX IF NOT EXISTS "conv_converted_at_idx" ON "affiliate_conversions" USING btree ("converted_at");

INSERT INTO "site_settings" ("key", "value") VALUES ('affiliate.click_retention_days', '30'::jsonb)
  ON CONFLICT ("key") DO NOTHING;

-- =============================================================================
-- DONE. Check the result (index present = 1, retention shows the current number of days):
-- =============================================================================
SELECT
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'conv_converted_at_idx') AS conversions_date_index,
  (SELECT value::text FROM site_settings WHERE key = 'affiliate.click_retention_days') AS retention_days,
  'khushio-sql-phase-4b applied' AS status;
