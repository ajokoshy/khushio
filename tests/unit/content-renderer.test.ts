import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentRenderer } from "@/shared/content/document-renderer";
import type { Doc } from "@/modules/content/document";

const el = (doc: Doc) => createElement(DocumentRenderer, { doc });

const hostile = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script><img src=x onerror=alert(2)>" }] },
    { type: "paragraph", content: [{ type: "text", text: "bad link", marks: [{ type: "link", attrs: { href: "javascript:alert(3)" } }] }] },
    { type: "script", content: [{ type: "text", text: "alert(4)" }] },
    { type: "image", attrs: { publicId: "https://evil.example/x.png", alt: "x" } },
    { type: "paragraph", content: [{ type: "text", text: "good link", marks: [{ type: "link", attrs: { href: "https://example.com/a?b=1&c=2" } }] }] },
    { type: "paragraph", content: [{ type: "text", text: "site link", marks: [{ type: "link", attrs: { href: "/go/thing" } }] }] },
  ],
} as unknown as Doc;

describe("DocumentRenderer", () => {
  const html = renderToStaticMarkup(el(hostile));

  it("escapes text that looks like markup", () => {
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });
  it("never emits a javascript: address or an unknown node", () => {
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain("alert(4)");
    expect(html).not.toContain("evil.example");
  });
  it("draws allowed links, with rel on outside links", () => {
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/a\?b=1&amp;c=2"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain('href="/go/thing"');
  });
  it("renders an empty document as an empty container", () => {
    expect(renderToStaticMarkup(el({ type: "doc", content: [] }))).toContain("article-body");
    expect(renderToStaticMarkup(el(null as unknown as Doc))).toContain("article-body");
  });
});
