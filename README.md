# Khushio

Discover More. Save More. Live Happier. A modular-monolith Next.js platform, affiliate-first.

## Quick start
```bash
npm install
cp .env.example .env.local   # fill in Neon + secrets
npm run db:migrate           # uses DATABASE_URL_UNPOOLED
npm run db:seed-rbac         # roles and permissions (idempotent)
npm run auth:create-admin    # first super admin, password typed at a hidden prompt
npm run dev
```
Checks: `npm run typecheck && npm run lint && npm test && npm run build`

See `docs/` for architecture, database, auth and status. Never commit or share credentials.
