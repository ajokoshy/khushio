# Status against the requirements brief

## Done
**Foundation and tranche 1:** fail-closed data layer, validated `/go/` redirects, multi-offer products, offer/deal/coupon lifecycle, archive instead of delete, safe import, security headers, hardened admin login.

**Phase 1 (data and commerce core):** per-retailer prices, brand/category foreign keys, category hierarchy, full-text search with filters, sorting and pagination, tagged caching and static generation, redirects (automatic on slug change), affiliate-links module, product preview, duplicate detection, import/export for every content table.

**Phase 2 (content, homepage and media CMS):** homepage builder (16 section types, ordering, scheduling), typed site settings, editable navigation, editable legal/information pages (incl. editorial policy and disclaimer), journal (Markdown, drafts, scheduling, categories, tags, revisions, embeds, related content), media library with provider boundary, deal pages, gift occasions, curated comparisons, brands index, shared UI kit for new screens, and the cost controls in `docs/COSTS.md` (cost panel, housekeeping, image width limits, cache tiers).

## Pending
**Phase 3 (SEO, analytics, users, security)**
- Per-page SEO fields for categories, brands and collections (products, articles and pages already have them); fuller structured data (item lists, FAQ).
- Click reports in the admin (daily totals are kept; the report screens are not built), duplicate-click handling.
- Roles and multi-user admin, account recovery (today: one owner login).
- Privacy and cookie handling review, dependency audit, rate limiting on search.
- Search type-ahead suggestions.

**Phase 4 (quality and launch)**
- Browser-based end-to-end tests (Playwright), Lighthouse and accessibility audits, keyboard testing of the admin, Content-Security-Policy check in a real browser.
- Neon and Vercel setup guides, admin user guide, backup and restore drill, launch checklist, test report.

**Smaller items left from earlier phases**
- Older admin screens still use ad-hoc styling; only screens from Phase 2 onward use the shared UI kit. No style-guide page yet.
- Articles use Markdown, not a visual editor. Homepage and menu reordering uses up/down buttons (no drag and drop). Menus are one level deep. No RSS feed.
- Collections are not part of CSV export or import; site settings and the audit log are not exported.
- A failed chunk in a very large import leaves earlier chunks saved (re-uploading the same file is safe).
- Product-level `price`/`mrp` remain as a reference price.

## Not verified here
- The production build and the live-page checks ran against a local PostgreSQL 16 with a `pg` driver substituted for Neon, and with the Google Fonts imports stubbed (the sandbox cannot reach Google). Run `npm run build` once with network access, and apply `db/upgrade-008-to-010.sql` to a Neon branch first.
- Neon's HTTP `batch` was not exercised; the database tests use a transaction shim.
- Cloudinary was exercised through a mocked network layer (the signed request and responses are checked), not a live account.
- The Content-Security-Policy was checked as response headers only, not in a browser. Admin screens were built, type-checked and exercised through their actions, but not clicked through in a browser.
