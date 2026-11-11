# Status

## Phase 1: foundation (done)
Structure, design tokens, layout shell, env validation, Drizzle schema + initial migration, health endpoint, robots/sitemap, security headers, Vitest setup.

## Release 2A: sign-in and permissions (code complete)
Auth.js credentials sign-in with JWT sessions, bcryptjs, `/admin-login`, role matrix + `requirePermission` / `requirePagePermission`, middleware redirect, DB-backed login rate limiting (in `audit_logs`), `seed-rbac` and `create-admin` scripts, `/api/admin/me`. Details: `docs/AUTH.md`.

## Release 2B: admin shell, audit log, CI, Playwright (code complete, awaiting your local checks)
Built:
- Layouts split: root is bare; `(public)` has the site header/footer; `(auth)` is plain; `admin` has the new shell (sidebar + top bar, mobile drawer) driven by `src/shared/navigation/admin-nav.ts`, which hides links the user cannot access.
- Shared admin components in `src/shared/admin`: server-paginated `DataTable` + `ListToolbar` + `Pagination` (URL parameters, no client JS), `FormField`, `ConfirmDialog` (native dialog), `ToastProvider`/`useToast`, `EmptyState`. No shadcn/ui or new runtime dependency was needed.
- `core/audit`: `logAudit({ actor, action, entityType, entityId, metadata })`, `logAuditMany`, `listAuditLogs`; viewer at `/admin/audit` (permission `audit:view`, search, hides failed-login counters unless ticked).
- Dashboard counts (products, affiliate links, non-bot clicks in 7 days), one cached call (60 s, tag `dashboard`), each card shown only with its permission.
- Playwright (`playwright.config.ts`, desktop + Pixel 5): signed-out redirect, 401 API, no registration, wrong password, sign-in/out, off-site callback ignored, navigation, audit row written by sign-in, analyst gets 403 with the link hidden, mobile shell menu and no sideways scroll.
- GitHub Actions `.github/workflows/ci.yml`: install, typecheck, lint, tests, build; then Playwright against the production build. Signed-in and integration tests switch on when the optional secrets exist.
- Docs: `SECURITY.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `MODULES.md`, `PERFORMANCE.md`.
- Unit tests added: admin navigation visibility, list parameters, LIKE escaping, audit mapping and pagination.
- Small changes outside the plan: `env.ts` treats empty strings as unset; audit callers use `actor`; `LOGIN_ATTEMPT_ENTITY` moved to `core/audit/constants.ts`.

Not verified (the authoring sandbox had no network): `npm install`, typecheck, lint, unit tests, build, and the Playwright run. Run them and paste any error back.

## Needs a human (outside the code)
- Add the GitHub secrets from `docs/DEPLOYMENT.md` (optional) and create the Neon `test` branch.
- After the first green CI run, protect `main` and require the two checks.

## Next three tasks
1. Run the checks, fix anything they show, tag `phase-2b`.
2. Release 3A: categories, brands, merchants admin (uses the 2B table, form and audit pieces).
3. Release 3B: products, variants, Cloudinary uploads.

Not yet done overall: remaining docs for API; Lighthouse CI (7B).
