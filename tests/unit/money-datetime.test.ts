import { describe, expect, it } from "vitest";
import { formatMinor, minorToInput, parsePriceToMinor } from "@/core/validation/money";
import { parseAdminDateTime, toAdminDateTimeInput } from "@/core/validation/datetime";

describe("money", () => {
  it.each([
    ["1299", 129900],
    ["1,299.5", 129950],
    ["₹1299.50", 129950],
    ["12,99,999", 129999900],
    ["0.05", 5],
  ])("parses %s to %i minor units", (input, minor) => {
    expect(parsePriceToMinor(input, "INR")).toEqual({ ok: true, minor });
  });

  it("treats empty as no price", () => {
    expect(parsePriceToMinor("", "INR")).toEqual({ ok: true, minor: null });
    expect(parsePriceToMinor(undefined, "INR")).toEqual({ ok: true, minor: null });
  });

  it.each(["0", "-5", "abc", "1,5", "12.345", "99999999999", "1e5"])("rejects %s", (input) => {
    expect(parsePriceToMinor(input, "INR").ok).toBe(false);
  });

  it("knows currencies without decimals", () => {
    expect(parsePriceToMinor("500", "JPY")).toEqual({ ok: true, minor: 500 });
    expect(parsePriceToMinor("100.5", "JPY").ok).toBe(false);
  });

  it("round-trips through the input text and formats for display", () => {
    expect(minorToInput(129950, "INR")).toBe("1299.50");
    expect(minorToInput(129900, "INR")).toBe("1299");
    expect(minorToInput(5, "INR")).toBe("0.05");
    expect(minorToInput(null, "INR")).toBe("");
    expect(formatMinor(129950, "INR")).toBe("₹1,299.50");
    expect(formatMinor(129900, "INR")).toBe("₹1,299");
  });
});

describe("admin date and time (India time)", () => {
  it("converts to UTC and back", () => {
    const d = parseAdminDateTime("2026-12-01T09:30");
    expect(d?.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(toAdminDateTimeInput(d)).toBe("2026-12-01T09:30");
  });
  it("rejects impossible dates and junk", () => {
    expect(parseAdminDateTime("2026-02-31T10:00")).toBeNull();
    expect(parseAdminDateTime("tomorrow")).toBeNull();
    expect(toAdminDateTimeInput(null)).toBe("");
  });
});
