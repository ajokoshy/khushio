import { describe, expect, it } from "vitest";
import { parseCsv } from "@/core/csv/parse";
import { cellText, protectCell, toCsv, unprotectCell } from "@/core/csv/write";

describe("CSV writer", () => {
  it("starts with a byte-order mark, uses CRLF and quotes what needs quoting", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", " padded "]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"x,y","say ""hi"""');
    expect(csv).toContain('"line\nbreak"," padded "');
    expect(csv.split("\r\n")).toHaveLength(4); // header, two rows, final empty piece
  });

  it("round-trips through the importer's reader, including tricky text", () => {
    const rows = [["Sony, Inc.", 'a "quote"', "two\nlines", "ünïcode ₹", ""], ["", "", "", "", "x"]];
    const parsed = parseCsv(toCsv(["h1", "h2", "h3", "h4", "h5"], rows));
    expect(parsed.slice(1).map((l) => l.cells)).toEqual(rows);
    expect(parsed[0]?.cells).toEqual(["h1", "h2", "h3", "h4", "h5"]);
  });

  it("writes numbers, booleans and empty values plainly", () => {
    expect(cellText(12)).toBe("12");
    expect(cellText(-5)).toBe("-5");
    expect(cellText(true)).toBe("true");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText(Number.NaN)).toBe("");
  });
});

describe("spreadsheet formula injection", () => {
  it("prefixes text that a spreadsheet would run as a formula", () => {
    for (const evil of ["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", "\rx", '=HYPERLINK("http://evil","x")']) expect(protectCell(evil), evil).toBe(`'${evil}`);
  });
  it("leaves ordinary text and numbers alone", () => {
    for (const fine of ["Sony", "100% cotton", "-5", "-12.50", "a=b", "", "hello@example.com"]) expect(protectCell(fine), fine).toBe(fine);
  });
  it("is undone by the importer, only for the protected form", () => {
    expect(unprotectCell("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(unprotectCell("'@x")).toBe("@x");
    expect(unprotectCell("'quoted text")).toBe("'quoted text");
    expect(unprotectCell("plain")).toBe("plain");
    for (const evil of ["=1+1", "+44 20", "@a", "-x"]) expect(unprotectCell(protectCell(evil))).toBe(evil);
  });
  it("applies to every cell of a written file, not the header's quoting", () => {
    expect(toCsv(["h"], [["=1+1"]])).toContain("'=1+1");
  });
});
