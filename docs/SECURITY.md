# Security

Living document. Each release adds what it introduces; Release 7B walks the OWASP top ten and records results here.

## In place (Phases 1 to 2B)
- **Transport and headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy (`next.config.ts`). A content security policy arrives in 7B.
- **No public registration.** Admins are created only by `npm run auth:create-admin`, run from an operator's machine. The password is typed at a hidden prompt and never stored in a file or in Vercel.
- **Passwords:** bcrypt (cost 12), 12 to 72 byte policy. Unknown emails cost the same time as wrong passwords, and every failure looks identical to the caller.
- **Sessions:** Auth.js JWT in a secure, HTTP-only cookie, 8 hours. Permissions are copied into the token at sign-in; sensitive writes use `requirePermission(key, { fresh: true })` to re-read the database.
- **Authorisation:** middleware only redirects. Every page, server action and route handler checks `requirePagePermission` or `requirePermission` on the server. A missing permission is a real 403, a missing session a 401 or a redirect.
- **Login throttling:** 5 failures per email and 20 per IP per 15 minutes, stored as HMAC-hashed keys in `audit_logs`. Applies to every sign-in path, including direct posts to `/api/auth/callback/credentials`.
- **Open redirects:** the post-login `callbackUrl` is restricted to `/admin/...` paths.
- **Audit trail:** sign-in, failures, sign-out, user creation and password resets are logged; admin writes from Phase 3 on call `logAudit` after every successful change. Viewer: `/admin/audit` (permission `audit:view`).
- **Indexing:** admin and login pages are `noindex` and disallowed in `robots.txt`.
- **Secrets:** server-only; none have a `NEXT_PUBLIC_` prefix. See `docs/ENVIRONMENT.md`.

## Known trade-offs
- Someone who knows an admin's email can lock that account for 15 minutes with bad attempts; they cannot sign in.
- Role changes and deactivation reach an already signed-in user at their next sign-in (max 8 hours) unless the action uses `fresh: true`.
- Failed-login counter rows accumulate in `audit_logs`; they are pruned in 4B/7B.

## Rules for every new write
1. Validate with Zod. 2. `requirePermission(...)`. 3. Do the change. 4. `logAudit({ actor, action, entityType, entityId, metadata })`. 5. `revalidateTag` for exactly the tags affected. Never put secrets or personal data in audit metadata.

## Reporting
Keep a short list of findings here with date and fix commit as they are found.
