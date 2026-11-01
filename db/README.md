# Database changes

Every time the database changes, do all three, in the same commit:
1. Add `db/migrations/NNN_short_name.sql` (use `IF NOT EXISTS`, so it is safe to re-run; never `DROP`).
2. Update `db/schema.sql` so it always holds the full current schema.
3. Update `lib/db/schema.ts` (the typed version the app uses).

`npm test` checks that the three stay in sync.

## Applying migrations

Run each new file in the Neon SQL Editor, in numeric order. Every migration is idempotent, so re-running is harmless.
The admin page **/admin/status** shows whether the latest migration (010) has been applied.

| # | File | Adds |
|---|------|------|
| 001 | 001_init.sql | products, offers, clicks, deals, coupons, articles |
| 002 | 002_settings_and_rate_limit.sql | site_settings, login_attempts |
| 003 | 003_product_images.sql | products.image_url |
| 004 | 004_brands.sql | brands |
| 005 | 005_categories.sql | categories |
| 006 | 006_merchants_and_collections.sql | merchants, collections, offers.merchant_id |
| 007 | 007_audit_log.sql | audit_log |
| 008 | 008_integrity_and_lifecycle.sql | offer/deal/coupon lifecycle (active, expiry, verified), merchant approved domains, updated_at, product SEO and featured, click merchant, import_staging |
| 009 | 009_offer_prices_fks_search_redirects.sql | offer-level price, MRP, currency and price-checked date; products.brand_id and category_id foreign keys; category parent; redirects; full-text search column |
| 010 | 010_content_cms.sql | media library, article categories/status/scheduling/tags, revisions (last 5 kept), editable pages, homepage sections, navigation, gift occasions, curated comparisons, deal slugs, daily click totals |

**Apply 008, 009 and 010 before deploying this version of the code**, because the app now reads the new columns.

## Fresh database
Run `db/schema.sql`, then optionally `db/seed.sql` (sample data with example.com links; delete it before launch).
Sample data is never shown on the public site in production, whatever is in the database.
