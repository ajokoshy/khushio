import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EmbedProduct } from "@/modules/catalog/types";
import { collectProductIds, DOCUMENT_LIMITS, isDocumentEmpty, sanitizeDocument, type Doc } from "@/modules/content/document";
import { DocumentRenderer } from "@/shared/content/document-renderer";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const embed = (productId: unknown, extra: Record<string, unknown> = {}) => ({ type: "productEmbed", attrs: { productId, ...extra } });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("product embeds in the document whitelist (Release 6B)", () => {
  it("keeps only the product id: the editor's label and any other attribute are dropped", () => {
    const clean = sanitizeDocument(doc(embed(A, { label: "Tea kettle", href: "javascript:alert(1)", html: "<b>x</b>" })));
    expect(clean.content).toEqual([{ type: "productEmbed", attrs: { productId: A } }]);
  });

  it("lower-cases the id and refuses anything that is not a UUID", () => {
    expect(sanitizeDocument(doc(embed(A.toUpperCase()))).content).toEqual([{ type: "productEmbed", attrs: { productId: A } }]);
    for (const bad of ["", "abc", "../../etc/passwd", `${A}; drop table products`, `${A}x`, 42, null, undefined, { a: 1 }]) {
      expect(sanitizeDocument(doc(embed(bad))).content, String(bad)).toEqual([]);
    }
    expect(sanitizeDocument(doc({ type: "productEmbed" })).content).toEqual([]);
  });

  it("allows embeds at the top level only, not inside lists or quotes", () => {
    const nested = doc({ type: "blockquote", content: [embed(A), { type: "paragraph", content: [{ type: "text", text: "kept" }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [embed(B)] }] });
    const clean = JSON.stringify(sanitizeDocument(nested));
    expect(clean).not.toContain("productEmbed");
    expect(clean).toContain("kept");
  });

  it("allows at most DOCUMENT_LIMITS.maxEmbeds embeds in one document", () => {
    const many = doc(...Array.from({ length: DOCUMENT_LIMITS.maxEmbeds + 5 }, () => embed(A)));
    expect(sanitizeDocument(many).content).toHaveLength(DOCUMENT_LIMITS.maxEmbeds);
  });

  it("lists each embedded product once, in order", () => {
    expect(collectProductIds(sanitizeDocument(doc(embed(B), { type: "paragraph", content: [] }, embed(A), embed(B))))).toEqual([B, A]);
    expect(collectProductIds(sanitizeDocument(doc()))).toEqual([]);
  });

  it("does not count an embed as text or a picture when deciding whether there is anything to publish", () => {
    expect(isDocumentEmpty(sanitizeDocument(doc(embed(A))))).toBe(true);
    expect(isDocumentEmpty(sanitizeDocument(doc(embed(A), { type: "paragraph", content: [{ type: "text", text: "Words" }] })))).toBe(false);
  });
});

const product: EmbedProduct = { id: A, slug: "tea-kettle", name: "Tea kettle <b>", summary: "Boils fast", brandName: "Kettlr", imagePublicId: null, imageAlt: null, minPriceMinor: 129900, maxPriceMinor: 129900, linkSlug: "kettle-amazon", merchantName: "Amazon" };

describe("DocumentRenderer with product embeds", () => {
  const document = sanitizeDocument(doc(embed(A), embed(B), { type: "paragraph", content: [{ type: "text", text: "after" }] })) as Doc;

  it("draws a card for a product that is live, with its store link marked sponsored, and escapes its name", () => {
    const html = renderToStaticMarkup(createElement(DocumentRenderer, { doc: document, products: new Map([[A, product]]) }));
    expect(html).toContain("/products/tea-kettle");
    expect(html).toContain("/go/kettle-amazon");
    expect(html).toContain("sponsored nofollow noopener");
    expect(html).toContain("Buy at Amazon");
    expect(html).toContain("Tea kettle &lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("after");
  });

  it("leaves out an embed whose product is not in the map (archived, draft or deleted): no broken card", () => {
    const html = renderToStaticMarkup(createElement(DocumentRenderer, { doc: document }));
    expect(html).not.toContain("/products/");
    expect(html).not.toContain("<aside");
    expect(html).toContain("after");
  });

  it("shows no store button for a product without an active link", () => {
    const html = renderToStaticMarkup(createElement(DocumentRenderer, { doc: document, products: new Map([[A, { ...product, linkSlug: null, merchantName: null }]]) }));
    expect(html).not.toContain("/go/");
    expect(html).toContain("/products/tea-kettle");
  });
});
