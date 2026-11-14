# Status

**Standing instruction for Claude:** every time you deliver a new code zip, deliver the updated project guide (Khushio_Project_Guide_and_Phased_Roadmap.docx) in the same reply: raise the version and the "built up to" line, update section 2 (status and what was verified), the release's own section, sections 7.5 and 8, section 19, and say what was not run. See guide section 5, rule 7.

Last updated at the end of Releases 3B and 3C. **Built up to Release 3C.** Next: Release 4A (affiliate links and the /go redirect).

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

## Verified in the build environment (Releases 3B and 3C)
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
3. Add the `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `E2E_ADMIN_PASSWORD` secrets, run `phase-2c`, `phase-3a`, `phase-3b` and `phase-3c` on the Neon `test` branch.

## Next three tasks
1. Run the install, typecheck, lint, tests and build, fix what they report, run the smoke checklists, tag `phase-3b` and `phase-3c`.
2. Release 4A: affiliate links, the /go redirect, and the admin to create links (product pages already show them).
3. Release 4B: click reports.
