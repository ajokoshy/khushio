/**
 * The article document: what the editor produces, what the database stores and what visitors are shown.
 *
 * Why JSON and a whitelist (Release 6A): raw HTML from an editor or from a paste can carry <script>, event handlers
 * and javascript: links. Here the stored document is rebuilt node by node from a short list of allowed nodes and
 * marks, and the page is drawn from that clean tree with React elements (never innerHTML). Anything else is dropped.
 *
 *   nodes  paragraph, heading (levels 2 to 4), bulletList, orderedList, listItem, blockquote, hardBreak, image, productEmbed, text
 *   marks  bold, italic, link (http, https, mailto or a path on this site)
 *   image  only a media-library public id, a description and optional size: the address is built from the id
 *   productEmbed (Release 6B)  only a product id. Price, picture and link are read live when the page is drawn, and the embed
 *          is left out when the product is not visible (archived, draft). At most DOCUMENT_LIMITS.maxEmbeds per document.
 *
 * sanitizeDocument() never throws and never trusts its input, so the same function guards what is saved and what
 * is rendered.
 */

export type DocMark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };
export type TextNode = { type: "text"; text: string; marks?: DocMark[] };
export type HardBreakNode = { type: "hardBreak" };
export type ImageNode = { type: "image"; attrs: { publicId: string; alt: string; width?: number; height?: number } };
export type ProductEmbedNode = { type: "productEmbed"; attrs: { productId: string } };
export type InlineNode = TextNode | HardBreakNode;
export type ParagraphNode = { type: "paragraph"; content: InlineNode[] };
export type HeadingNode = { type: "heading"; attrs: { level: 2 | 3 | 4 }; content: InlineNode[] };
export type ListItemNode = { type: "listItem"; content: BlockNode[] };
export type ListNode = { type: "bulletList" | "orderedList"; content: ListItemNode[] };
export type BlockquoteNode = { type: "blockquote"; content: BlockNode[] };
export type BlockNode = ParagraphNode | HeadingNode | ListNode | BlockquoteNode | ImageNode | ProductEmbedNode;
export type Doc = { type: "doc"; content: BlockNode[] };

export const emptyDocument = (): Doc => ({ type: "doc", content: [] });

export const DOCUMENT_LIMITS = { maxDepth: 8, maxNodes: 20_000, maxText: 20_000, maxHref: 2048, maxAlt: 200, maxSide: 8000, maxEmbeds: 20 } as const;

const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,254}$/;
export const isPublicId = (value: string) => PUBLIC_ID.test(value) && !value.includes("..");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isProductId = (value: string) => UUID.test(value);

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** http, https, mailto, or a path on this site. Anything else (javascript:, data:, vbscript:, //host) is refused. Returns the cleaned address or null. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href === "" || href.length > DOCUMENT_LIMITS.maxHref) return null;
  // Browsers ignore tabs, new lines and other control characters inside a scheme ("java\nscript:"), so check without them.
  const probe = href.replace(/[\u0000-\u001F\u007F\u0080-\u009F\s]/g, "");
  if (/^\/(?!\/)/.test(probe)) return probe === href ? href : null;
  if (/^https?:\/\/[^/\s]/i.test(probe) || /^mailto:[^\s]+@[^\s]+$/i.test(probe)) return probe === href ? href : null;
  return null;
}

type Budget = { nodes: number; embeds: number };

function cleanMarks(value: unknown): DocMark[] | undefined {
  const out: DocMark[] = [];
  let bold = false;
  let italic = false;
  let link: string | null = null;
  for (const m of asArray(value)) {
    if (!isObject(m)) continue;
    if (m.type === "bold") bold = true;
    else if (m.type === "italic") italic = true;
    else if (m.type === "link" && isObject(m.attrs)) link = safeHref(m.attrs.href) ?? link;
  }
  if (bold) out.push({ type: "bold" });
  if (italic) out.push({ type: "italic" });
  if (link) out.push({ type: "link", attrs: { href: link } });
  return out.length > 0 ? out : undefined;
}

function cleanInline(value: unknown, budget: Budget): InlineNode[] {
  const out: InlineNode[] = [];
  for (const raw of asArray(value)) {
    if (!isObject(raw) || budget.nodes-- <= 0) continue;
    if (raw.type === "text" && typeof raw.text === "string" && raw.text !== "") {
      const marks = cleanMarks(raw.marks);
      out.push({ type: "text", text: raw.text.slice(0, DOCUMENT_LIMITS.maxText), ...(marks ? { marks } : {}) });
    } else if (raw.type === "hardBreak") out.push({ type: "hardBreak" });
    // Unknown inline nodes are dropped together with everything inside them.
  }
  return out;
}

const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= DOCUMENT_LIMITS.maxSide ? v : undefined);

function cleanBlocks(value: unknown, allowed: ReadonlySet<string>, depth: number, budget: Budget): BlockNode[] {
  const out: BlockNode[] = [];
  if (depth > DOCUMENT_LIMITS.maxDepth) return out;
  for (const raw of asArray(value)) {
    if (!isObject(raw) || budget.nodes-- <= 0 || typeof raw.type !== "string" || !allowed.has(raw.type)) continue;
    switch (raw.type) {
      case "paragraph":
        out.push({ type: "paragraph", content: cleanInline(raw.content, budget) });
        break;
      case "heading": {
        const n = isObject(raw.attrs) ? Number(raw.attrs.level) : 2;
        // The page title is the only h1, so a level 1 heading is shown as level 2.
        const level = (n >= 2 && n <= 4 ? n : n === 1 ? 2 : 3) as 2 | 3 | 4;
        out.push({ type: "heading", attrs: { level }, content: cleanInline(raw.content, budget) });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = cleanBlocks(raw.content, LIST_ONLY, depth + 1, budget) as unknown as ListItemNode[];
        if (items.length > 0) out.push({ type: raw.type, content: items });
        break;
      }
      case "listItem": {
        const content = cleanBlocks(raw.content, IN_ITEM, depth + 1, budget);
        out.push({ type: "listItem", content: content.length > 0 ? content : [{ type: "paragraph", content: [] }] } as unknown as BlockNode);
        break;
      }
      case "blockquote": {
        const content = cleanBlocks(raw.content, IN_QUOTE, depth + 1, budget);
        if (content.length > 0) out.push({ type: "blockquote", content });
        break;
      }
      case "image": {
        const a = isObject(raw.attrs) ? raw.attrs : {};
        const publicId = typeof a.publicId === "string" ? a.publicId.trim() : "";
        if (!isPublicId(publicId)) break;
        const alt = typeof a.alt === "string" ? a.alt.trim().slice(0, DOCUMENT_LIMITS.maxAlt) : "";
        const width = int(a.width);
        const height = int(a.height);
        out.push({ type: "image", attrs: { publicId, alt, ...(width && height ? { width, height } : {}) } });
        break;
      }
      case "productEmbed": {
        const a = isObject(raw.attrs) ? raw.attrs : {};
        const productId = typeof a.productId === "string" ? a.productId.trim().toLowerCase() : "";
        // Anything else the editor keeps on the node (the product name it shows while editing) is dropped here.
        if (!isProductId(productId) || budget.embeds <= 0) break;
        budget.embeds -= 1;
        out.push({ type: "productEmbed", attrs: { productId } });
        break;
      }
    }
  }
  return out;
}

const IN_DOC: ReadonlySet<string> = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote", "image", "productEmbed"]);
const LIST_ONLY: ReadonlySet<string> = new Set(["listItem"]);
const IN_ITEM: ReadonlySet<string> = new Set(["paragraph", "bulletList", "orderedList", "blockquote"]);
const IN_QUOTE: ReadonlySet<string> = new Set(["paragraph", "bulletList", "orderedList", "blockquote"]);

/** Rebuilds any value (parsed JSON, a database column, hostile input) into a clean document. Unknown nodes and marks are dropped. */
export function sanitizeDocument(input: unknown): Doc {
  if (!isObject(input) || input.type !== "doc") return emptyDocument();
  return { type: "doc", content: cleanBlocks(input.content, IN_DOC, 1, { nodes: DOCUMENT_LIMITS.maxNodes, embeds: DOCUMENT_LIMITS.maxEmbeds }) };
}

/* ---------------------------------- reading the document ---------------------------------- */

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : " ")).join("");
}

function blockText(block: BlockNode | ListItemNode, out: string[]): void {
  switch (block.type) {
    case "paragraph":
    case "heading": out.push(inlineText(block.content)); break;
    case "bulletList":
    case "orderedList":
    case "blockquote":
    case "listItem": for (const child of block.content as BlockNode[]) blockText(child, out); break;
    case "image":
    case "productEmbed": break;
  }
}

/** The words of the document, one block per line. Images contribute nothing. */
export function documentText(doc: Doc): string {
  const lines: string[] = [];
  for (const block of doc.content) blockText(block, lines);
  return lines.join("\n").trim();
}

function hasImage(blocks: readonly (BlockNode | ListItemNode)[]): boolean {
  return blocks.some((b) => (b.type === "image" ? true : b.type === "productEmbed" ? false : b.type !== "paragraph" && b.type !== "heading" && hasImage(b.content as BlockNode[])));
}

/** The ids of the products embedded in the document, in order, each once. Embeds only sit at the top level of a document. */
export function collectProductIds(doc: Doc): string[] {
  const out: string[] = [];
  for (const block of doc.content) if (block.type === "productEmbed" && !out.includes(block.attrs.productId)) out.push(block.attrs.productId);
  return out;
}

/** True when there is nothing to publish: no words and no image. */
export function isDocumentEmpty(doc: Doc): boolean {
  return documentText(doc).replace(/\s+/g, "") === "" && !hasImage(doc.content);
}

export function wordCount(doc: Doc): number {
  const text = documentText(doc);
  return text === "" ? 0 : text.split(/\s+/).length;
}

/** Minutes to read at 200 words a minute, at least 1. */
export function readingMinutes(doc: Doc): number {
  return Math.max(1, Math.ceil(wordCount(doc) / 200));
}

/** A short plain-text summary from the first words, cut at a word boundary. */
export function excerptFrom(doc: Doc, max = 160): string {
  const text = documentText(doc).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trimEnd()}…`;
}

/** Parses the JSON text a form posts. Null when it is not JSON at all. */
export function parseDocumentJson(text: string): Doc | null {
  try {
    return sanitizeDocument(JSON.parse(text));
  } catch {
    return null;
  }
}
