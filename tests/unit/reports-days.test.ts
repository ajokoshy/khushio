import { describe, expect, it } from "vitest";
import { addDaysToString, dayRange, dayStringToStart, fillDays, istDayStart, istDayString, parseRange, reportWindow } from "@/modules/reports/days";
import { isCronAuthorized } from "@/modules/reports/cron-auth";
import { normaliseRetention } from "@/modules/reports/settings";

describe("IST calendar days (Release 4B)", () => {
  it("puts an instant on the right India day around midnight", () => {
    // 2026-11-14 18:29:59 UTC is 23:59:59 IST on the 14th; one second later it is the 15th in India.
    expect(istDayString(new Date("2026-11-14T18:29:59Z"))).toBe("2026-11-14");
    expect(istDayString(new Date("2026-11-14T18:30:00Z"))).toBe("2026-11-15");
    expect(istDayStart(new Date("2026-11-15T03:00:00Z")).toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(dayStringToStart("2026-11-15").toISOString()).toBe("2026-11-14T18:30:00.000Z");
  });

  it("adds days across month and year ends and lists a range", () => {
    expect(addDaysToString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToString("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayRange("2026-11-28", "2026-12-02")).toEqual(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(dayRange("2026-11-02", "2026-11-01")).toEqual([]);
  });

  it("fills missing days with zero", () => {
    expect(fillDays([{ day: "2026-11-02", clicks: 5 }], "2026-11-01", "2026-11-03")).toEqual([
      { day: "2026-11-01", clicks: 0 }, { day: "2026-11-02", clicks: 5 }, { day: "2026-11-03", clicks: 0 },
    ]);
  });

  it("builds the report window of complete days ending yesterday", () => {
    const w = reportWindow(new Date("2026-11-16T05:00:00Z"), 7); // 10:30 IST on 16 Nov
    expect(w.to).toBe("2026-11-15");
    expect(w.from).toBe("2026-11-09");
    expect(w.fromInstant.toISOString()).toBe("2026-11-08T18:30:00.000Z");
    expect(w.toInstant.toISOString()).toBe("2026-11-15T18:30:00.000Z");
  });

  it("accepts only the offered ranges", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("1000")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange("abc")).toBe(30);
  });
});

describe("retention setting", () => {
  it("accepts whole days from 7 to 365 and falls back to 30 for anything else", () => {
    expect(normaliseRetention(14)).toBe(14);
    expect(normaliseRetention(7)).toBe(7);
    expect(normaliseRetention(365)).toBe(365);
    for (const bad of [6, 366, 0, -5, 14.5, "14", null, undefined, {}]) expect(normaliseRetention(bad), String(bad)).toBe(30);
  });
});

describe("cron route authorisation", () => {
  const secret = "s3cret-value-123456";
  it("accepts only the exact Bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized(`  Bearer ${secret}  `, secret)).toBe(true);
  });
  it("refuses a missing, wrong, differently-cased or malformed header", () => {
    for (const header of [null, undefined, "", secret, `Bearer`, `Bearer wrong-secret-value`, `bearer ${secret}`, `Basic ${secret}`, `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`]) {
      expect(isCronAuthorized(header, secret), String(header)).toBe(false);
    }
  });
  it("refuses everything when the secret is not configured or too short", () => {
    expect(isCronAuthorized("Bearer anything-at-all-123", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer anything-at-all-123", "")).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
