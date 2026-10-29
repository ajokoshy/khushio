import { describe, expect, it } from "vitest";
import { csvEscape, parseCsv, toCsv, unescapeCell } from "../lib/csv";
describe("csv edge cases", () => {
  it("handles CRLF line endings", () => expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]));
  it("keeps newlines inside quotes", () => expect(parseCsv('a\n"x\ny"')).toEqual([["a"], ["x\ny"]]));
  it("handles empty cells", () => expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]));
  it("ignores blank lines", () => expect(parseCsv("a\n\n\nb")).toEqual([["a"], ["b"]]));
  it("returns nothing for empty text", () => expect(parseCsv("")).toEqual([]));
});
describe("csv writing", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)"])("guards formula %s", (v) => expect(csvEscape(v)).toBe(`"'${v}"`));
  it("doubles quotes", () => expect(csvEscape('a"b')).toBe('"a""b"'));
  it("writes null as empty and dates as ISO", () => { expect(csvEscape(null)).toBe('""'); expect(csvEscape(new Date("2026-01-02T03:04:05Z"))).toBe('"2026-01-02T03:04:05.000Z"'); });
  it("builds header and rows", () => expect(toCsv(["a", "b"], [[1, "x"]])).toBe('"a","b"\n"1","x"'));
  it("round-trips through the parser", () => { const rows = [["he said \"hi\", ok", "=cmd"]]; expect(parseCsv(toCsv(["a", "b"], rows)).slice(1).map((r) => r.map(unescapeCell))).toEqual(rows); });
});
