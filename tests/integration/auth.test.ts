import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs only when TEST_DATABASE_URL points at a dedicated Neon test branch that already has the
 * migrations applied. Never point it at production. Skipped otherwise, so `npm test` stays green
 * on machines and CI runs without a database.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("authentication (integration)", () => {
  const tag = randomBytes(4).toString("hex");
  const password = "a-long-test-password-1";
  const created: string[] = [];
  let service: typeof import("@/core/auth/service");
  let repo: typeof import("@/core/auth/repository");
  let db: typeof import("@/core/database/client");
  let schema: typeof import("@/core/database/schema");
  let drizzle: typeof import("drizzle-orm");

  const email = (n: string) => `it-${tag}-${n}@example.test`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.AUTH_SECRET = "integration-test-secret-integration-test";
    service = await import("@/core/auth/service");
    repo = await import("@/core/auth/repository");
    db = await import("@/core/database/client");
    schema = await import("@/core/database/schema");
    drizzle = await import("drizzle-orm");
    const { syncRbac } = await import("@/core/permissions/repository");
    await syncRbac();
  });

  afterAll(async () => {
    for (const id of created) await repo.deleteUserById(id);
    await db.db().delete(schema.auditLogs).where(drizzle.eq(schema.auditLogs.entityType, repo.LOGIN_ATTEMPT_ENTITY));
  });

  async function makeUser(name: string, role: "super_admin" | "analyst" = "analyst") {
    const user = await service.createAdminUser({ email: email(name), password, role, passwordCost: 4 });
    created.push(user.id);
    return user;
  }

  it("signs in with the correct password and returns roles and permissions", async () => {
    await makeUser("ok", "analyst");
    const result = await service.authenticate({ email: email("ok"), password }, { ip: "203.0.113.1" });
    expect(result?.roles).toEqual(["analyst"]);
    expect(result?.permissions).toContain("report:view");
    expect(result?.permissions).not.toContain("product:write");
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    await makeUser("wrong");
    expect(await service.authenticate({ email: email("wrong"), password: "nope-nope-nope" }, { ip: "203.0.113.2" })).toBeNull();
    expect(await service.authenticate({ email: email("ghost"), password }, { ip: "203.0.113.3" })).toBeNull();
  });

  it("blocks an inactive user even with the right password", async () => {
    const user = await makeUser("inactive");
    await db.db().update(schema.users).set({ isActive: false }).where(drizzle.eq(schema.users.id, user.id));
    expect(await service.authenticate({ email: email("inactive"), password }, { ip: "203.0.113.4" })).toBeNull();
  });

  it("locks out after repeated failures, even for the correct password", async () => {
    await makeUser("locked");
    for (let i = 0; i < 5; i++) {
      await service.authenticate({ email: email("locked"), password: "bad-bad-bad-bad" }, { ip: null });
    }
    expect(await service.authenticate({ email: email("locked"), password }, { ip: null })).toBeNull();
  });

  it("refuses to create a duplicate user", async () => {
    await makeUser("dup");
    await expect(service.createAdminUser({ email: email("dup"), password, passwordCost: 4 })).rejects.toThrow(/already exists/);
  });
});
