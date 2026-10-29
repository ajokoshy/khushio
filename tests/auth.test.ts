import { createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => void jar.set(k, v), delete: (k: string) => void jar.delete(k) }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); } }));
import { checkLogin, endSession, isAdmin, requireAdmin, startSession } from "../lib/auth";
const salt = randomBytes(16).toString("hex");
const HASH = `${salt}:${scryptSync("correct-horse-12", salt, 64).toString("hex")}`;
const SECRET = "s".repeat(40);
const fp = () => createHash("sha256").update(`${process.env.ADMIN_PASSWORD_HASH ?? ""}|${(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()}`).digest("hex").slice(0, 16);
const signed = (exp: string, secret = SECRET) => createHmac("sha256", secret).update(`${exp}.${fp()}`).digest("hex");
beforeEach(() => { jar.clear(); Object.assign(process.env, { ADMIN_EMAIL: "Admin@Example.com", AUTH_SECRET: SECRET, ADMIN_PASSWORD_HASH: HASH }); delete process.env.ADMIN_PASSWORD; });
describe("checkLogin", () => {
  it("accepts the right email (any case, padded) and password", () => expect(checkLogin("  admin@example.COM ", "correct-horse-12")).toBe(true));
  it("rejects a wrong password", () => expect(checkLogin("admin@example.com", "wrong-password-1")).toBe(false));
  it("rejects a wrong email", () => expect(checkLogin("other@example.com", "correct-horse-12")).toBe(false));
  it("rejects when AUTH_SECRET is too short", () => { process.env.AUTH_SECRET = "short"; expect(checkLogin("admin@example.com", "correct-horse-12")).toBe(false); });
  it("rejects when nothing is configured", () => { delete process.env.ADMIN_PASSWORD_HASH; delete process.env.ADMIN_EMAIL; expect(checkLogin("", "")).toBe(false); });
  it("uses the plain-password fallback only when the hash is malformed and password is 12+ chars", () => {
    process.env.ADMIN_PASSWORD_HASH = "not-a-hash"; process.env.ADMIN_PASSWORD = "plain-password-1";
    expect(checkLogin("admin@example.com", "plain-password-1")).toBe(true); expect(checkLogin("admin@example.com", "nope")).toBe(false);
    process.env.ADMIN_PASSWORD = "short"; expect(checkLogin("admin@example.com", "short")).toBe(false);
  });
  it("does not accept the plain password when a valid hash is set", () => { process.env.ADMIN_PASSWORD = "plain-password-1"; expect(checkLogin("admin@example.com", "plain-password-1")).toBe(false); });
});
describe("session", () => {
  it("is not admin without a cookie", async () => expect(await isAdmin()).toBe(false));
  it("is admin after startSession and not after endSession", async () => { await startSession(); expect(await isAdmin()).toBe(true); await endSession(); expect(await isAdmin()).toBe(false); });
  it("rejects a tampered signature", async () => { await startSession(); const [exp] = jar.get("kh_admin")!.split("."); jar.set("kh_admin", `${exp}.${"0".repeat(64)}`); expect(await isAdmin()).toBe(false); });
  it("rejects a cookie signed with another secret", async () => { const exp = String(Date.now() + 1e6); jar.set("kh_admin", `${exp}.${signed(exp, "x".repeat(40))}`); expect(await isAdmin()).toBe(false); });
  it("rejects an expired cookie even with a valid signature", async () => { const exp = String(Date.now() - 1000); jar.set("kh_admin", `${exp}.${signed(exp)}`); expect(await isAdmin()).toBe(false); });
  it("rejects when AUTH_SECRET is missing", async () => { await startSession(); delete process.env.AUTH_SECRET; expect(await isAdmin()).toBe(false); });
  it("requireAdmin redirects to the login page", async () => { await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login"); });
  it("requireAdmin passes for a valid session", async () => { await startSession(); await expect(requireAdmin()).resolves.toBeUndefined(); });
});

describe("hardening", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("never accepts the plain-text password in production", () => {
    vi.stubEnv("NODE_ENV", "production"); process.env.ADMIN_PASSWORD_HASH = "not-a-hash"; process.env.ADMIN_PASSWORD = "plain-password-1";
    expect(checkLogin("admin@example.com", "plain-password-1")).toBe(false);
  });
  it("signs everyone out when the password hash changes", async () => {
    await startSession(); expect(await isAdmin()).toBe(true);
    const salt2 = randomBytes(16).toString("hex"); process.env.ADMIN_PASSWORD_HASH = `${salt2}:${scryptSync("another-password-1", salt2, 64).toString("hex")}`;
    expect(await isAdmin()).toBe(false);
  });
  it("stores a signed session cookie", async () => { await startSession(); expect(jar.get("kh_admin")).toBeDefined(); });
});
