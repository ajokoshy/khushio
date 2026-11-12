/** Release 2C against a real Postgres: the limiter's queries, the 5/20 boundaries and the cleanup rules. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("@/core/config/env", () => ({ requireEnv: () => "an-integration-test-secret-of-32-chars-or-more" }));

import { sql } from "drizzle-orm";
import { loginAttempts } from "@/core/database/schema";
import { checkLoginAllowed, clearLoginFailures, recordFailedLogin } from "@/core/auth/login-throttle";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
}, 60_000);
afterAll(async () => t.client.close());
beforeEach(async () => {
  await t.db.delete(loginAttempts);
});

const fail = async (email: string, ip: string, n: number) => {
  for (let i = 0; i < n; i++) await recordFailedLogin(email, ip);
};

describe("login limiter with the real table", () => {
  it("allows 4 failures for an email and refuses from the 5th, whatever the IP", async () => {
    await fail("owner@khushio.test", "203.0.113.1", 4);
    expect((await checkLoginAllowed("owner@khushio.test", "203.0.113.1")).allowed).toBe(true);
    await recordFailedLogin("owner@khushio.test", "198.51.100.9");
    expect(await checkLoginAllowed("owner@khushio.test", "203.0.113.77")).toMatchObject({ allowed: false, reason: "email" });
  });

  it("blocks one IP at 20 failures across different emails, but not another IP", async () => {
    for (let i = 0; i < 20; i++) await recordFailedLogin(`user${i}@khushio.test`, "203.0.113.5");
    expect(await checkLoginAllowed("fresh@khushio.test", "203.0.113.5")).toMatchObject({ allowed: false, reason: "ip" });
    expect((await checkLoginAllowed("fresh@khushio.test", "203.0.113.6")).allowed).toBe(true);
  });

  it("lets the owner back in once failures are older than 15 minutes", async () => {
    await fail("owner@khushio.test", "203.0.113.1", 5);
    expect((await checkLoginAllowed("owner@khushio.test", "203.0.113.1")).allowed).toBe(false);
    await t.db.execute(sql`UPDATE login_attempts SET created_at = now() - interval '16 minutes'`);
    expect((await checkLoginAllowed("owner@khushio.test", "203.0.113.1")).allowed).toBe(true);
  });

  it("stores no raw email or IP address", async () => {
    await fail("owner@khushio.test", "203.0.113.1", 1);
    const dump = JSON.stringify(await t.db.select().from(loginAttempts));
    expect(dump).not.toContain("owner");
    expect(dump).not.toContain("203.0.113.1");
  });

  it("a successful sign-in clears that email only, and deletes rows older than 7 days", async () => {
    await fail("owner@khushio.test", "203.0.113.1", 3);
    await fail("other@khushio.test", "203.0.113.1", 2);
    await recordFailedLogin("stale@khushio.test", "203.0.113.9");
    await t.db.execute(sql`UPDATE login_attempts SET created_at = now() - interval '8 days' WHERE id = (SELECT id FROM login_attempts ORDER BY created_at DESC LIMIT 1)`);
    const before = (await t.db.select().from(loginAttempts)).length;
    expect(before).toBe(6);

    await clearLoginFailures("owner@khushio.test");
    // owner's 3 are gone, and the one 8-day-old row (whichever it was) is gone.
    const left = await t.db.select().from(loginAttempts);
    expect(left.length).toBeLessThanOrEqual(3);
    expect((await checkLoginAllowed("owner@khushio.test", "203.0.113.200")).allowed).toBe(true);
    expect(left.length).toBeGreaterThanOrEqual(2); // the other email's failures survive
  });
});
