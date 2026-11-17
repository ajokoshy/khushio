/**
 * Runs the hand-written SQL files in drizzle/migrations against a real (embedded, in-memory)
 * Postgres and checks the things that matter for the "run it in the Neon SQL editor" workflow:
 *   - khushio-sql-firstload.sql and every khushio-sql-phase-*.sql apply cleanly, twice in a row
 *   - the resulting database matches the Drizzle schema in src/core/database/schema (no drift)
 *   - the RBAC seed matches src/core/permissions/matrix.ts
 *   - set-admin.sql creates, resets and re-emails the admin, and the app's bcrypt check accepts the result
 *   - the committed set-admin.sql only holds placeholders (no real credentials)
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/core/database/schema";
import { verifyPassword } from "@/core/auth/password";
import { ALL_PERMISSION_KEYS } from "@/core/permissions/keys";
import { ALL_ROLE_KEYS, ROLE_PERMISSIONS } from "@/core/permissions/matrix";

const DIR = path.resolve(__dirname, "../../drizzle/migrations");
const read = (name: string) => fs.readFileSync(path.join(DIR, name), "utf8");
const phaseFiles = fs
  .readdirSync(DIR)
  .filter((f) => /^khushio-sql-phase-.+\.sql$/.test(f))
  .sort();
const orderedScripts = ["khushio-sql-firstload.sql", ...phaseFiles];

let db: PGlite;
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
});
afterAll(async () => {
  await db.close();
});

describe("migration folder", () => {
  it("contains firstload and set-admin, and no duplicate drizzle-kit init file", () => {
    const files = fs.readdirSync(DIR);
    expect(files).toContain("khushio-sql-firstload.sql");
    expect(files).toContain("set-admin.sql");
    expect(files.filter((f) => /^\d{4}_.*\.sql$/.test(f))).toEqual([]);
  });

  it("names every other script khushio-sql-phase-<release>.sql", () => {
    const sql = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
    for (const f of sql) {
      expect(["khushio-sql-firstload.sql", "set-admin.sql"].includes(f) || /^khushio-sql-phase-[0-9][0-9a-z-]*\.sql$/.test(f), f).toBe(true);
    }
  });
});

describe("schema scripts are safe to re-run", () => {
  it.each([1, 2])("applies firstload and all phase scripts in order (run %i)", async () => {
    for (const file of orderedScripts) await db.exec(read(file));
  }, 60_000);

  it("keeps row counts stable after a second run (no duplicates)", async () => {
    const count = async () =>
      Number((await db.query<{ n: number }>("SELECT (SELECT count(*) FROM roles) + (SELECT count(*) FROM permissions) + (SELECT count(*) FROM role_permissions) AS n")).rows[0]?.n);
    const before = await count();
    for (const file of orderedScripts) await db.exec(read(file));
    expect(await count()).toBe(before);
  }, 60_000);
});

describe("database matches the Drizzle schema", () => {
  const tables = (Object.values(schema).filter((t) => is(t, PgTable)) as unknown as PgTable[]).map((t) => getTableConfig(t));

  it("has a table for every Drizzle table and nothing extra", async () => {
    const { rows } = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    expect(rows.map((r) => r.table_name).sort()).toEqual(tables.map((t) => t.name).sort());
  });

  it("has exactly the columns, with the same nullability, for every table", async () => {
    for (const t of tables) {
      const { rows } = await db.query<{ column_name: string; is_nullable: string }>(
        "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [t.name],
      );
      const actual = new Map(rows.map((r) => [r.column_name, r.is_nullable === "NO"]));
      // Primary-key columns (single or composite) are NOT NULL in Postgres even when Drizzle does not flag them.
      const inCompositePk = (name: string) => t.primaryKeys.some((pk) => pk.columns.some((c) => c.name === name));
      const expected = new Map(t.columns.map((c) => [c.name, c.notNull || c.primary || inCompositePk(c.name)]));
      expect([...actual.keys()].sort(), t.name).toEqual([...expected.keys()].sort());
      for (const [name, notNull] of expected) expect(actual.get(name), `${t.name}.${name} NOT NULL`).toBe(notNull);
    }
  });

  it("has every index and foreign key declared in the schema", async () => {
    const idx = new Set((await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")).rows.map((r) => r.indexname));
    const fks = new Set((await db.query<{ conname: string }>("SELECT conname FROM pg_constraint WHERE contype = 'f'")).rows.map((r) => r.conname));
    for (const t of tables) {
      for (const i of t.indexes) expect(idx.has(i.config.name ?? ""), `index ${i.config.name} on ${t.name}`).toBe(true);
      for (const fk of t.foreignKeys) expect(fks.has(fk.getName()), `foreign key ${fk.getName()}`).toBe(true);
    }
  });

  it("has the product_status enum with every status", async () => {
    const { rows } = await db.query<{ enumlabel: string }>("SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'product_status' ORDER BY e.enumsortorder");
    expect(rows.map((r) => r.enumlabel)).toEqual(["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED", "DISCONTINUED"]);
  });
});

describe("RBAC seed matches src/core/permissions/matrix.ts", () => {
  it("has the same permissions, roles and grants", async () => {
    const perms = (await db.query<{ key: string }>("SELECT key FROM permissions")).rows.map((r) => r.key).sort();
    expect(perms).toEqual([...ALL_PERMISSION_KEYS].sort());
    const roles = (await db.query<{ key: string }>("SELECT key FROM roles")).rows.map((r) => r.key).sort();
    expect(roles).toEqual([...ALL_ROLE_KEYS].sort());
    for (const role of ALL_ROLE_KEYS) {
      const { rows } = await db.query<{ key: string }>(
        "SELECT p.key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.key = $1",
        [role],
      );
      expect(rows.map((r) => r.key).sort(), role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });
});

describe("set-admin.sql", () => {
  const template = read("set-admin.sql");
  const setVar = (sql: string, name: string, value: string) =>
    sql.replace(new RegExp(`(v_${name}\\s+text := ')[^']*(')`), (_m, a: string, b: string) => a + value.replace(/'/g, "''") + b);
  const render = (vars: Record<string, string>) => Object.entries(vars).reduce((sql, [k, v]) => setVar(sql, k, v), template);
  const userRow = async (email: string) =>
    (await db.query<{ password_hash: string; is_active: boolean; name: string | null }>("SELECT password_hash, is_active, name FROM users WHERE email = $1", [email])).rows[0];

  it("is committed with placeholders only", () => {
    expect(template).toMatch(/v_email\s+text := 'admin@example\.com'/);
    expect(template).toMatch(/v_password\s+text := ''/);
    expect(template).toMatch(/v_password_hash\s+text := ''/);
    expect(template).toMatch(/v_replace_email\s+text := ''/);
  });

  it("refuses the untouched placeholder, short passwords and bad emails", async () => {
    await expect(db.exec(render({}))).rejects.toThrow(/placeholder/);
    await expect(db.exec(render({ email: "owner@khushio.test", password: "short" }))).rejects.toThrow(/at least 12/);
    await expect(db.exec(render({ email: "not-an-email", password: "long-enough-password" }))).rejects.toThrow(/valid email/);
    await expect(db.exec(render({ email: "o@khushio.test", password: "long-enough-password", password_hash: "$2b$12$" + "a".repeat(53) }))).rejects.toThrow(/not both/);
    await expect(db.exec(render({ email: "o@khushio.test", password_hash: "plain-text" }))).rejects.toThrow(/not a bcrypt hash/);
  });

  it("creates the admin with a lower-cased email and a hash the app accepts", async () => {
    await db.exec(render({ email: "  Owner@Khushio.test ", name: "Owner", password: "first-password-123" }));
    const u = await userRow("owner@khushio.test");
    expect(u?.is_active).toBe(true);
    expect(u?.password_hash).not.toContain("first-password");
    expect(await verifyPassword("first-password-123", u!.password_hash)).toBe(true);
    expect(await verifyPassword("wrong-password-999", u!.password_hash)).toBe(false);
  });

  it("re-running resets the password and re-activates the same user (no second row)", async () => {
    await db.exec("UPDATE users SET is_active = false WHERE email = 'owner@khushio.test'");
    await db.exec(render({ email: "owner@khushio.test", name: "Owner", password: "second-password-456" }));
    const u = await userRow("owner@khushio.test");
    expect(u?.is_active).toBe(true);
    expect(await verifyPassword("second-password-456", u!.password_hash)).toBe(true);
    expect(await verifyPassword("first-password-123", u!.password_hash)).toBe(false);
    expect(Number((await db.query<{ n: number }>("SELECT count(*) AS n FROM users")).rows[0]?.n)).toBe(1);
  });

  it("accepts a pre-made bcrypt hash instead of a plain password", async () => {
    const { hashPassword } = await import("@/core/auth/password");
    const hash = await hashPassword("hash-route-password-1", 4);
    await db.exec(render({ email: "owner@khushio.test", name: "Owner", password_hash: hash }));
    expect(await verifyPassword("hash-route-password-1", (await userRow("owner@khushio.test"))!.password_hash)).toBe(true);
  });

  it("changes the email through v_replace_email, and fails for an unknown current email", async () => {
    await db.exec(render({ email: "new@khushio.test", replace_email: "owner@khushio.test", name: "Owner", password: "third-password-789" }));
    expect(await userRow("owner@khushio.test")).toBeUndefined();
    expect(await userRow("new@khushio.test")).toBeDefined();
    await expect(db.exec(render({ email: "x@khushio.test", replace_email: "ghost@khushio.test", password: "third-password-789" }))).rejects.toThrow(/No user with email/);
  });
});

describe("khushio-sql-phase-2c.sql (login rate limiting)", () => {
  it("creates login_attempts holding hashes only: no raw email or IP column", async () => {
    const { rows } = await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'login_attempts'");
    expect(rows.map((r) => r.column_name).sort()).toEqual(["created_at", "email_hash", "id", "ip_hash"]);
  });

  it("is a new table only: running it on a database that already has rows keeps them", async () => {
    await db.exec("INSERT INTO login_attempts (email_hash, ip_hash) VALUES ('e', 'i')");
    await db.exec(read("khushio-sql-phase-2c.sql"));
    expect(Number((await db.query<{ n: number }>("SELECT count(*) AS n FROM login_attempts")).rows[0]?.n)).toBe(1);
    await db.exec("DELETE FROM login_attempts");
  });
});

describe("khushio-sql-phase-3a.sql (categories, brands, merchants)", () => {
  it("adds brands.is_active as NOT NULL DEFAULT true, so existing rows and the old code stay valid", async () => {
    await db.exec("INSERT INTO brands (slug, name) VALUES ('old-code-brand', 'Old code brand')"); // an insert that does not know the column
    const { rows } = await db.query<{ is_active: boolean }>("SELECT is_active FROM brands WHERE slug = 'old-code-brand'");
    expect(rows[0]?.is_active).toBe(true);
    await db.exec("DELETE FROM brands WHERE slug = 'old-code-brand'");
  });

  it("allows one category name per parent, ignoring case, including among top-level categories", async () => {
    await db.exec("INSERT INTO categories (id, slug, name) VALUES ('11111111-1111-1111-1111-111111111111', 'fashion', 'Fashion')");
    await expect(db.exec("INSERT INTO categories (slug, name) VALUES ('fashion-2', 'FASHION')")).rejects.toThrow(/categories_parent_name_uq/);

    await db.exec("INSERT INTO categories (slug, name, parent_id) VALUES ('fashion-shoes', 'Shoes', '11111111-1111-1111-1111-111111111111')");
    await expect(db.exec("INSERT INTO categories (slug, name, parent_id) VALUES ('fashion-shoes-2', 'shoes', '11111111-1111-1111-1111-111111111111')")).rejects.toThrow(/categories_parent_name_uq/);

    // The same name under a different parent (or at the top level) is fine.
    await db.exec("INSERT INTO categories (slug, name) VALUES ('shoes', 'Shoes')");
    await db.exec("DELETE FROM categories");
  });

  it("is safe to run on a database that already has data", async () => {
    await db.exec("INSERT INTO categories (slug, name) VALUES ('keep-me', 'Keep me')");
    await db.exec(read("khushio-sql-phase-3a.sql"));
    expect(Number((await db.query<{ n: number }>("SELECT count(*) AS n FROM categories")).rows[0]?.n)).toBe(1);
    await db.exec("DELETE FROM categories");
  });
});

describe("khushio-sql-phase-4a.sql (affiliate links and /go: no schema change)", () => {
  it("changes nothing: it only reads, and its status query runs and shows what /go relies on", async () => {
    const sql = read("khushio-sql-phase-4a.sql");
    expect(sql).not.toMatch(/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/im);
    const results = await db.exec(sql);
    const row = results.at(-1)?.rows[0] as Record<string, unknown>;
    expect(Number(row.link_slug_unique)).toBe(1);
    expect(Number(row.click_indexes_of_2)).toBe(2);
    expect(Number(row.allowed_domains_column)).toBe(1);
    expect(row.status).toBe("khushio-sql-phase-4a applied (no schema change)");
  });
});

describe("khushio-sql-phase-4b.sql (click roll-up and retention)", () => {
  const retention = async () => (await db.query<{ value: unknown }>("SELECT value FROM site_settings WHERE key = 'affiliate.click_retention_days'")).rows;

  it("adds the conversions date index and seeds the retention setting with 30 days", async () => {
    const idx = await db.query("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'conv_converted_at_idx'");
    expect(idx.rows).toHaveLength(1);
    expect(await retention()).toEqual([{ value: 30 }]);
  });

  it("never overwrites a retention value you changed, and never adds a second row", async () => {
    await db.exec("UPDATE site_settings SET value = '14'::jsonb WHERE key = 'affiliate.click_retention_days'");
    await db.exec(read("khushio-sql-phase-4b.sql"));
    expect(await retention()).toEqual([{ value: 14 }]);
    await db.exec("UPDATE site_settings SET value = '30'::jsonb WHERE key = 'affiliate.click_retention_days'");
  });

  it("ends with a status row", async () => {
    const results = await db.exec(read("khushio-sql-phase-4b.sql"));
    expect((results.at(-1)?.rows[0] as { status: string }).status).toBe("khushio-sql-phase-4b applied");
  });
});

describe("khushio-sql-phase-5a.sql (deals and coupons)", () => {
  const M = "22222222-2222-4222-8222-222222222222";
  const D = "33333333-3333-4333-8333-333333333333";
  const count = async (table: string) => Number((await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

  it("creates exactly the four new tables, and its status row reports them", async () => {
    const results = await db.exec(read("khushio-sql-phase-5a.sql"));
    const row = results.at(-1)?.rows[0] as Record<string, unknown>;
    expect(Number(row.tables_of_4)).toBe(4);
    expect(Number(row.indexes_of_9)).toBe(9);
    expect(Number(row.foreign_keys_of_8)).toBe(8);
    expect(row.status).toBe("khushio-sql-phase-5a applied");
  });

  it("is safe to run on a database that already has deals", async () => {
    await db.exec(`INSERT INTO merchants (id, slug, name) VALUES ('${M}', 'deal-store', 'Deal store')`);
    await db.exec(`INSERT INTO deals (id, slug, title, merchant_id, status) VALUES ('${D}', 'first-deal', 'First deal', '${M}', 'published')`);
    await db.exec(read("khushio-sql-phase-5a.sql"));
    expect(await count("deals")).toBe(1);
  });

  it("gives new rows safe defaults: a draft deal that starts now, an active coupon", async () => {
    const deal = (await db.query<{ status: string; type: string; is_featured: boolean; sort_order: number; ends_at: unknown }>("SELECT status, type, is_featured, sort_order, ends_at FROM deals WHERE id = $1", [D])).rows[0];
    expect(deal).toMatchObject({ status: "published", type: "deal", is_featured: false, sort_order: 0, ends_at: null });
    await db.exec(`INSERT INTO deals (slug, title, merchant_id) VALUES ('default-deal', 'Default', '${M}')`);
    expect((await db.query<{ status: string }>("SELECT status FROM deals WHERE slug = 'default-deal'")).rows[0]?.status).toBe("draft");
  });

  it("keeps one code per store, ignoring case, but allows the same code at another store", async () => {
    await db.exec(`INSERT INTO coupons (merchant_id, code) VALUES ('${M}', 'Save15')`);
    await expect(db.exec(`INSERT INTO coupons (merchant_id, code) VALUES ('${M}', 'SAVE15')`)).rejects.toThrow(/coupons_merchant_code_uq/);
    await db.exec("INSERT INTO merchants (id, slug, name) VALUES ('44444444-4444-4444-8444-444444444444', 'other-store', 'Other store')");
    await db.exec("INSERT INTO coupons (merchant_id, code) VALUES ('44444444-4444-4444-8444-444444444444', 'SAVE15')");
  });

  it("removes a deal's coupons and attachments with it, but refuses to delete a store that has deals", async () => {
    await db.exec(`INSERT INTO coupons (deal_id, merchant_id, code) VALUES ('${D}', '${M}', 'INSIDE')`);
    await expect(db.exec(`DELETE FROM merchants WHERE id = '${M}'`)).rejects.toThrow();
    await db.exec(`DELETE FROM deals WHERE id = '${D}'`);
    expect((await db.query("SELECT 1 FROM coupons WHERE code = 'INSIDE'")).rows).toHaveLength(0);
    expect((await db.query("SELECT 1 FROM coupons WHERE code = 'Save15'")).rows).toHaveLength(1); // stand-alone coupons stay
  });
});

describe("khushio-sql-phase-5b.sql (CSV import and export)", () => {
  it("adds a nullable entity column to the import log, without a default, and an index on started_at", async () => {
    const col = (await db.query<{ is_nullable: string; column_default: string | null }>("SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'affiliate_import_logs' AND column_name = 'entity'")).rows[0];
    expect(col).toEqual({ is_nullable: "YES", column_default: null });
    expect((await db.query("SELECT 1 FROM pg_indexes WHERE indexname = 'import_logs_started_idx'")).rows).toHaveLength(1);
  });

  it("keeps rows written before the release (entity stays NULL) and ends with its status row", async () => {
    await db.exec("INSERT INTO affiliate_import_logs (source, rows_processed, rows_failed) VALUES ('csv:old', 3, 0)");
    const results = await db.exec(read("khushio-sql-phase-5b.sql"));
    const row = results.at(-1)?.rows[0] as Record<string, unknown>;
    expect(Number(row.entity_column)).toBe(1);
    expect(Number(row.history_index)).toBe(1);
    expect(row.status).toBe("khushio-sql-phase-5b applied");
    expect((await db.query<{ entity: string | null }>("SELECT entity FROM affiliate_import_logs WHERE source = 'csv:old'")).rows[0]?.entity).toBeNull();
  });
});
