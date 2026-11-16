import { describe, expect, it } from "vitest";
import { parseCsv } from "@/modules/conversions/csv";
import { mapStatus, parseCommission, parseConversionCsv, parseConversionDate } from "@/modules/conversions/rows";
import { conversionInputSchema } from "@/modules/conversions/validation";

describe("CSV reader", () => {
  it("reads quoted fields with commas, doubled quotes and line breaks, and skips blank lines", () => {
    const lines = parseCsv('a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3');
    expect(lines.map((l) => l.cells)).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"], ["1", "2", "3"]]);
    expect(lines.map((l) => l.line)).toEqual([1, 2, 5]);
  });
  it("detects semicolons and tabs, and drops a byte-order mark", () => {
    expect(parseCsv("\uFEFFa;b\n1;2")[0]?.cells).toEqual(["a", "b"]);
    expect(parseCsv("a\tb\n1\t2")[1]?.cells).toEqual(["1", "2"]);
  });
  it("reports a quote that never closes", () => {
    expect(() => parseCsv('a,b\n"open,1')).toThrow(expect.objectContaining({ fields: { file: expect.stringContaining("never closes") } }));
  });
});

describe("conversion values", () => {
  it("reads dates in India time unless a zone is given, day first for slashes", () => {
    const iso = (s: string) => { const r = parseConversionDate(s); return r.ok ? r.value.toISOString() : r.error; };
    expect(iso("2026-11-01")).toBe("2026-10-31T18:30:00.000Z");
    expect(iso("2026-11-01 14:30")).toBe("2026-11-01T09:00:00.000Z");
    expect(iso("2026-11-01T14:30:00Z")).toBe("2026-11-01T14:30:00.000Z");
    expect(iso("2026-11-01T14:30:00+05:30")).toBe("2026-11-01T09:00:00.000Z");
    expect(iso("01/11/2026")).toBe("2026-10-31T18:30:00.000Z");
    expect(iso("1-11-2026 09:15")).toBe("2026-11-01T03:45:00.000Z");
    for (const bad of ["31/02/2026", "2026-02-30", "2026-13-01", "yesterday", "11/01/26"]) expect(iso(bad), bad).toContain("not a date");
    expect(iso("")).toBe("the date is empty");
  });

  it("reads commissions into minor units, allows zero, refuses negatives and junk", () => {
    const minor = (s: string) => { const r = parseCommission(s, "INR"); return r.ok ? r.value : r.error; };
    expect(minor("120")).toBe(12000);
    expect(minor("₹1,299.50")).toBe(129950);
    expect(minor("0")).toBe(0);
    expect(minor("0.00")).toBe(0);
    expect(minor("-5")).toEqual(expect.stringContaining("negative"));
    expect(minor("abc")).toEqual(expect.any(String));
    expect(typeof minor("abc")).toBe("string");
    expect(typeof minor("")).toBe("string");
    expect(typeof minor("1.234")).toBe("string");
  });

  it("maps the status words networks use", () => {
    expect(mapStatus("Confirmed")).toBe("approved");
    expect(mapStatus("CANCELLED")).toBe("rejected");
    expect(mapStatus("Tracked")).toBe("pending");
    expect(mapStatus("paid out")).toBe("paid");
    expect(mapStatus("mystery")).toBeNull();
  });
});

describe("conversion CSV file", () => {
  const file = (lines: string[]) => lines.join("\n");

  it("finds columns by common names in any order and parses every field", () => {
    const parsed = parseConversionCsv(file([
      "Transaction ID,Status,Commission,Order Date,SubID,Currency",
      "A-1,Confirmed,120.50,2026-11-01,amazon-sony,INR",
      "A-2,Pending,0,01/11/2026,,",
    ]), "INR");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({ externalOrderId: "A-1", status: "approved", commissionMinor: 12050, subId: "amazon-sony", currency: "INR" }),
      expect.objectContaining({ externalOrderId: "A-2", status: "pending", commissionMinor: 0, subId: null }),
    ]);
  });

  it("uses the form's currency and 'pending' when those columns are absent", () => {
    const parsed = parseConversionCsv(file(["order_id,commission,date", "X1,5,2026-11-01"]), "USD");
    expect(parsed.rows[0]).toMatchObject({ currency: "USD", status: "pending", commissionMinor: 500 });
  });

  it("skips bad rows with their line numbers and keeps the good ones", () => {
    const parsed = parseConversionCsv(file([
      "order_id,commission,date,status",
      "G1,10,2026-11-01,approved",
      ",10,2026-11-01,approved",
      "B2,abc,2026-11-01,approved",
      "B3,10,not-a-date,approved",
      "B4,10,2026-11-01,mystery",
      "G2,20,2026-11-02,approved",
    ]), "INR");
    expect(parsed.rows.map((r) => r.externalOrderId)).toEqual(["G1", "G2"]);
    expect(parsed.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });

  it("keeps the LAST row for an order id repeated in the file and counts the repeat", () => {
    const parsed = parseConversionCsv(file(["order_id,commission,date,status", "D1,10,2026-11-01,pending", "D1,10,2026-11-01,approved"]), "INR");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.status).toBe("approved");
    expect(parsed.duplicatesInFile).toBe(1);
  });

  it("explains a missing column, an empty file and a file with no rows", () => {
    expect(() => parseConversionCsv("order_id,date\nA,2026-11-01", "INR")).toThrow(expect.objectContaining({ fields: { file: expect.stringContaining("commission") } }));
    expect(() => parseConversionCsv("", "INR")).toThrow(expect.objectContaining({ fields: { file: "The file is empty." } }));
    expect(() => parseConversionCsv("order_id,commission,date", "INR")).toThrow(expect.objectContaining({ fields: { file: expect.stringContaining("no rows") } }));
  });

  it("refuses more than 5000 rows or more than 1 MB", () => {
    const many = ["order_id,commission,date", ...Array.from({ length: 5001 }, (_, i) => `O${i},1,2026-11-01`)].join("\n");
    expect(() => parseConversionCsv(many, "INR")).toThrow(expect.objectContaining({ fields: { file: expect.stringContaining("5000") } }));
    expect(() => parseConversionCsv("x".repeat(1_000_001), "INR")).toThrow(expect.objectContaining({ fields: { file: expect.stringContaining("1 MB") } }));
  });
});

describe("manual conversion form", () => {
  const base = { networkId: "11111111-1111-4111-8111-111111111111", externalOrderId: " 402-123 ", linkSlug: "", commission: "1,299.50", currency: "INR", status: "approved", convertedAt: "2026-11-01T14:30" };
  it("converts the amount to minor units and the date from India time", () => {
    const out = conversionInputSchema.parse(base);
    expect(out).toMatchObject({ externalOrderId: "402-123", linkSlug: null, commissionMinor: 129950, status: "approved" });
    expect(out.convertedAt.toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });
  it("accepts a zero commission and rejects bad amount, date and status with messages on the right fields", () => {
    expect(conversionInputSchema.parse({ ...base, commission: "0" }).commissionMinor).toBe(0);
    for (const [over, field] of [[{ commission: "abc" }, "commission"], [{ convertedAt: "2026-02-31T10:00" }, "convertedAt"], [{ status: "weird" }, "status"], [{ externalOrderId: " " }, "externalOrderId"]] as const) {
      const r = conversionInputSchema.safeParse({ ...base, ...over });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.path).toEqual([field]);
    }
  });
});
