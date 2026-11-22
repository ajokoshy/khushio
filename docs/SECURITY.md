# Security

Living document. Each release adds what it introduces; Release 7B walked the OWASP top ten (below).

## In place (Phases 1 to 4B)
- **Transport and headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy (`next.config.ts`). A content security policy arrives in 7B.
- **No public registration.** There is no sign-up route. The admin is a row in the `users` table, created or changed only with `drizzle/migrations/set-admin.sql`, run by you in the Neon SQL Editor.
- **Credentials live in the database, not in config.** Email and bcrypt hash are in `users`; nothing admin-related is in Vercel variables or code. `set-admin.sql` is committed with placeholders only.
- **Passwords:** bcrypt (cost 12), 12 to 72 byte policy enforced by `set-admin.sql` and `npm run auth:hash-password`. An unknown email is compared against a throwaway hash, so it costs the same time as a wrong password, and every failure looks identical to the caller. Hashes written by Postgres `pgcrypto` (`$2a$`) are verified by a unit test.
- **Sessions:** Auth.js JWT in a secure, HTTP-only cookie, 8 hours. Permissions are copied into the token at sign-in; sensitive writes use `requirePermission(key, { fresh: true })` to re-check `is_active` in the database.
- **Authorisation:** middleware only redirects. Every page, server action and route handler checks `requirePagePermission` or `requirePermission` on the server. A missing permission is a real 403, a missing session a 401 or a redirect.
- **Redirect rules (7A):** only plain same-site paths (no host, no `//`, no query, lower case); never from or into `/admin`, `/api`, `/go`; chains and loops refused. The middleware only reads a map of old and new public paths, and a failed load means "no redirect", never an error page. `/api/redirect-map` exposes nothing private. Structured data is serialised with `<`, `>` and `&` escaped, so text in a title cannot close the script tag.
- **Open redirects:** the post-login `callbackUrl` is reduced to a same-site `/admin/...` path; host, `//`, backslashes, control characters and dot-segments are rejected (unit tested).
- **Audit trail:** sign-in (`auth.login_success`) and sign-out (`auth.logout`) are logged; admin writes from Phase 3 on call `logAudit` after every successful change. Viewer: `/admin/audit` (permission `audit:view`).
- **Login rate limiting (2C):** 5 failures per email or 20 per IP in 15 minutes block sign-in, enforced in the sign-in service. Only keyed HMAC hashes of the email and IP are stored (`login_attempts`). Details in `docs/AUTH.md`.
- **Merchant allowed domains (3A):** entered as bare hostnames, normalised (scheme, path, port stripped, punycode), and rejected when they carry a username or password, are an IP address or `localhost`, or are a shared suffix such as `co.in` or `vercel.app` (`src/modules/merchants/domains.ts`). Every change records the domains added and removed in the audit log. Release 4A's /go redirect enforces them.
- **Uploads (3B):** the Cloudinary API secret never leaves the server. The browser gets a short-lived signature locked to the `khushio/products` folder and the allowed formats. The server then verifies Cloudinary's response signature, so a made-up `public_id` is refused, and checks folder, format, size and dimensions; a stray file is deleted from Cloudinary again. Add the size limit in Cloudinary too (see `docs/IMAGES.md`).
- **Public catalogue (3C):** every public query goes through the visibility rule; search text is passed to Postgres as a parameter and parsed with `websearch_to_tsquery` (never as query syntax); cursors are validated field by field; address parameters that do not parse are ignored. Affiliate links on product pages carry `rel="sponsored nofollow noopener"`.
- **Affiliate redirect (4A):** `/go/[slug]` never reads its query string and never takes a destination from the request. The stored destination is re-checked on every click against the merchant's allowed domains (https only, no credentials or port, no IP address, label-exact host match, no hidden whitespace or backslashes), so an edit of the merchant's domains or a hand-edited row cannot create an open redirect. Failures answer 404. Clicks store no IP address, user agent or full referrer. Details and tests: `docs/MODULES.md` (4A rules), `tests/unit/affiliate-destination.test.ts`, `tests/integration/affiliate.test.ts`.
- **Link verification (4A):** the server only requests an address that passed the same check, does not follow redirects and times out after 6 seconds, so it cannot be steered to an internal address.
- **Nightly job (4B):** `/api/cron/affiliate-rollup` requires `CRON_SECRET` as a Bearer token (constant-time compare); a missing or short secret refuses everyone. The job is idempotent and only deletes raw clicks older than the retention setting, after counting them.
- **Admin writes (3A):** categories, brands and merchants follow the write rules below; a missing permission returns "no permission" and writes nothing; errors shown to the admin never include database details. Logo and website addresses must be http(s) without embedded credentials.
- **Indexing:** admin and login pages are `noindex` and disallowed in `robots.txt`.
- **Secrets:** server-only; none have a `NEXT_PUBLIC_` prefix. See `docs/ENVIRONMENT.md`.

## Release 7B: security pass
Done on the 7A code base. Everything below was checked by tests that run in `npm test` unless it says "by hand".

**New protections**
- **Content-Security-Policy** (`src/core/security/csp.ts`, applied in `next.config.ts`): no plug-ins, no framing, no other base address, forms only to this site, scripts only from this site (plus `'unsafe-inline'`, see below), connections only to this site and Cloudinary's upload address, images from https. It is sent in **report-only mode first**; violations are logged as `khushio.csp` lines in the Vercel logs through `/api/csp-report`. Set `CSP_ENFORCE=true` and redeploy once a week of logs is quiet. `'unsafe-inline'` stays for scripts because Next.js needs inline scripts to hydrate and a nonce would make every page dynamic (no cache, higher cost). Nothing user-supplied is ever put into a script (JSON-LD is escaped, the editor renders React elements only).
- **More headers:** `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, wider Permissions-Policy.
- **Rate limits on public write endpoints:** the only public endpoints that can write are `/go` (click recording) and `/api/csp-report`. Both use an in-memory per-visitor limiter (`src/core/security/rate-limit.ts`): `/go` still sends the visitor on but stops recording clicks above 120 a minute from one address; the report endpoint answers 204 and ignores above 20 a minute and any body over 8 KB. A test fails if another public POST route appears without review. The admin login keeps its own database-backed throttle (Release 2C).
- **Auth bypass guard:** `tests/unit/security-guards.test.ts` reads the source and fails if any admin page, exported server action or admin route handler does not call a permission check (directly or through a helper in the same file). 157 checks today, all passing.
- **Fixed in this pass:** `safeHref` accepted `/\evil.example` as a "path on this site". Browsers read the backslash as a slash, so an editor link, a navigation link or a homepage button could have led off-site. Backslashes are now refused everywhere addresses are checked (editor links, navigation, homepage buttons) and tests cover it.
- **Secrets scan:** `npm run check:secrets` (also in CI) fails on private keys, cloud and payment tokens, password hashes, database addresses with a password, Cloudinary URLs and tracked `.env` files. Reviewed false positives are marked with `secrets-scan:allow` on their own line (one: the timing-equaliser hash). Turn on GitHub secret scanning too (Settings, Code security).
- **Error monitoring:** every uncaught server error is written as one `khushio.error` line (no query string, no body, message clipped) by `src/instrumentation.ts`. Search the Vercel logs for it. Public pages show a friendly error with a reference number.

**Dependency audit (`npm audit --omit=dev`, Release 7B)** 30 findings before, 27 moderate and 3 high. Fixed: `drizzle-orm` raised to 0.45.4 (SQL injection through badly escaped identifiers; the app never builds identifiers from input, fixed anyway) and `postcss` forced to 8.5.33 through `overrides` (CSS stringify XSS and source-map file read; build-time only). **Accepted for now, with reasons:**
- `zod` 3.x (high: memory exhaustion validating huge constrained collections): the fix is Zod 4, a breaking migration. Exposure is low: no public endpoint parses with Zod; admin forms need a login and request bodies are limited to 3 MB. Plan: migrate to Zod 4 in a maintenance release.
- `@tiptap/*` 2.x (moderate, 27 packages: prototype pollution in `mergeAttributes`): fix is Tiptap 3, breaking. The editor runs only for signed-in staff, and every saved document is rebuilt from an allow-list on the server (`sanitizeDocument`), so a polluted attribute is dropped. Plan: Tiptap 3 in a maintenance release.
- `next` bundling an old `postcss` is covered by the override; the remaining `next` advisory text points to Next 16, a breaking upgrade scheduled separately.
Run `npm audit` monthly; `npm audit fix` is safe only for the non-breaking ones it lists.

**OWASP Top 10 (2021) walk**

| # | Risk | Result |
| --- | --- | --- |
| A01 | Broken access control | Every admin page, action and route checks a permission, enforced by a test that reads the source. `fresh: true` re-reads the database for user and settings changes. Public write endpoints are limited. No finding. |
| A02 | Cryptographic failures | HTTPS only (HSTS with preload), passwords hashed with bcrypt, login attempts stored as keyed hashes, cron secret compared in constant time, upload signatures verified. Session is a signed JWT (8 hours). No secrets in `NEXT_PUBLIC_` variables. No finding. |
| A03 | Injection | Every database call goes through Drizzle (parameterised); `LIKE` input is escaped; editor documents are rebuilt from an allow-list and rendered as React elements (no `dangerouslySetInnerHTML` except JSON-LD, which is escaped); CSV import cells are escaped on export. The one real finding (backslash links) is fixed. 40 hostile-input tests. |
| A04 | Insecure design | Redirect rules reject chains, loops and reserved paths; click recording cannot be flooded into the database; deletes are explicit and audited. No finding. |
| A05 | Security misconfiguration | Headers and CSP as above; no `X-Powered-By`; robots blocks `/admin`, `/api`, `/go`. Preview deployments are protected by Vercel (by hand). CSP is report-only until you enforce it. **Open:** enforce the CSP after a clean week. |
| A06 | Vulnerable and outdated components | Audit above: two fixed, two accepted with a plan. Dependabot is configured. |
| A07 | Identification and authentication failures | Login throttle (database-backed) plus an optional Vercel Firewall rule; 8-hour sessions; generic error text; timing-equalised failures; open redirect on the login page tested (9 payloads). **Known trade-off:** a deactivated user keeps a signed-in session up to 8 hours (see trade-offs). |
| A08 | Software and data integrity failures | CI runs typecheck, lint, tests, build, secrets scan; lockfile committed; no remote scripts except Vercel's own analytics script; database scripts are additive and tested twice over. |
| A09 | Security logging and monitoring failures | Audit log for every write; failed logins counted; `khushio.error` and `khushio.csp` lines in Vercel logs. **By hand:** set a Vercel log alert or look at the logs weekly for the first month. |
| A10 | Server-side request forgery | The server fetches only Cloudinary (fixed host) and its own redirect map; affiliate destinations are validated against each merchant's allowed domains and are never fetched by the server. No finding. |

## Open items
- Enforce the CSP (`CSP_ENFORCE=true`) after a week without `khushio.csp` lines for your own pages.
- Zod 4 and Tiptap 3 migrations (see the audit above).
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
