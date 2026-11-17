# Status

**Standing instruction for Claude:** every time you deliver a new code zip, deliver the updated project guide (Khushio_Project_Guide_and_Phased_Roadmap.docx) in the same reply: raise the version and the "built up to" line, update section 2 (status and what was verified), the release's own section, sections 7.5 and 8, section 19, and say what was not run. See guide section 5, rule 7.

Last updated at the end of Releases 4A and 4B. **Built up to Release 4B.** Next: Release 5A (deals and coupons).

## Phase 1: foundation (done)
Structure, design tokens, layout shell, env validation, Drizzle schema, health endpoint, robots/sitemap, security headers, Vitest setup.

## Release 2A: sign-in and permissions (done, login model changed by the owner)
Auth.js credentials sign-in with JWT sessions, bcryptjs, `/admin-login`, role matrix + `requirePermission` / `requirePagePermission`, middleware redirect, `seed-rbac`, `/api/admin/me`. Details: `docs/AUTH.md`.

**Login model (decided by the owner, keep as is):** the admin's email and bcrypt password hash are read from the `users` table. No admin credentials in env or code. The admin is created or changed with `drizzle/migrations/set-admin.sql`. Every active user is a super admin. Release 2C did not change this.

## Release 2B: admin shell, audit log, CI, Playwright (done)
Admin shell driven by `ADMIN_NAV`, shared admin components, `core/audit` and `/admin/audit`, dashboard counts, Playwright and GitHub Actions CI.

## Release 2C: login rate limiting (done)
- 5 failed attempts per email or 20 per IP in 15 minutes block sign-in (even with the right password) until they age out; the form says "Too many failed attempts. Try again in 15 minutes."
- Enforced inside `authenticate` (`src/core/auth/service.ts`), so a direct POST to `/api/auth/callback/credentials` is covered too. Pure decision in `src/core/auth/throttle.ts`; table access in `login-throttle.ts` and `repository.ts`.
- New table `login_attempts` (hashes only: HMAC-SHA256 keyed with `AUTH_SECRET`). A successful sign-in clears that email's failures and deletes rows older than 7 days (no cron).
- The unused "failed-login counters" filter was removed from the audit viewer.
- Database script: `drizzle/migrations/khushio-sql-phase-2c.sql` (new table, safe to run before the code).
- Tests: `throttle.test.ts`, extra cases in `auth-service.test.ts`, `tests/integration/login-attempts.test.ts` (real Postgres), SQL checks in `sql-scripts.test.ts`, `tests/e2e/login-throttle.spec.ts` (test branch only).

## Release 3A: categories, brands, merchants (done)
- Modules `discover` (categories, brands) and `merchants`, each with repository, service, validation, types. Admin screens: `/admin/categories`, `/admin/brands`, `/admin/merchants` (list with search, status filter and paging; create; edit; archive, restore, delete). New nav entries (permissions `category:write`, `brand:write`, `merchant:write`).
- Categories: flexible tree with a parent picker, cycle prevention, one name per parent (ignoring case), sort order, "Add subcategory" shortcut.
- Merchants: allowed-domains editor with normalisation and rejection of unsafe entries (`src/modules/merchants/domains.ts`); changes are audited with the domains added and removed.
- Slugs: generated with uniqueness checks; never change silently (confirmation box + audit record). Redirects for changed slugs arrive in 7A.
- Delete rules: archive instead of delete when children or products (categories), products (brands) or links or programmes (merchants) exist.
- Cache tags `categories`, `brands`, `merchants` revalidated on write; category reads cached 24 h.
- Database script: `drizzle/migrations/khushio-sql-phase-3a.sql`: **`brands.is_active` (not in the original 3A plan, needed so brands can be archived)** and the unique category-name index.
- Dev starter data: `npm run db:seed-dev -- --yes` (development databases only).
- Integration tests started: `tests/integration` runs the services and repositories against an embedded Postgres (no secrets); `neon-smoke.test.ts` checks the Neon test branch when `TEST_DATABASE_URL` is set.
- Tests: 200 passing locally (was 60). Playwright: `tests/e2e/catalog-admin.spec.ts`.

## Release 3B: products, variants, Cloudinary uploads (done, not yet run against a real database or Cloudinary)
- Modules `products` and `media`. Admin screens: `/admin/products` (list with search and status filter, create, edit, archive, restore, delete) and `/admin/media` (library, alt text, unused filter, delete unused). New nav entries Products (`product:read`) and Media (`media:write`); no new permission keys, so no re-login is needed.
- Product form: name, slug (same confirmation rule as 3A), summary, description, brand, main category plus extra categories, variants (label, SKU, price, currency, add and remove rows), attributes, tags, status, go-live time (India time), featured. Everything typed stays when a message is shown.
- Saved as one atomic unit (`runAtomically`). SKUs are unique; one primary category per product (database rule); variants keep their ids across edits.
- Status rules: new products start as Draft or In review; publish and schedule need a main category and one image; only `product:publish` can publish, schedule, archive or pull a live product back. Archive instead of delete for live products and products with affiliate links.
- Images: signed browser-to-Cloudinary upload, server verification, de-duplication by hash, up to 12 per product, reorder, alt text, remove. Details: `docs/IMAGES.md`.
- Audit rows for every product and media write; cache tag `products` revalidated on every write.
- Database script: `khushio-sql-phase-3b.sql`.

## Release 3C: public catalogue (done, not yet run against a real database)
- Pages: `/discover` (search, filters, browse by category), `/categories/[slug]`, `/brands/[slug]`, `/stores/[slug]`, `/collections/[slug]`, `/products/[slug]` (images, options and prices, where to buy, details, tags, related products). Sitemap now lists products, categories and brands.
- Search: full-text on name, summary and description (name weighs most), brand and tag matches, exact-name boost, typo tolerance through trigram similarity. Filters: category, brand, price range; sort: best match, newest, A to Z. Cursor pages, no counts.
- Visibility rule in one place (`src/core/catalog/visibility.ts`): drafts, archived and not-yet-live products are 404s and never listed. Filtered views are `noindex,follow`.
- Caching: 30 minutes under tag `products` (cleared by every product write); searches uncached. Product pages build ahead of time for the top 50 products, the rest on first visit.
- The product page lists active affiliate links as "Buy at ..." buttons pointing at `/go/<slug>`; those links cannot exist until Release 4A creates the admin and the redirect.
- `/collections/[slug]` reads `product_collections`; there is no admin for collections yet (Release 6B's homepage work or a later release). Dev seed does not create any.
- Database script: `khushio-sql-phase-3c.sql` (needs `CREATE EXTENSION`, which the Neon SQL Editor allows).
- Dev starter data now also adds 60 sample products without images (every tenth is a draft, to prove drafts stay hidden).

## Release 4A: affiliate links and the /go redirect (done, not yet run against Neon)
- Admin: `/admin/links` (list with search and status filter, a "Blocked" flag when a destination no longer matches its merchant's domains, create, edit, delete when it has no history, check now, "Check oldest links" for the 10 stalest), `/admin/networks`, `/admin/programs`. The product edit screen lists the product's links with an "Add link" shortcut (`/admin/links/new?product=<slug>`). Nav: Affiliate links, Networks, Programmes (permission `affiliate:read`; writes `affiliate:write`). **No new permission keys, so no re-login is needed.**
- `/go/[slug]` (Node runtime): one indexed read, 302 with tracking parameters, the click recorded in `after()`; 404 for unknown, inactive, archived-merchant and refused destinations; the query string is ignored. Bots are stored with `is_bot`. HEAD is answered but not counted.
- Product pages use the shared `AffiliateLink` component (`rel="sponsored nofollow noopener"`).
- **Decision to confirm: the sub-ID is the link's slug**, sent wherever the tracking parameters contain `{subid}` (for example `ascsubtag={subid}`). It lets a network report be matched to a link for ever, even after the raw click was purged. If you prefer one sub-ID per click, say so before Release 5A.
- **Decision to confirm: destinations must be https** (the guide did not say; http destinations are refused).
- Database script: `khushio-sql-phase-4a.sql` (no schema change).

## Release 4B: click roll-up, retention and reports (done, not yet run against Neon)
- Nightly job `/api/cron/affiliate-rollup` (02:00 India time, `vercel.json`), protected by `CRON_SECRET`: counts human clicks per link and India day into `affiliate_click_daily` (idempotent, never lowers a total), then deletes raw clicks older than the retention setting (default 30 days, 7 to 365, stored in `site_settings` key `affiliate.click_retention_days`, edited on `/admin/reports`).
- `/admin/reports` (permission `report:view`): 7, 30 or 90 complete days; clicks by day, top 20 links, by merchant, by product, active links with no clicks, conversion totals; "today so far" from raw clicks. A "Run the nightly job now" button (permission `settings:manage`, fresh) runs the same code.
- `/admin/conversions` (list, filters, add, edit, delete) and `/admin/conversions/import` (CSV, permission `import:run`). Orders are matched on (network, order id): new rows are inserted, changed status or commission is updated, identical rows are left alone, bad lines are skipped with line numbers, the sub-ID column attributes an order to a link. Limits: 1 MB, 5,000 rows.
- Database script: `khushio-sql-phase-4b.sql` (index `conv_converted_at_idx`, retention row). **New environment variable: `CRON_SECRET`.**

## Verified in the build environment (Releases 4A and 4B)
This time the environment had the npm registry. **Run and passing:** `npm ci`, `npm run typecheck`, `npm run lint`, the whole Vitest suite (426 passed, 1 skipped = the Neon smoke test that needs `TEST_DATABASE_URL`; it was 271 before 4A), and `next build` in a copy with the two Google Fonts stubbed (the environment cannot reach fonts.googleapis.com; the real fonts are fetched on Vercel). The 3B and 3C code also passes all of this, including the SQL scripts and integration tests on an embedded Postgres (PGlite).
**NOT run:** anything against the real Neon database or Vercel (the `db.execute` result shape of the Neon HTTP driver is the one place PGlite cannot prove: the roll-up and purge read `result.rows`), the Playwright specs (`tests/e2e/affiliate.spec.ts` is new and unrun), Cloudinary, and Vercel Cron itself.

## Smoke checklist for 4A and 4B (preview, then production)
- Run `khushio-sql-phase-4a.sql` then `khushio-sql-phase-4b.sql` on the branch; read each status row (4A: slug_unique 1, indexes 2, allowed_domains 1; 4B: index 1, retention 30).
- Vercel: add `CRON_SECRET` (Preview and Production), redeploy.
- Merchants: open Amazon India and check its allowed domains. Networks: add Cuelinks. Programmes: add Amazon India on Cuelinks.
- Links: create a link for a published product with destination `https://www.amazon.in/dp/...` and tracking `tag=<yourtag>&ascsubtag={subid}`. Try a destination on another domain: refused with a message.
- Open the product page signed out: the Buy button appears; click it: you land on the store with your tag and the sub-ID in the address. `/go/<slug>?url=https://example.com` must still go to the store. Archive the link: the button disappears and `/go/<slug>` is 404.
- "Check now" on the link (a store that blocks it shows "unclear", which is normal).
- `/admin/reports`: press "Run the nightly job now"; the day's click appears after the first complete day; "Clicks today so far" shows today's clicks at once.
- `curl -i https://<site>/api/cron/affiliate-rollup` answers 401; with `-H "Authorization: Bearer <secret>"` answers 200.
- Conversions: add one by hand; import a small CSV (`order_id,status,commission,date,sub_id`) twice: the second time shows everything as unchanged.
- Vercel, Settings, Cron Jobs lists the job. Check Neon storage after the first week.

## Verified in the build environment (Releases 3B and 3C, earlier)
**Only partly.** The build environment had no network, so `npm install` was impossible and **typecheck, lint, the Vitest suite and `next build` were NOT run on this code**. What was run: every new and changed file was parsed (no syntax errors), every relative and `@/` import and every named import was checked to exist, and the pure logic (money, dates, signing, upload rules, image URLs, cursors) was executed and gave the expected results. The SQL files and everything that needs Postgres (the integration test, the SQL-script tests, search ranking, index use) have **not** been executed.
Run first on your machine: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Expect to fix a small number of type or lint messages; paste them back and they will be fixed.

## Smoke checklist for 3B and 3C (preview, then production)
- Run `khushio-sql-phase-3b.sql` then `khushio-sql-phase-3c.sql` on the branch first; read the status row at the bottom of each (all counts match).
- Set the three `CLOUDINARY_*` variables in Vercel. Run `npm run db:seed-dev -- --yes` on a development or preview database for sample products.
- /admin/products/new: create a draft with two variants (type a price such as 1,299.50; try `abc` and see the message beside that row, nothing typed is lost).
- On the edit screen upload a jpg; try to publish before uploading (refused); then publish; open `/products/<slug>` signed out (works) and signed in as a draft product (404).
- /discover: search a product name, a brand, a tag, and a typo; filter by price; press Show more until the end.
- /categories/<slug>, /brands/<slug>, /sitemap.xml list the published products only.
- Work through the manual checklist in `docs/IMAGES.md`.

## Smoke checklist for 2C and 3A (preview, then production)
- Run `khushio-sql-phase-2c.sql` then `khushio-sql-phase-3a.sql` on the branch first; read the status row at the bottom of each.
- Sign out and in again (new permission use needs no new keys, but sessions are 8 hours).
- Wrong password five times with one email, the sixth attempt (even with the right password) shows the throttle message; after 15 minutes it works again.
- /admin/categories: create Fashion, then Shoes under it, then Running under Shoes; a duplicate name under the same parent is refused; archive Running, restore it.
- /admin/brands: create, archive, restore, delete a brand.
- /admin/merchants: create "Amazon India" with `amazon.in` and `amzn.to`; `co.in` is refused; check /admin/audit shows the creates and the domain list.

## Carry-over items (not done yet)
1. Branch protection on `main` requiring the two CI checks (needs the first green CI run).
2. Cost numbers for 2A to 3A in `docs/PERFORMANCE.md`.
3. Add the `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `E2E_ADMIN_PASSWORD` secrets, run `phase-2c` to `phase-4b` on the Neon `test` branch.

## Next three tasks
1. Run the smoke checklists for 3B, 3C, 4A and 4B on a preview branch, then production; tag `phase-3b`, `phase-3c`, `phase-4a`, `phase-4b`.
2. Release 5A: deals and coupons.
3. Release 5B: CSV import and export.

## Release 5A: deals and coupons (done, not yet run against Neon)
- Database script `khushio-sql-phase-5a.sql`: four NEW tables (`deals`, `coupons`, `deal_products`, `deal_categories`). Safe to run before the code. Read the status row: tables 4, indexes 9, foreign keys 8. The database then has 34 tables.
- Admin (permission `deal:write`, already held by the owner and editor roles, **so no re-login is needed**): `/admin/deals` (search, filter by state: live, scheduled, expired, draft, archived; tick rows then Feature, Unfeature, End now, Archive; type the manual order and press Save order), `/admin/deals/new`, `/admin/deals/[id]`, `/admin/coupons` (+ new, edit, delete). Dates are typed in India time and empty start means now.
- **The expiry rule:** an offer is visible only while `status = published AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`. It lives in two twins (`modules/deals/window.ts`, tested to the millisecond, and `modules/deals/conditions.ts` for SQL). Nothing runs when an offer ends. Cached lists are filtered again with the clock at render time, and the offer cards hide themselves in the visitor's browser when the end time passes (`LiveWindow`). An ended offer therefore disappears within about 5 minutes (the `/deals` page revalidates every 5 minutes) and instantly in an open browser tab; product and store pages (30 minute page cache) hide it in the browser at once.
- Public: `/deals` (live offers, featured first, then your manual order, then newest start; stand-alone coupon codes in a second list), "Offers for this product" on product pages (offers on the product, on its category or a parent category, and store-wide offers of stores that sell it), "Current offers at <store>" on store pages. Individual offers have no pages of their own, so the sitemap only gains `/deals` and no ended offer can ever be in it.
- Coupon codes: "Show code" reveals and copies the code; when the deal has an affiliate link, revealing also opens `/go/<slug>` in a new tab, so the click is counted like any Buy button. The code is in the page data (codes are public); the reveal is for the click and the copy. Stand-alone coupons have no link, so revealing them records no click.
- Rules worth knowing: a deal's link must belong to the deal's store; a coupon inside a deal must be for the same store; archiving a store hides its offers and restoring it brings them back; a store can have each coupon code once (ignoring case), so to run a code again change the dates of the existing coupon; "End now" ends published running deals at the database clock and leaves drafts and already ended deals alone.
- `CACHE_TTL.deals` is now 5 minutes (was 10) so it stays under the 15-minute start look-ahead.
- Dev seed adds three example deals (live, starts tomorrow, ends in two hours) and a coupon on the first seeded store.

## Release 5B: CSV import and export (done, not yet run against Neon)
- Database script `khushio-sql-phase-5b.sql`: `affiliate_import_logs.entity` (nullable) and an index on `started_at`. Safe before the code. Status row: entity_column 1, history_index 1.
- `/admin/import` (permission `import:run`, no new key): choose products, links, deals or brands, download the template, upload, **check** (columns are matched by name or alias and can be changed; the preview says how many rows would be added, updated, left as they are, or skipped and why, with line numbers), then **import**. Limits: 2 MB and 2,000 rows (`next.config.ts` allows 3 MB server action bodies). Rows are written in batches of 100; a batch is all or nothing, so a failure rolls back only that batch and its rows are reported. Problem rows download as a CSV (line, error, your original columns) you can fix and import again. Every import is listed under "Recent imports" and audited.
- Matching, so importing twice changes nothing: brands, links, deals by `slug`; products by `slug`, variants by `sku` (or by label when a row has no SKU). An empty cell never clears a value. Products are created as Draft or In review (publishing needs images, so it stays on the product screen; the status column is ignored for products that already exist). Brand and category columns are slugs of things that already exist (import brands first). Links must pass the same destination check as the link form. A product with one bad row is skipped as a whole.
- Exports (same page and `/admin/export/<products|links|deals|brands>`, plus `/admin/export/clicks?range=30`): UTF-8 with a byte-order mark for Excel, same columns as the templates, so an export can be edited and imported back. Text starting with `= + - @` gets a leading apostrophe on export and the importer removes it (spreadsheet formula protection). Capped at 20,000 rows. Downloads are never cached and need `import:run`.
- The conversions import (4B) still has its own page and 1 MB limit; its CSV reader moved to `src/core/csv` and now also records `entity = conversions`.

## Verified in the build environment (Releases 5A and 5B)
**Only partly: this environment had no npm registry** (same as 3B/3C), so `npm ci`, the real `typecheck`, `lint`, the real Vitest run, `next build` and anything needing Postgres were **NOT run**. What was run: the pure-logic unit tests for the expiry window, discount parsing, deal and coupon validation, CSV writer and formula protection, the flexible date parser, column mapping and the import engine (batching, rollback of a failing batch, error file) were executed with a small stand-in test runner and the real `zod`: all passed. The new code was type-checked with the third-party libraries stubbed: no errors in the new logic (the remaining messages come from the stubs). The new SQL files, the integration tests (`tests/integration/deals.test.ts`, `imports.test.ts`), the SQL-script tests and the Neon smoke test (now expects 34 tables) are **written but have not been executed**.
Run first on your machine: `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Expect a few type or lint messages, especially in the new repositories (Drizzle query shapes were written without a compiler); paste them back.

## Smoke checklist for 5A and 5B (preview, then production)
- Run `khushio-sql-phase-5a.sql` then `khushio-sql-phase-5b.sql` on the branch; read each status row (5A: 4 / 9 / 8; 5B: 1 / 1).
- `/admin/deals/new`: create a deal for a store, give it a link slug, publish it with an end time two minutes ahead; see it on `/deals`; wait: it disappears (within 5 minutes after a reload; at once if the tab stays open).
- Schedule one for tomorrow: not visible. Tick two deals and press "End now": both vanish from `/deals` and the list shows them Expired.
- Create a coupon in a deal; on `/deals` press "Show code": the code appears and is copied, a new tab opens `/go/...` and `/admin/reports` counts a click tomorrow.
- Archive the store: its offers disappear; restore it: they return.
- `/admin/import`: download the brands template, import it twice: the second time says "already up to date". Import a products file with two variants of one product, then change a price and import again: one update, no duplicates. Try a link with a destination on another domain: refused with its line number. Download the problem CSV, fix, import again.
- Export products, open in Excel, import the same file: everything "already up to date".
