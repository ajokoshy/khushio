import { describe, expect, it } from "vitest";
import { excerptOf, extractMediaIds, extractProductSlugs, headings, parseInline, parseMarkdown, readingMinutes, safeHref } from "../lib/markdown";

describe("safeHref", () => {
  it.each([["/products/x", "internal"], ["/go/abc", "go"], ["https://example.com/a?b=1", "external"]])("allows %s", (u, kind) => expect(safeHref(u)?.kind).toBe(kind));
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>", "http://insecure.example", "//evil.example", "mailto:a@b.c", "vbscript:x", "/a b", "https://a.example/ x", "", "https:\\evil", "/\\evil.example"])("rejects %j", (u) => expect(safeHref(u)).toBeNull());
});
describe("inline", () => {
  it("parses bold, italic, code and links", () => {
    const c = parseInline("a **b** *c* `d` [e](/x)"); expect(c.map((x) => x.t)).toEqual(["text", "b", "text", "i", "text", "code", "text", "a"]);
  });
  it("turns an unsafe link into plain text, keeping the words", () => { expect(parseInline("[click](javascript:alert(1))")).toEqual([{ t: "text", v: "click" }]); });
  it("accepts one level of brackets inside a link address", () => { expect(parseInline("[w](https://en.example/Foo_(bar))")[0]).toMatchObject({ t: "a", href: "https://en.example/Foo_(bar)" }); });
  it("never produces markup from angle brackets", () => { const c = parseInline("<script>alert(1)</script> <img src=x onerror=y>"); expect(c).toEqual([{ t: "text", v: "<script>alert(1)</script> <img src=x onerror=y>" }]); });
  it("handles unbalanced markers without hanging", () => { expect(parseInline("**oops and *more").map((x) => x.t).every((t) => t === "text" || t === "i")).toBe(true); expect(parseInline("a * b * c")).toEqual([{ t: "text", v: "a * b * c" }]); });
});
describe("blocks", () => {
  const md = "# Title\n\nIntro line one\nline two.\n\n## Section\n\n- a\n- b\n\n1. x\n2. y\n\n> quote\n\n---\n\n```\ncode **not bold**\n```\n\n[[product:jute-basket]]\n\n![A basket](media:11111111-1111-1111-1111-111111111111)\n\n### Same\n### Same\n";
  const b = parseMarkdown(md);
  it("recognises every block type", () => expect(b.map((x) => x.t)).toEqual(["h", "p", "h", "ul", "ol", "quote", "hr", "code", "product", "img", "h", "h"]));
  it("never emits a top-level heading (the page owns the h1)", () => expect(b[0]).toMatchObject({ t: "h", level: 2 }));
  it("joins wrapped lines into one paragraph", () => expect(b[1]).toMatchObject({ t: "p", c: [{ t: "text", v: "Intro line one line two." }] }));
  it("keeps code verbatim", () => expect(b[7]).toEqual({ t: "code", v: "code **not bold**" }));
  it("makes unique heading ids", () => expect(headings(b).map((h) => h.id)).toEqual(["title", "section", "same", "same-2"]));
  it("collects embedded products and images", () => { expect(extractProductSlugs(b)).toEqual(["jute-basket"]); expect(extractMediaIds(b)).toEqual(["11111111-1111-1111-1111-111111111111"]); });
  it("only treats a product tag on its own line as an embed", () => expect(extractProductSlugs(parseMarkdown("see [[product:x]] here"))).toEqual([]));
  it("rejects a media id that is not a uuid", () => expect(extractMediaIds(parseMarkdown("![a](media:../../etc/passwd)"))).toEqual([]));
  it("copes with Windows line endings and empty input", () => { expect(parseMarkdown("a\r\n\r\nb")).toHaveLength(2); expect(parseMarkdown("")).toEqual([]); });
});
describe("helpers", () => {
  it("estimates reading time from words only", () => { expect(readingMinutes("word ".repeat(400))).toBe(2); expect(readingMinutes("short")).toBe(1); expect(readingMinutes("[[product:x]]")).toBe(1); });
  it("builds a plain-text excerpt on a word boundary", () => { const e = excerptOf(parseMarkdown("**Bold** start " + "word ".repeat(100)), 40); expect(e.length).toBeLessThanOrEqual(41); expect(e.startsWith("Bold start")).toBe(true); expect(e.endsWith("…")).toBe(true); expect(excerptOf(parseMarkdown("## only heading"))).toBe(""); });
});
