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
| affiliate | folder only | 4A |
| deals | folder only | 5A |
| content | folder only | 6A |
| seo | folder only | 7A |
| tools, studio, business, compare | folder only, behind feature flags | 8 and later |

## Release 3A rules worth knowing
- **Slugs** are generated from the name (`-2`, `-3` on a clash) and never change silently: editing needs a ticked confirmation and is written to the audit log. Redirects from old slugs arrive in 7A.
- **Archive instead of delete.** Categories with subcategories or products, brands with products, merchants with affiliate links or programmes cannot be deleted. A category with active subcategories cannot be archived; a category cannot be moved under itself or its own descendants.
- **Usage counts** (products per category or brand, links per merchant) are read by the discover and merchants repositories straight from the shared tables, because the products and affiliate modules do not exist yet. When they do, route these counts through their `service.ts`.
- **Caching:** the category list and the parent picker read from a 24 hour cache (tag `categories`); every write revalidates exactly the tag it touched (`categories`, `brands`, `merchants`).

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
