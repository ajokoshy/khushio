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
  db = new PGlite({ extensions: { pgcrypto } });
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
