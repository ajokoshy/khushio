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
