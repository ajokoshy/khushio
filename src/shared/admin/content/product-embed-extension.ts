import { Node as TiptapNode } from "@tiptap/react";

/**
 * The "product" block of the article editor (Release 6B). It stores one thing, the product id, so price, picture and store
 * link are always read live when the page is drawn. `label` only lets the editor show the product's name while editing; the
 * server drops it when the text is saved (src/modules/content/document.ts keeps just the id).
 */
export const ProductEmbed = TiptapNode.create({
  name: "productEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      productId: { default: null, rendered: false, parseHTML: (el: HTMLElement) => el.getAttribute("data-product-embed") },
      label: { default: null, rendered: false, parseHTML: (el: HTMLElement) => el.getAttribute("data-label") },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-product-embed]" }];
  },

  renderHTML({ node }) {
    const label = typeof node.attrs.label === "string" && node.attrs.label !== "" ? node.attrs.label : "product";
    return ["div", { "data-product-embed": String(node.attrs.productId ?? ""), "data-label": String(node.attrs.label ?? ""), contenteditable: "false" }, `Product: ${label}`];
  },
});

type RawNode = { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };

/** Puts the product names into the starting document so embeds show a name in the editor. Does not change anything else. */
export function withEmbedLabels(doc: unknown, labels: Record<string, string>): unknown {
  if (!doc || typeof doc !== "object" || !Array.isArray((doc as RawNode).content)) return doc;
  const root = doc as RawNode;
  return {
    ...root,
    content: (root.content ?? []).map((node) => {
      const n = node as RawNode;
      if (n?.type !== "productEmbed") return node;
      const id = typeof n.attrs?.productId === "string" ? n.attrs.productId : "";
      return { ...n, attrs: { ...n.attrs, label: labels[id] ?? null } };
    }),
  };
}
