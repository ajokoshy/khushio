# Status

**Standing instruction for Claude:** the project guide is updated with EVERY update, not only with new code zips. Whenever you deliver a zip, a fix or any other change, deliver the updated project guide (Khushio_Project_Guide_and_Phased_Roadmap.docx) in the same reply: raise the version (a small change gets a point version), update the "built up to" line, add a "What changed" entry, update section 2 (status and what was verified), the release's own section, sections 7.5 and 8 and section 19, and say what was not run. See guide section 5, rule 7.

Last updated at the end of Release 7B. **Built up to Release 7B (the last planned release).** Next: run the 7A and 7B steps on Neon and Vercel, launch (docs/LAUNCH.md), then maintenance releases.

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
2. Run the 5A, 5B, 6A and 6B smoke checklists on a preview branch, then production; tag `phase-5a`, `phase-5b`, `phase-6a`, `phase-6b`.
3. Run the 6B smoke checklist, then Release 7A (SEO, structured data and redirects).

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

## Release 6A: articles, pages and the editor (done, not yet run against Neon)
- Database script `khushio-sql-phase-6a.sql`: seven NEW tables (`author_profiles`, `content_categories`, `content_tags`, `articles`, `article_tags`, `pages`, `seo_metadata`). Safe to run before the code. Status row: tables 7, indexes 9, foreign keys 4. The database then has 41 tables. **No new permission and no new environment variable:** `content:write`, `content:publish` and `seo:write` already existed (owner and editor roles hold them), so nobody needs to sign in again.
- Admin: `/admin/articles` (search, filter by status), `/admin/articles/new`, `/admin/articles/[id]`; `/admin/pages` (same three screens); `/admin/authors`; `/admin/topics` (topics and tags). The editor is Tiptap v2 (`@tiptap/react`, `starter-kit`, `extension-link`, `extension-image`, plus the required peer `@tiptap/pm`). It offers bold, italic, heading, subheading, bullets, numbers, quote, link, picture, undo and redo. Pictures come from the media library (search) or are uploaded with the same signed Cloudinary upload as products; they land in the library and are recorded there.
- **Stored as JSON, never HTML.** `modules/content/document.ts` rebuilds every document through a whitelist (paragraph, heading 2 to 4, bullet and ordered lists, quote, line break, image, bold, italic, link). Unknown nodes are dropped with everything inside them; links must be http, https, mailto or a path starting with `/` (`javascript:`, `data:` and control-character tricks are refused); an image keeps only a library public id, a description and a size, never an address. The same function runs when a form is saved and again when a page is drawn, and `shared/content/document-renderer.tsx` draws with React elements only (no `dangerouslySetInnerHTML` anywhere), so a row written by an import or a script can not put markup on the page either.
- **Statuses and visibility:** DRAFT, REVIEW, SCHEDULED, PUBLISHED, ARCHIVED. Visitors see an item while `PUBLISHED`, or `SCHEDULED` with `publish_at <= now()` (`modules/content/visibility.ts`, an in-code twin and a SQL twin). No job is needed for scheduling: lists are filtered with the database clock whenever they rebuild, single articles are checked again with the clock at call time. `CACHE_TTL.articles` is 5 minutes, and article and page routes use `revalidate = 300`, so a scheduled article appears **within about 5 minutes after its time**; every editor write clears the `articles` tag at once.
- **Who may do what:** `content:write` writes and moves things between Draft and In review. Publishing, scheduling, archiving and pulling live content back needs `content:publish`. Changing the search fields needs `seo:write`; without it the fields are shown locked and the saved values are never touched. Publishing needs some text or a picture; Scheduled needs a future time; Published may not carry a future time. A published or scheduled item can not be deleted: archive it first.
- Public: `/articles` (newest first, 12 per page, topic chips), `/articles/<slug>` (cover, author, date, reading time, topic and tags, affiliate disclosure), `/articles/category/<slug>`, `/articles/tag/<slug>` (tag pages are `noindex`), `/p/<slug>` for stand-alone pages. Later list pages are `noindex` with the first page as canonical. Search title, description, canonical, share image and robots come from `seo_metadata`, otherwise from the content. The sitemap gains `/articles`, topics with visible articles, visible articles and pages; anything set to "keep out of search results" is left out. A **Articles** link was added to the site header (the existing Guides link is unchanged for 6B).
- Rules worth knowing: the slugs `category` and `tag` are reserved for articles; a topic's or tag's address never changes after it is created (only its name does); topics can be hidden (no page, not selectable); deleting an author or topic keeps the articles; deleting a tag removes it from the articles; a picture used as a cover or inside an article or page counts as "used" in the media library and cannot be deleted there (`media/repository.ts` looks for the public id in the article and page JSON). Article pictures use the existing `khushio/products` Cloudinary folder (the signature is locked to it).
- Not in 6A on purpose: structured data (JSON-LD) and redirects (7A), the guide and comparison article types (6B), author pages, related articles, search inside articles.
- Test setup change: `vitest.config.ts` now sets `esbuild.jsx = "automatic"` so a test can render a React component (the renderer test does).

## Verified in the build environment (Release 6A)
This time the environment **had the npm registry**: `npm ci` and the Tiptap install worked, and these were actually run, all passing: `tsc --noEmit` (no errors), `eslint` (no problems in new files; one older `no-explicit-any` error remains in `tests/unit/admin-actions.test.ts` and three warnings that are not from 6A), the **full Vitest suite (591 tests passed, 1 skipped Neon test)** including the new `content-document`, `content-rules`, `content-renderer` unit tests, the 6A SQL script tests and `tests/integration/content.test.ts` (23 tests against embedded Postgres: lifecycle, scheduling by the database clock, who may publish, slugs, tags, SEO rows, topics and authors, media usage, sitemap, cache tag). **`next build` compiled all routes** (with the two Google fonts temporarily stubbed, because the sandbox could not reach fonts.googleapis.com; the layout was restored afterwards). The editor adds about 115 kB only to the admin article and page screens; public routes stay at about 106 kB first load.
**Not run:** the Tiptap editor in a real browser (toolbar, picture picker, upload to Cloudinary, keyboard use), the admin screens against Neon, and the Neon smoke test (it now expects 41 tables).

## Smoke checklist for 6A (preview, then production)
- Run `khushio-sql-phase-6a.sql` on the branch; read the status row (7 / 9 / 4).
- `/admin/authors`: add an author. `/admin/topics`: add a topic and a tag.
- `/admin/articles/new`: write a heading, a paragraph with a bold word and a link, a bullet list and a quote; add a picture from the library and one by uploading; choose a cover; set the author, topic and tags; save as Draft. `/articles` must NOT show it; opening `/articles/<slug>` gives 404.
- Edit it, set Published: it appears on `/articles`, under its topic and under its tag, with author, date and reading time. View source: no `<script>` from your text. Paste `javascript:alert(1)` as a link address: the editor refuses it.
- Schedule another article for five minutes ahead (India time): hidden now; after the time plus up to 5 minutes it appears with no action from you.
- Set an article to "Keep out of search results" (needs `seo:write`): `/sitemap.xml` leaves it out and the page has `noindex`.
- Try the publishing rules: Published with no text is refused; Scheduled with a past time is refused. Archive an article: its address now shows 404; then delete it.
- `/admin/media`: the cover and inline pictures show "1 use" and refuse deletion until removed from the article.
- Create a page "About" and publish it: `/p/about` works and is in the sitemap.

## Release 6B: guides, product embeds and the homepage builder (done; verified in the 7A build, see below)
- Database script `khushio-sql-phase-6b.sql`: ONE column and ONE index on `articles` (`type`, default `article`; index on type, status, publish_at). No new table: the database stays at 41 tables. Safe to run before the code. Status row: `type_column` 1, `type_index` 1, `unknown_types` 0. **No new permission and no new environment variable** (`homepage:write` already existed and the editor role holds it; the signed preview uses the existing `AUTH_SECRET`), so nobody needs to sign in again.
- **Guides:** one table, one editor. The article form has a Type (article, buying guide, review, comparison, how-to). Every type keeps its address under `/articles/<slug>`. `/guides` lists the four guide kinds, `/guides/<type>` one kind (`guide`, `review`, `comparison`, `how-to`; anything else is 404), with chips for the kinds that have visible items. `/articles` still lists everything. The sitemap has `/guides` and the kinds with visible items. The admin list filters by type.
- **Product embed:** a "Product" button in the editor (articles only) opens a picker (search by name, any status except archived). The text stores only the product id (`productEmbed` node, at most 20 per document, top level only). The page looks all embedded products up in ONE cached query (tag `products`): live price range, picture, first active store link. A product that is archived, a draft or not yet live is simply left out, so there is never a broken card. The store button goes through `/go` with `sponsored nofollow noopener`.
- **Homepage builder** (`/admin/homepage`, permission `homepage:write`): add, edit, delete, switch on or off, move up or down, schedule (India time) and preview sections of seven types: hero banner, featured categories, trending products (featured, newest or most clicked in 30 days), deals, collections, guides, promo banner. Each type is drawn by one registered component (`src/shared/homepage/sections.tsx`); the database holds a type and a small JSON config that is validated per type with Zod when saved AND when the page is built (a bad or hand-edited row is skipped, an unknown type is ignored). Links in banners must be a path on this site or https. The hero picture comes from the media library and counts as a media use. "Create the starter layout" fills an empty homepage. An empty homepage shows the brand banner only.
- **Preview:** `/preview/home?token=...` shows every section with a label (live, scheduled, switched off, nothing to show). It needs BOTH a valid signed link (HMAC with `AUTH_SECRET`, good for one hour, made by the Open preview button) AND a signed-in person with `homepage:write`; anyone else gets 404. Never cached, never indexed.
- **Cache:** the homepage revalidates every 10 minutes; every homepage or navigation write clears its tag and the home page at once; "Refresh the homepage" does the same by hand. A section's go-live time is checked with the clock when the page is built, so a scheduled section appears within the 10-minute window with no job. A failing section is logged and skipped.
- **Navigation editor** (`/admin/navigation`, also `homepage:write`): header menu (up to 8 links) and footer links (up to 20) in `navigation_items`; add, edit, show or hide, move, delete. Empty header = the built-in menu. The header and footer read them (cached 10 minutes, tag `navigation`, cleared on every write).
- Not in 6B on purpose: structured data (JSON-LD, reviews) and redirects (7A), drag and drop (Up and Down buttons instead), author pages, related articles.
- Tests written: `tests/unit/content-embed.test.ts`, `homepage-config.test.ts`, `homepage-preview.test.ts`, 6B cases in `sql-scripts.test.ts`, `tests/integration/homepage.test.ts` and `guides-embeds.test.ts` (embedded Postgres). **None of them has been run yet**; the build environment had no npm registry, so there was no `npm ci`, typecheck, lint, test run or build.

## Smoke checklist for 6B (preview, then production)
- Run `khushio-sql-phase-6b.sql`; read the status row (1 / 1 / 0). Existing articles are now type Article.
- Edit an article, set Type to Buying guide, Save: it appears on `/guides` and `/guides/guide`, and still at `/articles/<slug>`.
- In the editor click Product, search, choose a live product: a dashed block shows its name. Save and open the article: card with price, picture and store button. Archive that product in admin: after saving it (product writes clear the cache) the card is gone and the page still works.
- `/admin/homepage`: Create the starter layout. Open preview in a new tab: sections labelled Live. Switch a section off: preview says Switched off, `/` does not show it. Schedule one for five minutes ahead: hidden now, appears within about 10 minutes after the time.
- Move a section down and reload: the order stays. Add a promo banner with a link `javascript:alert(1)`: refused. Choose a hero picture: `/admin/media` shows "1 use" and refuses deletion.
- Open the preview link while signed out (private window): 404. Wait an hour or edit the token: 404 or "expired".
- `/admin/navigation`: add a header link, move it, hide it; the site header changes at once. Hide all of them: the built-in menu returns.
- Compare the homepage with the banner design.

## Release 7A: SEO, structured data and redirects (done, not yet run against Neon)
- Database script `khushio-sql-phase-7a.sql`: ONE new table, `redirects` (unique `from_path`, `to_path`, `status_code` 301/302/410, `source` auto/manual), one index and two CHECK constraints. The database then has **42 tables**. Safe to run before the code. Status row: table 1, indexes 2, checks 2. **No new permission and no new environment variable** (`seo:write` already existed; owner and editor roles hold it).
- **One metadata helper:** `buildMetadata()` in `src/modules/seo/metadata.ts` writes every public page's title, description, canonical, robots and Open Graph/Twitter tags. A page can never lack a title or description (fallbacks: site name, site description). The old `listingMetadata` and `contentMetadata` helpers are gone. The home page, deals, discover, categories, brands, stores, collections, products, articles, guides, topics, tags and pages all use it.
- **Noindex rules:** filtered, searched and cursor views; tag pages; list pages after page 1 (own canonical `?page=N`, `noindex,follow`); thin pages (a category with no products and no subcategory, a brand with no products, a store with no products and no live deals, an empty collection); anything the editor set to noindex.
- **Per-page search text for products, categories, brands and stores:** `/admin/seo/<type>/<id>` (title, description, canonical, share picture, visibility) stored in `seo_metadata` (the table was already polymorphic). Articles and pages keep theirs in their own editor. Read through the data cache (tag `seo`, 30 minutes), cleared on every save.
- **/admin/seo:** a tab per kind of page with the pages that have something to improve (title over 60, description missing, under 70 or over 160 characters), a search box and an "only pages with something to improve" filter. Descriptions are never actually missing on the site (a sentence is generated); the list is for improving them.
- **Structured data (JSON-LD):** Organization and WebSite (with a search action) on every public page; BreadcrumbList from the shared Breadcrumbs component; Product on product pages; Article on articles. **The Product has no Offer today:** an Offer is written only for a variant with both a price and a known availability, and Khushio tracks no stock, so none is emitted. Deal and coupon offers are not turned into structured data (schema.org has no valid coupon type and an Offer needs a price); the live-only rule in `modules/deals/window.ts` still decides what `/deals` lists. JSON-LD is escaped so product or article text cannot close the script tag.
- **Sitemap:** `/sitemap.xml` is one file up to 5,000 URLs and a sitemap index beyond that (static, categories, brands, stores, articles, and products in numbered files of 5,000 under `/sitemaps/`). Only visible, indexable pages are listed (no drafts, archived, ended, editor-noindexed or thin pages; stores are new in the sitemap). Data cached an hour; sent with a one-hour CDN cache header. The old `src/app/sitemap.ts` was replaced by route handlers.
- **Redirects:** `/admin/redirects` (list, search, add, edit, delete). Changing a slug of a product, category, brand, store, article or page that was ever public writes a 301 from the old address in the SAME atomic write as the change; earlier old addresses are re-pointed to the newest (never two hops); going back to an old slug removes its rule. Deleting a public page leaves a 410 (and turns rules that led to it into 410). Creating a page on an address with a rule removes the rule. Manual rules reject chains, loops, the home page, `/admin`, `/api`, `/go` and a second rule for the same address. A warning lists rules that hide a page that exists (for example after an import). Every manual change is audited.
- **Middleware:** public pages run one in-memory lookup (`src/modules/redirects/middleware.ts`). The map loads from `/api/redirect-map` (data cache, one database read an hour, cleared by every redirect change), is kept 60 seconds per running instance, is served stale while refreshing, and a failed load never breaks a page. Query strings are carried over. `/api`, `/go`, `/_next`, `/brand` and anything with a file extension skip it. A 410 shows a plain "This page has been removed" page with `x-robots-tag: noindex`. Edits reach visitors within about two minutes.
- **Media library:** a "Missing description (alt text)" filter, a count banner and a warning under each picture without alt text.
- **Public pages still render the same way** (checked by comparing the build tables of 6B and 7A: only the sitemap routes changed, from static to cached dynamic).
- Tests written: `redirect-path`, `redirect-middleware`, `seo-metadata`, `seo-jsonld`, `seo-sitemap` (unit), 7A cases in `sql-scripts.test.ts`, `tests/integration/redirects-seo.test.ts` (embedded Postgres), and updated expectations in `discover-service` and `merchants-service` tests.

## Verified in the build environment (Releases 6B and 7A)
The npm registry WAS reachable this time, so the whole project was installed and run for the first time since 5B: `npx tsc --noEmit` clean, `npm run lint` clean, the full Vitest suite **719 passed, 1 skipped** (the Neon smoke test, which needs `TEST_DATABASE_URL`; it now expects 42 tables; 6B had 652 passing before 7A), and `next build` succeeded (with local stand-ins for the two Google fonts, which the sandbox cannot download; the committed code still uses Fraunces and Jost). This also confirms the 6B code and its tests, which had never run.
**Not run:** the admin screens in a browser, the middleware on Vercel (the self-fetch to `/api/redirect-map` does not work on password-protected preview deployments, so redirects only act on the production domain or an unprotected preview), Google's Rich Results Test, and Playwright.

## Smoke checklist for 7A (preview, then production)
- Run `khushio-sql-phase-7a.sql`; read the status row (1 / 2 / 2).
- Edit a live article, change its slug (tick the confirmation), save. Open the OLD address: it lands on the new one (301). `/admin/redirects` lists it as Automatic. Change the slug again: both old addresses go to the newest.
- Add a redirect by hand from `/test-old` to a live page: works within two minutes. Try `/test-old` to a page that is itself redirected: refused with a clear message. Try `/admin/x` as the old address: refused.
- Archive then delete a published article: its address shows "This page has been removed" (status 410).
- `/admin/seo`: open the Products tab, tick "only pages with something to improve", edit one product's description, save, and check the page source after about 30 minutes (or the next rebuild).
- View the source of a product page: one `application/ld+json` block with Organization and WebSite (layout), BreadcrumbList and Product (no `offers`). An article page has Article. Paste a URL into Google's Rich Results Test.
- Open `/sitemap.xml`: published pages only (no draft, no hidden page). `/robots.txt` still points to it.
- `/admin/media?usage=no-alt` lists pictures with no description.

## Release 7B: analytics, performance, hardening and launch (done, not yet run on Neon or Vercel)
- Database: `khushio-sql-phase-7b.sql` **changes nothing** (a status row and the tuning queries as comments). The database stays at 42 tables. No index was found missing, so none was added. **New environment variables, both optional:** `NEXT_PUBLIC_ANALYTICS` (`off`/`vercel`) and `CSP_ENFORCE` (`true`). No new permission. New packages: `@vercel/analytics` 1.3.2 (pinned: newer versions have a peer-dependency conflict with the test tooling), `@next/bundle-analyzer` (dev). `drizzle-orm` raised to 0.45.4 and `postcss` forced to 8.5.33 (security, below).
- **Analytics (outside Neon):** Vercel Web Analytics and Speed Insights on public pages only, behind `NEXT_PUBLIC_ANALYTICS=vercel`, cookie-free, search words stripped from addresses (`src/shared/analytics`). Speed Insights is loaded as a small script (Vercel serves it once the feature is on) rather than through its npm package, which cannot be installed next to the current test tooling. Also switch both on in the Vercel dashboard.
- **Security pass:** Content-Security-Policy (report-only until `CSP_ENFORCE=true`), extra headers, rate limits on the public write endpoints (`/go` click recording, `/api/csp-report`), `/api/csp-report` endpoint, error logging through `src/instrumentation.ts`, secrets scan, Dependabot, `npm audit` in CI. **One real vulnerability found and fixed:** link addresses like `/\evil.example` were accepted as site paths (editor links, navigation, homepage buttons). `npm audit`: drizzle-orm and postcss fixed; zod 3.x and Tiptap 2.x accepted with reasons and a plan (docs/SECURITY.md). OWASP Top 10 walk recorded in docs/SECURITY.md.
- **Tests:** `security-guards` (157 structural checks: every admin page, server action and admin route handler has a permission check; public write endpoints are limited), `security-headers` (CSP, headers, limiter, report endpoint, error line, analytics stripping), `security-payloads` (40 hostile-input cases: XSS in the editor, bad links, open redirect, redirect rules, upload abuse, cron secret), `launch-checks`, and the 7B cases in `sql-scripts`.
- **Performance:** measured the build (103 kB shared, 106 to 112 kB first load for public pages, middleware 89 kB, editor 222 kB admin-only); `npm run check:bundles` proves no admin-only code reaches public pages and enforces a 450 kB budget; `npm run analyze` for the visual report; `preconnect` to Cloudinary. Image, font and layout handling reviewed against LCP, INP and CLS. Real Lighthouse and Speed Insights numbers still have to be taken on a deployed site (docs/PERFORMANCE.md).
- **Budgets and smoke tests:** `lighthouserc.json` and the manual "Lighthouse budget" workflow (LCP 2.5 s, CLS 0.1, TBT 200 ms, accessibility and SEO 0.95); a read-only production smoke suite (`tests/smoke`, `npm run test:smoke` with `SMOKE_BASE_URL`) using plain HTTP requests.
- **Launch:** `/admin/launch` (owner only, `settings:manage`): checks site address, secrets, legal pages, robots, products, links, CSP, analytics, admin accounts (lists them for review, flags unused ones) and lists the by-hand items. Published legal pages (`privacy-policy`, `terms`, `affiliate-disclosure`, `contact`) are linked in the footer automatically. `docs/LAUNCH.md` has the checklist, deploy day, first two weeks and four page templates (not legal advice).
- **Backups:** `docs/BACKUP.md`, `scripts/backup-dump.sh`, a monthly GitHub workflow (encrypted artifact, 90 days) and a restore drill.

### Verified in the 7B build (the same environment as the 7A review)
`npx tsc --noEmit` clean; `npm run lint` clean; the full suite **939 passed, 1 skipped** (the Neon smoke test), up from 719; `next build` succeeded (stand-in fonts); `npm run check:bundles` passed; `npm run check:secrets` passed; the built site was started with `next start` and the read-only smoke checks that need no database passed against it (security headers and CSP header, closed admin, cron secret, CSP report endpoint; the robots sitemap line only differs because the local build used localhost as its address). **Not run:** the smoke checks that need data (home, product page, sitemap contents, legal pages), Lighthouse, the admin screens in a browser, Vercel Analytics, everything against Neon.

## Smoke checklist for 7B (preview, then production)
- Run `khushio-sql-phase-7b.sql` (status row says "no schema change").
- Set `NEXT_PUBLIC_ANALYTICS=vercel`, redeploy, switch on Analytics and Speed Insights in Vercel; visit a few pages; numbers appear after a few minutes. No cookie is set on a public page.
- `SMOKE_BASE_URL=<address> npm run test:smoke` passes.
- View a page's response headers: `Content-Security-Policy-Report-Only` is present; browse the whole site with the browser console open and note any CSP complaint; search the Vercel logs for `khushio.csp`.
- Admin > Launch checklist: read every red and yellow line. Publish the four legal pages; they appear in the footer within about five minutes.
- After the first week, search the Vercel logs for `khushio.error`; each line has the route, a reference number and a short message.
- Run the Lighthouse workflow on the preview home and a product page.
- Take the first logical dump and do the restore drill (docs/BACKUP.md).
