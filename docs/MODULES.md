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
| `core/errors`, `core/security`, `core/validation` | Error classes and JSON mapping, IP/redirect helpers, shared validators |

## Shared UI (`src/shared`)
| File | Purpose |
| --- | --- |
| `navigation/admin-nav.ts` | The one place admin links are declared; hidden by permission |
| `layouts/admin-frame.tsx` | Responsive sidebar + top bar |
| `admin/data-table.tsx`, `list-toolbar.tsx`, `pagination.tsx`, `list-params.ts` | Server-paginated, searchable tables driven by URL parameters |
| `admin/form-field.tsx`, `confirm-dialog.tsx`, `toast.tsx`, `empty-state.tsx` | Form and feedback building blocks |

## Domain modules
| Module | Status | Arrives |
| --- | --- | --- |
| dashboard | counts for the admin dashboard (cached 60 s) | 2B |
| discover (categories, brands) | folder only | 3A |
| merchants | folder only | 3A |
| affiliate | folder only | 4A |
| deals | folder only | 5A |
| content | folder only | 6A |
| seo | folder only | 7A |
| tools, studio, business, compare | folder only, behind feature flags | 8 and later |

## Adding an admin screen (checklist)
1. Page under `src/app/admin/<name>/page.tsx` that starts with `requirePagePermission(...)`.
2. One entry in `ADMIN_NAV` (and an icon in `admin-frame.tsx` if new).
3. List pages: `parseListParams`, `ListToolbar`, `DataTable`, `Pagination`; fetch `limit + 1` rows instead of counting.
4. Writes: Zod, `requirePermission`, `logAudit`, `revalidateTag`.
