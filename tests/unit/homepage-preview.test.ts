import { describe, expect, it } from "vitest";
import { PREVIEW_TTL_MS, signPreviewToken, verifyPreviewToken } from "@/modules/homepage/preview";

const SECRET = "x".repeat(40);
const NOW = new Date("2026-12-01T10:00:00Z");

describe("signed homepage preview links", () => {
  it("accepts a fresh token and rejects it after its hour is over", () => {
    const token = signPreviewToken(SECRET, NOW);
    expect(verifyPreviewToken(SECRET, token, NOW)).toBe("ok");
    expect(verifyPreviewToken(SECRET, token, new Date(NOW.getTime() + PREVIEW_TTL_MS - 1))).toBe("ok");
    expect(verifyPreviewToken(SECRET, token, new Date(NOW.getTime() + PREVIEW_TTL_MS + 1))).toBe("expired");
  });

  it("rejects a token signed with another secret, a changed expiry, a changed signature and garbage", () => {
    const token = signPreviewToken(SECRET, NOW);
    const [expiry, signature] = token.split(".") as [string, string];
    expect(verifyPreviewToken("y".repeat(40), token, NOW)).toBe("invalid");
    expect(verifyPreviewToken(SECRET, `${Number(expiry) + 60_000}.${signature}`, NOW)).toBe("invalid");
    expect(verifyPreviewToken(SECRET, `${expiry}.${signature.slice(0, -2)}AA`, NOW)).toBe("invalid");
    for (const bad of ["", "abc", "123.456", `${expiry}.`, undefined, null, 5, `${expiry}.${signature}.extra`]) expect(verifyPreviewToken(SECRET, bad, NOW), String(bad)).toBe("invalid");
  });

  it("an expired but genuine token is reported as expired, never as ok, even with a far-future clock check", () => {
    const old = signPreviewToken(SECRET, new Date("2020-01-01T00:00:00Z"));
    expect(verifyPreviewToken(SECRET, old, NOW)).toBe("expired");
  });
});
