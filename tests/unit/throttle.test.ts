import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientIpFromHeaders,
  evaluateThrottle,
  hashIdentifier,
  LOGIN_THROTTLE,
  THROTTLE_MESSAGE,
  UNKNOWN_IP,
} from "@/core/auth/throttle";

const NOW = new Date("2026-11-12T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const times = (n: number, m = 1) => Array.from({ length: n }, () => minutesAgo(m));

describe("evaluateThrottle: per-email limit", () => {
  it("allows up to 4 failures and blocks at the 5th (so the sixth attempt is refused)", () => {
    expect(evaluateThrottle({ now: NOW, emailFailures: times(4), ipFailures: [] }).allowed).toBe(true);
    const blocked = evaluateThrottle({ now: NOW, emailFailures: times(5), ipFailures: [] });
    expect(blocked).toMatchObject({ allowed: false, reason: "email" });
  });

  it("allows an email with no failures", () => {
    expect(evaluateThrottle({ now: NOW, emailFailures: [], ipFailures: [] })).toEqual({ allowed: true });
  });
});

describe("evaluateThrottle: per-IP limit", () => {
  it("allows 19 failures and blocks at 20", () => {
    expect(evaluateThrottle({ now: NOW, emailFailures: [], ipFailures: times(19) }).allowed).toBe(true);
    expect(evaluateThrottle({ now: NOW, emailFailures: [], ipFailures: times(20) })).toMatchObject({ allowed: false, reason: "ip" });
  });

  it("reports the email reason when both limits are hit", () => {
    expect(evaluateThrottle({ now: NOW, emailFailures: times(5), ipFailures: times(20) })).toMatchObject({ reason: "email" });
  });
});

describe("evaluateThrottle: 15 minute window", () => {
  it("ignores failures older than the window", () => {
    expect(evaluateThrottle({ now: NOW, emailFailures: times(5, 16), ipFailures: times(20, 30) }).allowed).toBe(true);
  });

  it("a failure exactly 15 minutes old has expired; one just inside the window still counts", () => {
    const edge = [...times(4, 1), minutesAgo(15)];
    expect(evaluateThrottle({ now: NOW, emailFailures: edge, ipFailures: [] }).allowed).toBe(true);
    const inside = [...times(4, 1), new Date(NOW.getTime() - LOGIN_THROTTLE.windowMs + 1000)];
    expect(evaluateThrottle({ now: NOW, emailFailures: inside, ipFailures: [] }).allowed).toBe(false);
  });

  it("lifts the block as the oldest failure ages out, never later than 15 minutes after the last failure", () => {
    const failures = [minutesAgo(14), minutesAgo(10), minutesAgo(5), minutesAgo(3), minutesAgo(1)];
    const decision = evaluateThrottle({ now: NOW, emailFailures: failures, ipFailures: [] });
    expect(decision).toMatchObject({ allowed: false });
    if (!decision.allowed) {
      expect(decision.retryAt.getTime()).toBe(minutesAgo(14).getTime() + LOGIN_THROTTLE.windowMs); // 1 minute from now
      expect(decision.retryAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(LOGIN_THROTTLE.windowMs);
      // One minute later the oldest has aged out and the count is back to 4.
      const later = new Date(decision.retryAt.getTime() + 1);
      expect(evaluateThrottle({ now: later, emailFailures: failures, ipFailures: [] }).allowed).toBe(true);
    }
  });

  it("with more failures than the limit, waits until the count falls below the limit", () => {
    const failures = [minutesAgo(14), minutesAgo(13), minutesAgo(12), minutesAgo(3), minutesAgo(2), minutesAgo(1)]; // 6 failures
    const decision = evaluateThrottle({ now: NOW, emailFailures: failures, ipFailures: [] });
    if (decision.allowed) throw new Error("expected a block");
    expect(decision.retryAt.getTime()).toBe(minutesAgo(13).getTime() + LOGIN_THROTTLE.windowMs); // two must age out
  });
});

describe("constants", () => {
  it("match the rule in the project guide", () => {
    expect(LOGIN_THROTTLE).toMatchObject({ windowMs: 900_000, maxFailuresPerEmail: 5, maxFailuresPerIp: 20, retentionMs: 7 * 86_400_000 });
    expect(THROTTLE_MESSAGE).toBe("Too many failed attempts. Try again in 15 minutes.");
  });
});

describe("hashIdentifier", () => {
  const secret = "a-test-secret-that-is-at-least-32-chars";
  it("is deterministic, hex, and contains neither the email nor the IP", () => {
    const h = hashIdentifier("email", "owner@khushio.test", secret);
    expect(h).toBe(hashIdentifier("email", "owner@khushio.test", secret));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("owner");
    expect(hashIdentifier("ip", "203.0.113.7", secret)).not.toContain("203");
  });
  it("depends on the secret, the value and the purpose", () => {
    const base = hashIdentifier("email", "a@b.co", secret);
    expect(hashIdentifier("email", "a@b.co", secret + "x")).not.toBe(base);
    expect(hashIdentifier("email", "c@b.co", secret)).not.toBe(base);
    expect(hashIdentifier("ip", "a@b.co", secret)).not.toBe(base);
  });
});

describe("clientIpFromHeaders", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("prefers the Vercel header, then x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIpFromHeaders(h({ "x-vercel-forwarded-for": "198.51.100.2", "x-real-ip": "1.1.1.1" }))).toBe("198.51.100.2");
    expect(clientIpFromHeaders(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.9");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("accepts IPv6 and normalises case", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "2001:DB8::1" }))).toBe("2001:db8::1");
  });
  it("falls back to one shared bucket when nothing usable is present", () => {
    expect(clientIpFromHeaders(h({}))).toBe(UNKNOWN_IP);
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "not-an-ip" }))).toBe(UNKNOWN_IP);
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "evil'; DROP TABLE users;--" }))).toBe(UNKNOWN_IP);
  });
});

describe("login-throttle service (database layer mocked)", () => {
  const rows = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), delEmail: vi.fn(), delBefore: vi.fn() }));
  vi.mock("@/core/auth/repository", () => ({
    selectFailuresSince: (...a: unknown[]) => rows.select(...a),
    insertFailure: (...a: unknown[]) => rows.insert(...a),
    deleteFailuresForEmail: (...a: unknown[]) => rows.delEmail(...a),
    deleteFailuresBefore: (...a: unknown[]) => rows.delBefore(...a),
  }));
  vi.mock("@/core/config/env", () => ({ requireEnv: () => "a-test-secret-that-is-at-least-32-chars" }));

  beforeEach(() => Object.values(rows).forEach((m) => m.mockReset()));

  it("splits rows into the email and IP buckets and never passes the raw email or IP to the database", async () => {
    const { checkLoginAllowed } = await import("@/core/auth/login-throttle");
    const secret = "a-test-secret-that-is-at-least-32-chars";
    const emailHash = hashIdentifier("email", "owner@khushio.test", secret);
    const ipHash = hashIdentifier("ip", "203.0.113.7", secret);
    // 5 failures for the email (from various IPs) are enough to block.
    rows.select.mockResolvedValue(times(5).map((createdAt, i) => ({ emailHash, ipHash: `other-${i}`, createdAt })));
    const decision = await checkLoginAllowed("owner@khushio.test", "203.0.113.7", NOW);
    expect(decision).toMatchObject({ allowed: false, reason: "email" });
    const [passedEmail, passedIp, since] = rows.select.mock.calls[0] as [string, string, Date];
    expect([passedEmail, passedIp]).toEqual([emailHash, ipHash]);
    expect(JSON.stringify(rows.select.mock.calls)).not.toContain("owner@khushio.test");
    expect(JSON.stringify(rows.select.mock.calls)).not.toContain("203.0.113.7");
    expect(since.getTime()).toBe(NOW.getTime() - LOGIN_THROTTLE.windowMs);
  });

  it("counts a different email from the same IP only against the IP limit", async () => {
    const { checkLoginAllowed } = await import("@/core/auth/login-throttle");
    const secret = "a-test-secret-that-is-at-least-32-chars";
    const ipHash = hashIdentifier("ip", "203.0.113.7", secret);
    rows.select.mockResolvedValue(times(19).map((createdAt, i) => ({ emailHash: `e-${i}`, ipHash, createdAt })));
    expect((await checkLoginAllowed("fresh@khushio.test", "203.0.113.7", NOW)).allowed).toBe(true);
    rows.select.mockResolvedValue(times(20).map((createdAt, i) => ({ emailHash: `e-${i}`, ipHash, createdAt })));
    expect(await checkLoginAllowed("fresh@khushio.test", "203.0.113.7", NOW)).toMatchObject({ allowed: false, reason: "ip" });
  });

  it("stores hashes when recording, and on success deletes the email's rows and rows older than 7 days", async () => {
    const { recordFailedLogin, clearLoginFailures } = await import("@/core/auth/login-throttle");
    await recordFailedLogin("owner@khushio.test", "203.0.113.7");
    expect(rows.insert.mock.calls[0]).toEqual([
      hashIdentifier("email", "owner@khushio.test", "a-test-secret-that-is-at-least-32-chars"),
      hashIdentifier("ip", "203.0.113.7", "a-test-secret-that-is-at-least-32-chars"),
    ]);
    await clearLoginFailures("owner@khushio.test", NOW);
    expect(rows.delEmail).toHaveBeenCalledWith(hashIdentifier("email", "owner@khushio.test", "a-test-secret-that-is-at-least-32-chars"));
    expect(rows.delBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - LOGIN_THROTTLE.retentionMs));
  });
});
