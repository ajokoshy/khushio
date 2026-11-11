import { describe, expect, it } from "vitest";
import { LOGIN_RATE_LIMIT, isRateLimited, rateKey, windowStart } from "@/core/auth/rate-limit";
import { getClientIp } from "@/core/security/ip";
import { safeCallbackPath } from "@/core/security/redirects";

describe("login rate limiter", () => {
  it("allows below the per-email limit and blocks at it", () => {
    const max = LOGIN_RATE_LIMIT.maxFailuresPerEmail;
    expect(isRateLimited({ email: max - 1, ip: 0 })).toBe(false);
    expect(isRateLimited({ email: max, ip: 0 })).toBe(true);
  });

  it("blocks on the per-IP limit independently", () => {
    const max = LOGIN_RATE_LIMIT.maxFailuresPerIp;
    expect(isRateLimited({ email: 0, ip: max - 1 })).toBe(false);
    expect(isRateLimited({ email: 0, ip: max })).toBe(true);
  });

  it("ignores the IP bucket when the IP is unknown", () => {
    expect(isRateLimited({ email: 0, ip: null })).toBe(false);
  });

  it("computes the window start", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(windowStart(now).toISOString()).toBe("2026-01-01T11:45:00.000Z");
  });

  it("builds stable, keyed, non-reversible keys", () => {
    const a = rateKey("email", "Admin@Khushio.com ", "secret-secret-secret-secret-secret");
    const b = rateKey("email", "admin@khushio.com", "secret-secret-secret-secret-secret");
    const c = rateKey("email", "admin@khushio.com", "another-secret-another-secret-123");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("email:")).toBe(true);
    expect(a).not.toContain("khushio");
    expect(rateKey("ip", "1.2.3.4", "s".repeat(32)).startsWith("ip:")).toBe(true);
  });
});

describe("getClientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("takes the first x-forwarded-for entry", () => {
    expect(getClientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
  });
  it("falls back to x-real-ip, then null", () => {
    expect(getClientIp(h({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(getClientIp(h({}))).toBeNull();
  });
});

describe("safeCallbackPath", () => {
  it("keeps admin paths", () => {
    expect(safeCallbackPath("/admin/products?page=2")).toBe("/admin/products?page=2");
  });
  it("rejects open-redirect attempts", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/admin/\\evil", "/products", "javascript:alert(1)", "", null, undefined, "/admin/\n"]) {
      expect(safeCallbackPath(bad as string | null | undefined)).toBe("/admin/dashboard");
    }
  });
});
