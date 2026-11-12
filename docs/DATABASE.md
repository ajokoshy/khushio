# Database

Schemas in `src/core/database/schema/`: identity, catalog, merchants-affiliate, platform. They are the source of truth for the app.
Conventions: UUID PKs, `timestamptz` UTC, FK everywhere, indexes on lookup/sort columns, JSONB only for settings/config.

## How the database is created and changed
Plain, re-runnable SQL files in `drizzle/migrations/`, pasted into the Neon SQL Editor. Full rules and a template: `drizzle/migrations/README.md`.

| File | Contents | Run |
| --- | --- | --- |
| `khushio-sql-firstload.sql` | Everything up to Release 2B: pgcrypto, 29 tables, foreign keys, indexes, roles and permissions | First, once per database |
| `set-admin.sql` | Create or change the admin user (email, name, password) | After firstload, and whenever the admin changes |
| `khushio-sql-phase-<release>.sql` | The release's own additions (one file per release) | In release order, before deploying that release's code |

No file is ever edited after its release ships. There is no `drizzle-kit migrate`. `tests/unit/sql-scripts.test.ts` applies all files twice to an embedded Postgres and compares the result with the Drizzle schema (tables, columns, nullability, indexes, foreign keys, enums) and with the RBAC matrix.

## Tables created by firstload
- Identity: users, roles, permissions, user_roles, role_permissions, audit_logs.
- Catalogue: products, product_variants, product_images, categories, product_categories, product_attributes, product_tags, product_collections, collection_products, brands.
- Merchants and affiliate: merchants, merchant_programs, affiliate_networks, affiliate_links, affiliate_clicks, affiliate_click_daily, affiliate_conversions, affiliate_import_logs.
- Platform: site_settings, feature_flags, navigation_items, homepage_sections, media_assets.

## Release scripts still to come
| Release | File | Contents |
| --- | --- | --- |
| 3A | `khushio-sql-phase-3a.sql` | Optional unique index on category name per parent; otherwise a no-schema-change marker |
| 3B | `khushio-sql-phase-3b.sql` | Unique index on `media_assets.content_hash`, index on `product_images (product_id, sort_order)` |
| 3C | `khushio-sql-phase-3c.sql` | `pg_trgm`, search vector column, GIN indexes, `product_categories` indexes |
| 4A | `khushio-sql-phase-4a.sql` | No schema change (marker file) |
| 4B | `khushio-sql-phase-4b.sql` | Index on `affiliate_conversions (converted_at)`, retention setting row |
| 5A | `khushio-sql-phase-5a.sql` | deals, coupons, deal_products, deal_categories and indexes |
| 5B | `khushio-sql-phase-5b.sql` | Optional `entity` column on `affiliate_import_logs` |
| 6A | `khushio-sql-phase-6a.sql` | articles, pages, content_categories, content_tags, article_tags, author_profiles, seo_metadata |
| 6B | `khushio-sql-phase-6b.sql` | `type` column on articles and its index |
| 7A | `khushio-sql-phase-7a.sql` | redirects table, missing seo_metadata indexes |
| 7B | `khushio-sql-phase-7b.sql` | Optional index tuning |
| 8, 9 | `khushio-sql-phase-8.sql`, `khushio-sql-phase-9.sql` | Marker (8), small additions (9) |

Never run destructive SQL automatically; review every file before running it.
