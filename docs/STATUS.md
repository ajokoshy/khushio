# Status against the requirements brief

## Done in this iteration
- **Fail closed:** production never serves sample data; database errors keep the last good static page instead of showing fakes.
- **/go/[id]:** active/expiry/merchant checks, approved-domain validation, https-only, bot filtering, non-blocking click logging, 503 on database failure.
- **Multi-offer products:** each product can have several retailers, edited one at a time (the old edit overwrote all offers of a product).
- **Offer, deal and coupon lifecycle:** active flag, expiry, "last verified" dates; expired items disappear automatically; unverifiable claims removed from public copy.
- **Archive instead of delete** for products; restore from the admin list. Product list has search, status filter and pagination.
- **CSV import:** upload → preview with per-row reasons → confirm; existing products are never overwritten unless ticked; one atomic write.
- **Collections** and **product + first offer** are saved atomically.
- **Security:** CSP and security headers, no plain-text admin password in production, sessions bound to the password hash, `noreferrer` on affiliate links, safe JSON-LD, `/admin` never cached.
- **SEO:** sitemap lists only real `lastModified` dates; no price asserted in Product JSON-LD; Organization + richer Article markup; custom 404 and error pages.
- **Ops:** `/admin/status`, env validation, README, migration 008, database integration tests.

## Still pending (next tranches)
1. **Offer-level price model** (price, currency, last checked per offer) and removing product-level price/MRP; product page and cards then show per-retailer prices.
2. **Brand and category foreign keys**, slug-change redirects, redirects table and admin.
3. **Search and caching:** Postgres full-text search, pagination on shop/category pages, tag-based revalidation, `loadProducts()` no longer reads the whole catalogue per page.
4. **Homepage sections builder**, navigation menus, expanded site settings, editable legal pages, missing routes (`/deals/[slug]`, `/gifts/[occasion]`, `/journal/[category]`, curated `/compare/[slug]`, brands index, editorial policy, disclaimer).
5. **Articles:** rich text or Markdown, drafts, scheduling, categories/tags, author, SEO fields, revisions.
6. **Media library**, image provider abstraction, alt text and dimensions.
7. **Users and roles**, account recovery, click reports and daily aggregates, duplicate-click handling.
8. **Quality:** Playwright end-to-end tests, Lighthouse/accessibility passes, per-page SEO fields wired into metadata.

## Not verified here
- The CSP was checked only as response headers, not in a browser: confirm on a Vercel preview that pages, images and the admin still load, and loosen `next.config.mjs` if anything is blocked.
- The production build was run with the Google Fonts imports stubbed (the sandbox cannot reach Google), so run `npm run build` once with network access.
- Database tests ran against PostgreSQL 16 with a transaction shim for `db.batch`; Neon's real HTTP batch was not exercised. Apply migration 008 to a Neon branch first.
