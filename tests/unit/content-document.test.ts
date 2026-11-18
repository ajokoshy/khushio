import { describe, expect, it } from "vitest";
import { DOCUMENT_LIMITS, documentText, emptyDocument, excerptFrom, isDocumentEmpty, isPublicId, parseDocumentJson, readingMinutes, safeHref, sanitizeDocument, wordCount, type Doc } from "@/modules/content/document";

const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("sanitizeDocument: what is kept", () => {
  it("keeps the allowed nodes and marks", () => {
    const input = doc(
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Title" }] },
      p("Hello", [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "https://example.com/a" } }]),
      { type: "bulletList", content: [{ type: "listItem", content: [p("one")] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [p("two")] }] },
      { type: "blockquote", content: [p("quoted")] },
      { type: "image", attrs: { publicId: "khushio/products/abc123", alt: "A teapot", width: 800, height: 600 } },
    );
    expect(sanitizeDocument(input)).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "https://example.com/a" } }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
        { type: "image", attrs: { publicId: "khushio/products/abc123", alt: "A teapot", width: 800, height: 600 } },
      ],
    });
  });

  it("is idempotent: cleaning a clean document changes nothing", () => {
    const once = sanitizeDocument(doc(p("x", [{ type: "bold" }]), { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "h" }] }));
    expect(sanitizeDocument(once)).toEqual(once);
  });

  it("maps a level 1 heading to level 2 (the title is the only h1) and an odd level to 3", () => {
    const out = sanitizeDocument(doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "a" }] }, { type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "b" }] }));
    expect(out.content.map((n) => (n.type === "heading" ? n.attrs.level : null))).toEqual([2, 3]);
  });
});

describe("sanitizeDocument: hostile input", () => {
  it("returns an empty document for anything that is not a document", () => {
    for (const bad of [null, undefined, 5, "text", [], {}, { type: "paragraph" }, { type: "doc" }]) expect(sanitizeDocument(bad)).toEqual(emptyDocument());
  });

  it("drops unknown nodes together with everything inside them (script, iframe, html)", () => {
    const out = sanitizeDocument(doc(
      { type: "script", content: [{ type: "text", text: "alert(1)" }] },
      { type: "iframe", attrs: { src: "https://evil.example" } },
      { type: "html", attrs: { html: "<img src=x onerror=alert(1)>" } },
      { type: "codeBlock", content: [{ type: "text", text: "code" }] },
      p("kept"),
    ));
    expect(JSON.stringify(out)).not.toMatch(/alert|iframe|evil|onerror|code/);
    expect(out.content).toHaveLength(1);
  });

  it("keeps text that looks like markup as plain text (it is escaped when drawn)", () => {
    const out = sanitizeDocument(doc(p("<script>alert(1)</script>")));
    expect(documentText(out)).toBe("<script>alert(1)</script>");
  });

  it("drops unknown marks but keeps the text; drops event-handler style attrs", () => {
    const out = sanitizeDocument(doc(p("hi", [{ type: "textStyle", attrs: { style: "x" } }, { type: "bold", attrs: { onclick: "alert(1)" } }])));
    expect(out.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }] });
  });

  it("does not let a node sit where it does not belong", () => {
    const out = sanitizeDocument(doc({ type: "text", text: "loose" }, { type: "listItem", content: [p("orphan")] }, { type: "bulletList", content: [p("not an item")] }, { type: "paragraph", content: [{ type: "paragraph", content: [] }] }));
    expect(out.content).toEqual([{ type: "paragraph", content: [] }]);
  });

  it("stops at the depth limit and the node budget", () => {
    let deep: unknown = p("bottom");
    for (let i = 0; i < DOCUMENT_LIMITS.maxDepth + 4; i++) deep = { type: "blockquote", content: [deep] };
    expect(JSON.stringify(sanitizeDocument(doc(deep)))).not.toContain("bottom");
    const many = doc(...Array.from({ length: DOCUMENT_LIMITS.maxNodes + 500 }, () => p("x")));
    expect(sanitizeDocument(many).content.length).toBeLessThan(DOCUMENT_LIMITS.maxNodes);
  });

  it("survives cyclic-looking and prototype-polluting input", () => {
    const evil = JSON.parse('{"type":"doc","__proto__":{"polluted":true},"content":[{"type":"paragraph","__proto__":{"x":1},"content":[{"type":"text","text":"ok","constructor":{"prototype":{"y":1}}}]}]}');
    const out = sanitizeDocument(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(documentText(out)).toBe("ok");
  });
});

describe("links", () => {
  it("accepts http, https, mailto and site paths", () => {
    for (const ok of ["https://example.com", "http://example.com/x?y=1#z", "mailto:hi@example.com", "/go/amazon-sony", "/articles/tea"]) expect(safeHref(ok)).toBe(ok);
  });
  it("refuses script-capable and ambiguous addresses", () => {
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.example", "\\\\evil", "ftp://x.example", "https://", "mailto:", "https://a.example/ b", "", "   ", `https://x.example/${"a".repeat(3000)}`, 5, null]) expect(safeHref(bad as unknown)).toBeNull();
  });
  it("drops a bad link mark but keeps the words", () => {
    const out = sanitizeDocument(doc(p("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])));
    expect(out.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "click" }] });
  });
});

describe("images", () => {
  it("accepts only library-style public ids", () => {
    for (const ok of ["abc", "khushio/products/a1_b-2", "a.b"]) expect(isPublicId(ok)).toBe(true);
    for (const bad of ["", "../x", "a..b", "/abs", "a b", "a\"b", "x<y>", "https://evil.example/x.png", "a".repeat(300)]) expect(isPublicId(bad)).toBe(false);
  });
  it("drops images with a bad id, whatever else they carry; never keeps a src", () => {
    const out = sanitizeDocument(doc({ type: "image", attrs: { publicId: "https://evil.example/x.png", alt: "x" } }, { type: "image", attrs: { src: "https://evil.example/y.png", publicId: "ok/id", alt: "y" } }));
    expect(out.content).toEqual([{ type: "image", attrs: { publicId: "ok/id", alt: "y" } }]);
  });
  it("keeps sizes only as a valid pair of whole numbers", () => {
    const sized = sanitizeDocument(doc({ type: "image", attrs: { publicId: "a", alt: "", width: 100, height: 50 } }));
    expect((sized.content[0] as { attrs: object }).attrs).toEqual({ publicId: "a", alt: "", width: 100, height: 50 });
    const bad = sanitizeDocument(doc({ type: "image", attrs: { publicId: "a", alt: "", width: -1, height: 1e9 } }));
    expect((bad.content[0] as { attrs: object }).attrs).toEqual({ publicId: "a", alt: "" });
  });
});

describe("reading the document", () => {
  const d: Doc = sanitizeDocument(doc(p("One two three."), { type: "bulletList", content: [{ type: "listItem", content: [p("four five")] }] }));
  it("extracts the text and counts the words", () => {
    expect(documentText(d)).toBe("One two three.\nfour five");
    expect(wordCount(d)).toBe(5);
    expect(wordCount(emptyDocument())).toBe(0);
  });
  it("reads at 200 words a minute, at least one minute", () => {
    expect(readingMinutes(d)).toBe(1);
    expect(readingMinutes(sanitizeDocument(doc(p("word ".repeat(450)))))).toBe(3);
  });
  it("knows when there is nothing to publish", () => {
    expect(isDocumentEmpty(emptyDocument())).toBe(true);
    expect(isDocumentEmpty(sanitizeDocument(doc(p("   "))))).toBe(true);
    expect(isDocumentEmpty(d)).toBe(false);
    expect(isDocumentEmpty(sanitizeDocument(doc({ type: "image", attrs: { publicId: "a", alt: "" } })))).toBe(false);
    expect(isDocumentEmpty(sanitizeDocument(doc({ type: "blockquote", content: [{ type: "image", attrs: { publicId: "a", alt: "" } }] })))).toBe(true);
  });
  it("cuts an excerpt at a word boundary with an ellipsis", () => {
    const long = sanitizeDocument(doc(p("alpha ".repeat(100))));
    const ex = excerptFrom(long, 40);
    expect(ex.length).toBeLessThanOrEqual(40);
    expect(ex.endsWith("…")).toBe(true);
    expect(excerptFrom(d)).toBe("One two three. four five");
  });
  it("parseDocumentJson cleans valid JSON and returns null for invalid JSON", () => {
    expect(parseDocumentJson('{"type":"doc","content":[{"type":"script"}]}')).toEqual(emptyDocument());
    expect(parseDocumentJson("{not json")).toBeNull();
  });
});
