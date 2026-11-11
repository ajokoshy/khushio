# Architecture

Single Next.js (App Router) modular monolith. Layers, top to bottom:

1. `src/app`: routing only. Thin; calls module services.
2. `src/modules/<domain>`: business logic and repositories (discover, compare, affiliate, merchants, deals, content, seo, tools, studio, business). Modules never import each other's repositories; they use the owning module's public service.
3. `src/shared`: UI, layouts, hooks, constants.
4. `src/core`: auth, permissions, database, cache, validation, security, config, errors.
5. `src/infrastructure`: Cloudinary, affiliate networks, email, analytics adapters.

## Decisions
- **Design tokens** come from the supplied logo: forest green `#25402D`, coral `#E2714D`, cream `#FAF5EA`. Fraunces (display) + Jost (text).
- **DB**: Neon pooled URL for the app (`DATABASE_URL`), direct URL for migrations (`DATABASE_URL_UNPOOLED`). HTTP driver, lazy client.
- **Money**: integer minor units + explicit ISO currency.
- **Images**: Cloudinary public IDs in Postgres; `images.unoptimized` so Vercel does no image processing.
- **Clicks**: raw `affiliate_clicks` (short retention, no IP) + `affiliate_click_daily` roll-up.
- **Homepage**: `homepage_sections.type` maps to registered React components; no HTML/JS from the DB.
- **Caching**: TTLs in `src/core/config/cache.ts`.
- **Tables for Deals, CMS, SEO** are deferred to Phases 5-7.
