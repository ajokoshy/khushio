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
| `admin/form-state.ts`, `action-helpers.ts`, `submit-button.tsx`, `confirm-action-button.tsx`, `notice.tsx`, `status.tsx` | Release 3A: form errors that keep what was typed, one error mapping for every server action, archive/delete confirmation, list status filter |

## Domain modules
| Module | Status | Arrives |
| --- | --- | --- |
| dashboard | counts for the admin dashboard (cached 60 s) | 2B |
| discover (categories, brands) | admin CRUD, tree, archive rules (`repository`, `service`, `validation`, `tree`, `types`) | 3A |
| merchants | admin CRUD, allowed-domains editor and normaliser (`domains.ts`) | 3A |
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
