# Modules

Layers, one direction: `src/app` (routes) -> `src/modules/<name>/service.ts` -> `repository.ts` -> database. Only repositories touch the database. A module uses another module only through its `service.ts`.

## Core (shared by all modules)
| Folder | What it holds |
| --- | --- |
| `core/auth` | Auth.js config, credentials sign-in against the `users` table, password hashing |
| `core/permissions` | Permission keys, role matrix, `requirePermission`, RBAC seed |
| `core/audit` | `logAudit`, audit list for the viewer |
| `core/database` | Neon client and Drizzle schema |
| `core/config` | Env validation, cache TTLs and tags |
| `core/errors`, `core/security`, `core/validation` | Error classes and JSON mapping, redirect helpers, shared validators (`slug.ts`, `slug-rules.ts`, `fields.ts` for admin forms) |

## Shared UI (`src/shared`)
| File | Purpose |
| --- | --- |
| `navigation/admin-nav.ts` | The one place admin links are declared; hidden by permission |
| `layouts/admin-frame.tsx` | Responsive sidebar + top bar |
| `admin/data-table.tsx`, `list-toolbar.tsx`, `pagination.tsx`, `list-params.ts` | Server-paginated, searchable tables driven by URL parameters |
| `admin/form-field.tsx`, `confirm-dialog.tsx`, `toast.tsx`, `empty-state.tsx` | Form and feedback building blocks |
| `catalog/*` | Release 3C: product image, card, grid, filter bar, cursor pager, breadcrumbs, listing body |
| `admin/form-state.ts`, `action-helpers.ts`, `submit-button.tsx`, `confirm-action-button.tsx`, `notice.tsx`, `status.tsx` | Release 3A: form errors that keep what was typed, one error mapping for every server action, archive/delete confirmation, list status filter |

## Domain modules
| Module | Status | Arrives |
| --- | --- | --- |
| dashboard | counts for the admin dashboard (cached 60 s) | 2B |
| discover (categories, brands) | admin CRUD, tree, archive rules (`repository`, `service`, `validation`, `tree`, `types`) | 3A |
| merchants | admin CRUD, allowed-domains editor and normaliser (`domains.ts`) | 3A |
| products | admin products: variants, categories, attributes, tags, images, status rules (`repository`, `service`, `validation`, `form`, `rules`, `types`) | 3B |
| media | media library: one row per Cloudinary file, de-duplicated by hash, alt text, unused report | 3B |
| catalog | public reads only: visible products, search, filters, cursor pages, product page, collections (`repository`, `service`, `cursor`, `filters`, `seo`) | 3C |
| affiliate | networks, merchant programmes, affiliate links, the /go decision, link verification (`destination`, `bots`, `go`, `click-repository`, `repository`, `service`, `verify`, `validation`, `types`) | 4A |
| reports | nightly roll-up and purge, retention setting, click and conversion reports, IST day helpers, cron authorisation (`rollup`, `rollup-repository`, `report-repository`, `report-service`, `days`, `settings`, `cron-auth`) | 4B |
| conversions | conversion list, manual entry, CSV import with reconcile-on-(network, order id) (`csv`, `rows`, `repository`, `service`, `validation`, `types`) | 4B |
| deals | folder only | 5A |
| content | articles, guides, pages, authors, topics, tags; the JSON document whitelist with product embeds (`document`, `rules`, `visibility`, `validation`, `repository`, `service`, `public`, `seo`, `types`) | 6A, 6B |
| homepage | the homepage builder: per-type Zod section configs, safe link targets, signed preview links, resolvers that read each section's data from the module that owns it (`config`, `links`, `preview`, `validation`, `repository`, `service`, `types`) | 6B |
| navigation | header and footer links from `navigation_items`, with the built-in menu as fallback (`repository`, `service`, `validation`, `types`) | 6B |
| seo | folder only | 7A |
| tools, studio, business, compare | folder only, behind feature flags | 8 and later |

## Release 3A rules worth knowing
- **Slugs** are generated from the name (`-2`, `-3` on a clash) and never change silently: editing needs a ticked confirmation and is written to the audit log. Redirects from old slugs arrive in 7A.
- **Archive instead of delete.** Categories with subcategories or products, brands with products, merchants with affiliate links or programmes cannot be deleted. A category with active subcategories cannot be archived; a category cannot be moved under itself or its own descendants.
- **Usage counts** (products per category or brand, links per merchant) are read by the discover and merchants repositories straight from the shared tables, because the products and affiliate modules do not exist yet. When they do, route these counts through their `service.ts`.
- **Caching:** the category list and the parent picker read from a 24 hour cache (tag `categories`); every write revalidates exactly the tag it touched (`categories`, `brands`, `merchants`).

## Release 4A rules worth knowing
- **/go is one read and one insert.** `findGoLink` reads the link by its unique slug joined to its merchant; the click insert runs in `after()`, so the visitor never waits for it. A failed insert is logged and never breaks the redirect. The route ignores the request's query string completely.
- **The destination is checked on every click**, not only when the link is saved (`destination.ts`): https only, no username, password or port, a real domain (no IP in any spelling), and the host must equal an allowed domain of the merchant or be a subdomain of it, compared label by label (so `amazon.in.evil.com` and `evilamazon.in` fail). Spaces, tabs, line breaks and backslashes anywhere in the address are refused because the URL parser would silently drop them. A refused destination answers 404 and logs the slug and reason.
- **404 for everything that is not servable:** unknown or badly formed slug (no database read), inactive link, archived merchant, refused destination. Responses are `no-store` and `noindex`.
- **Tracking parameters** are stored as one line (`tag=khushio-21&ascsubtag={subid}`). `{subid}` is replaced by the link's slug. A parameter the destination already has is replaced, never duplicated. The click stores the sub-ID only when the parameters used `{subid}`.
- **Bots** are redirected but stored with `is_bot = true` (conservative user-agent list; no user agent at all counts as a bot). HEAD requests are answered like GET but not counted. Only the referrer's host and a two-letter country code are stored; no IP address, no user agent, no full referrer.
- **Link verification** sends one HEAD request to the destination (without tracking parameters) after the same safety check, does not follow redirects, times out after 6 seconds. Only an answer below 400 sets `last_verified_at`; stores that block automatic checks are reported as "unclear".
- **Delete rules:** a network with programmes or conversions, and a link with clicks, daily totals or conversions, cannot be deleted (untick Active instead).

## Release 4B rules worth knowing
- **Nightly job** (`/api/cron/affiliate-rollup`, 02:00 India time, `vercel.json`): counts human clicks per link and India day into `affiliate_click_daily`, then deletes raw clicks older than the retention setting (default 30 days, 7 to 365, changed on `/admin/reports`). The count uses `GREATEST`, so running the job twice, or after part of a day was purged, never changes or lowers a total. Every run re-counts the last 7 complete days and every day it is about to purge, so a missed night heals itself and a click is never deleted before it was counted. Bots are never rolled up.
- **Days** are India calendar days (`reports/days.ts`). Reports show complete days only; "today so far" comes from raw clicks.
- **The route** accepts only `Authorization: Bearer <CRON_SECRET>` (constant-time compare). `/admin/reports` has a "Run the nightly job now" button (permission `settings:manage`, fresh) that runs the same code.
- **Conversions** are one row per (network, external order id). Importing a CSV inserts new orders, updates status or commission of existing ones in place, leaves identical rows alone, and skips bad lines with their line numbers. Re-importing a file changes nothing. Dates without a time zone are India time; `01/11/2026` is read day first.

## Adding an admin screen (checklist)
1. Page under `src/app/admin/<name>/page.tsx` that starts with `requirePagePermission(...)`.
2. One entry in `ADMIN_NAV` (and an icon in `admin-frame.tsx` if new).
3. List pages: `parseListParams`, `ListToolbar`, `DataTable`, `Pagination`; fetch `limit + 1` rows instead of counting.
4. Writes: Zod, `requirePermission`, `logAudit`, `revalidateTag`.

## Release 3B rules worth knowing
- **One atomic write.** A product and its categories, attributes, tags and variants are saved together by `runAtomically` (`src/core/database/atomic.ts`): Neon's HTTP driver sends the statements as one transaction (`db.batch`), the embedded test database uses a real transaction. Never `await` a statement inside the builder.
- **Visibility is one rule** (`src/core/catalog/visibility.ts`): PUBLISHED, or SCHEDULED whose `publish_at` has passed. No cron. Every public query uses it.
- **Status permissions** (`rules.ts`): without `product:publish` a person can edit and move between Draft and In review, but cannot publish, schedule, archive or pull a live product back. New products start as Draft or In review; publishing needs a main category and one image.
- **Variants** keep their id across edits (update in place), new rows are added, missing rows deleted. Prices are integer minor units; the form takes normal amounts and refuses extra decimals (`src/core/validation/money.ts`). Dates are typed in India time (`datetime.ts`).
- **Images** go from the browser straight to Cloudinary with a server-made signature; the server verifies the response signature, folder, format, size and dimensions before saving. See `docs/IMAGES.md`.

## Release 3C rules worth knowing
- **Public pages** read only `modules/catalog` (plus the cached category, brand and merchant lookups). A draft, archived or not-yet-live product is a 404 everywhere, including the sitemap.
- **Search** is Postgres full-text (`websearch_to_tsquery`, name weighs more than summary and description), plus brand name and tag matches, plus an exact-name boost. Nothing matched on the first page: it retries with trigram similarity on the name (typos). Searches are not cached; everything else is cached 30 minutes under tag `products`, which every product write clears.
- **Cursor paging**, no OFFSET and no counts: `limit + 1` rows, the last row gives the cursor (`cursor.ts` validates every field, a bad cursor means the first page).
- **Filters** are plain query parameters (`q`, `brand`, `category`, `min`, `max`, `sort`, `cursor`). Filtered, searched and paged views are `noindex,follow` with the plain page as canonical.

## deals (Release 5A)
Offers and coupon codes. `window.ts` is the one rule for "showing now" (pure, tested to the millisecond); `conditions.ts` is its SQL twin used by every public query; `public.ts` caches lists under the tag `deals` and re-filters them with the clock at render time; `service.ts` holds admin rules (store, link and attachments checked, audit, cache tag). Uses other modules only through their services (`affiliate.findLinkRefBySlug`, `products.findProductIdsBySlugs`, `discover.findCategoryIdsBySlugs`, `merchants.findMerchant`).

## imports (Release 5B)
The CSV import engine and exports. `engine.ts` reads, maps columns, previews and writes in batches of 100 (one all-or-nothing write per batch); `mapping.ts` matches headers to fields. What a row MEANS lives in the module that owns the data: `discover/import.ts` (brands), `products/import.ts` (products and variants), `affiliate/import.ts` (links), `deals/import.ts` (deals), each with its own `import-repository.ts`. Exports use the same columns as the templates. CSV reading and writing are in `src/core/csv`.
