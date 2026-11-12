# Security

Living document. Each release adds what it introduces; Release 7B walks the OWASP top ten and records results here.

## In place (Phases 1 to 3A)
- **Transport and headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy (`next.config.ts`). A content security policy arrives in 7B.
- **No public registration.** There is no sign-up route. The admin is a row in the `users` table, created or changed only with `drizzle/migrations/set-admin.sql`, run by you in the Neon SQL Editor.
- **Credentials live in the database, not in config.** Email and bcrypt hash are in `users`; nothing admin-related is in Vercel variables or code. `set-admin.sql` is committed with placeholders only.
- **Passwords:** bcrypt (cost 12), 12 to 72 byte policy enforced by `set-admin.sql` and `npm run auth:hash-password`. An unknown email is compared against a throwaway hash, so it costs the same time as a wrong password, and every failure looks identical to the caller. Hashes written by Postgres `pgcrypto` (`$2a$`) are verified by a unit test.
- **Sessions:** Auth.js JWT in a secure, HTTP-only cookie, 8 hours. Permissions are copied into the token at sign-in; sensitive writes use `requirePermission(key, { fresh: true })` to re-check `is_active` in the database.
- **Authorisation:** middleware only redirects. Every page, server action and route handler checks `requirePagePermission` or `requirePermission` on the server. A missing permission is a real 403, a missing session a 401 or a redirect.
- **Open redirects:** the post-login `callbackUrl` is reduced to a same-site `/admin/...` path; host, `//`, backslashes, control characters and dot-segments are rejected (unit tested).
- **Audit trail:** sign-in (`auth.login_success`) and sign-out (`auth.logout`) are logged; admin writes from Phase 3 on call `logAudit` after every successful change. Viewer: `/admin/audit` (permission `audit:view`).
- **Login rate limiting (2C):** 5 failures per email or 20 per IP in 15 minutes block sign-in, enforced in the sign-in service. Only keyed HMAC hashes of the email and IP are stored (`login_attempts`). Details in `docs/AUTH.md`.
- **Merchant allowed domains (3A):** entered as bare hostnames, normalised (scheme, path, port stripped, punycode), and rejected when they carry a username or password, are an IP address or `localhost`, or are a shared suffix such as `co.in` or `vercel.app` (`src/modules/merchants/domains.ts`). Every change records the domains added and removed in the audit log. Release 4A's /go redirect enforces them.
- **Admin writes (3A):** categories, brands and merchants follow the write rules below; a missing permission returns "no permission" and writes nothing; errors shown to the admin never include database details. Logo and website addresses must be http(s) without embedded credentials.
- **Indexing:** admin and login pages are `noindex` and disallowed in `robots.txt`.
- **Secrets:** server-only; none have a `NEXT_PUBLIC_` prefix. See `docs/ENVIRONMENT.md`.

## Open items
- Failed sign-ins are counted in `login_attempts` (hashed) but not written to the audit log, so a flood of bad guesses cannot fill it. Successful sign-in and sign-out are audited.
- Keep the Vercel Firewall rate-limit rule on `POST /api/auth/callback/credentials` as a second layer.

## Known trade-offs
- Role changes, deactivation and new permission keys reach an already signed-in user at their next sign-in (max 8 hours) unless the action uses `fresh: true`. To end all sessions immediately, change `AUTH_SECRET` and redeploy.
- Neon keeps a history of Neon SQL Editor queries. Use the hash route of `set-admin.sql` (`npm run auth:hash-password`) so a plain password never lands there.

## Incident log
- Release 2B review: the `set-admin.sql` supplied with the code held a real email address and a plain-text password. Placeholders replaced them; **change that password** in the database, because it was shared in a file and may exist in Git history or the Neon query history.

## Rules for every new write
1. Validate with Zod. 2. `requirePermission(...)`. 3. Do the change. 4. `logAudit({ actor, action, entityType, entityId, metadata })`. 5. `revalidateTag` for exactly the tags affected. Never put secrets or personal data in audit metadata.

## Reporting
Keep a short list of findings here with date and fix commit as they are found.
