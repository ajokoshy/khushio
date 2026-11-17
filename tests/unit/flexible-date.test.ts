import { describe, expect, it } from "vitest";
import { parseFlexibleDate } from "@/core/validation/flexible-date";

const iso = (s: string) => {
  const r = parseFlexibleDate(s);
  return r.ok ? r.value.toISOString() : `ERR ${r.error}`;
};

describe("parseFlexibleDate", () => {
  it("reads times without a zone as India time", () => {
    expect(iso("2026-11-01")).toBe("2026-10-31T18:30:00.000Z");
    expect(iso("2026-11-01 14:30")).toBe("2026-11-01T09:00:00.000Z");
    expect(iso("2026-11-01T14:30:15")).toBe("2026-11-01T09:00:15.000Z");
  });
  it("honours an explicit zone", () => {
    expect(iso("2026-11-01T14:30:00Z")).toBe("2026-11-01T14:30:00.000Z");
    expect(iso("2026-11-01T14:30:00+05:30")).toBe("2026-11-01T09:00:00.000Z");
    expect(iso("2026-11-01T14:30:00-0500")).toBe("2026-11-01T19:30:00.000Z");
  });
  it("reads day/month/year day first", () => {
    expect(iso("01/11/2026")).toBe("2026-10-31T18:30:00.000Z");
    expect(iso("1-11-2026 09:05")).toBe("2026-11-01T03:35:00.000Z");
  });
  it("refuses impossible and unknown dates", () => {
    for (const bad of ["", "31/02/2026", "2026-02-30", "2026-13-01", "tomorrow", "2026-11-01T25:00:00Z", "2026-11-01 24:00"]) expect(iso(bad).startsWith("ERR"), bad).toBe(true);
  });
});
