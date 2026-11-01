import { describe, expect, it } from "vitest";
import { parseCsv, unescapeCell } from "../lib/csv";
import { cld } from "../lib/cloudinary";
describe("csv", () => {
  it("parses quotes, commas and newlines", () => { expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]); });
  it("removes the export formula guard", () => { expect(unescapeCell("'=SUM(1)")).toBe("=SUM(1)"); expect(unescapeCell("plain")).toBe("plain"); });
});
describe("cloudinary url", () => {
  it("adds format, quality, a no-upscale limit and a width from the fixed set", () => { expect(cld("https://res.cloudinary.com/x/image/upload/v1/a.jpg", 600)).toBe("https://res.cloudinary.com/x/image/upload/f_auto,q_auto,c_limit,w_640/v1/a.jpg"); });
  it("leaves other urls alone", () => { expect(cld("https://example.com/a.jpg")).toBe("https://example.com/a.jpg"); });
});
