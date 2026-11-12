import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { loginSchema } from "@/core/auth/validation";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple", 4);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password entirely", hash)).toBe(false);
  });

  it("salts: the same password hashes differently each time", async () => {
    const a = await hashPassword("same-password-123", 4);
    const b = await hashPassword("same-password-123", 4);
    expect(a).not.toBe(b);
  });
});

describe("hashes made by Postgres pgcrypto (set-admin.sql)", () => {
  // set-admin.sql stores crypt(password, gen_salt('bf', 12)), which produces $2a$ hashes.
  // These are published bcrypt test vectors: the app must accept the $2a$ prefix.
  it("verifies $2a$ bcrypt hashes", async () => {
    expect(await verifyPassword("U*U", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW")).toBe(true);
    expect(await verifyPassword("abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i")).toBe(true);
    expect(await verifyPassword("abd", "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i")).toBe(false);
  });
});

describe("login schema", () => {
  it("normalises the email", () => {
    const r = loginSchema.parse({ email: "  Admin@Khushio.COM ", password: "x" });
    expect(r.email).toBe("admin@khushio.com");
  });
  it("rejects bad emails and empty passwords", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
