import { slugify } from "./slug";

/**
 * A small, safe Markdown subset for articles and pages. Output is a typed tree rendered by React (never raw HTML),
 * so content cannot inject markup or scripts. No dependency, so nothing extra ships to the browser.
 *
 * Supported: ## / ### / #### headings, paragraphs, - lists, 1. lists, > quotes, ---, ``` code, **bold**, *italic*, `code`,
 * [links](/path or https://…), a product card on its own line: [[product:slug]], an image on its own line: ![alt](media:ID)
 */
export type Inline = { t: "text"; v: string } | { t: "b"; c: Inline[] } | { t: "i"; c: Inline[] } | { t: "code"; v: string } | { t: "a"; href: string; kind: "internal" | "external" | "go"; c: Inline[] };
export type Block =
  | { t: "h"; level: 2 | 3 | 4; id: string; c: Inline[]; text: string } | { t: "p"; c: Inline[] } | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] } | { t: "hr" } | { t: "code"; v: string } | { t: "product"; slug: string } | { t: "img"; mediaId: string; alt: string };

/** Only site paths and https links are allowed; anything else (javascript:, data:, http:, //host) is rejected. */
export function safeHref(raw: string): { href: string; kind: "internal" | "external" | "go" } | null {
  const u = raw.trim();
  if (/^\/(?!\/)[^\s\\]*$/.test(u)) return { href: u, kind: u.startsWith("/go/") ? "go" : "internal" };
  if (/^https:\/\/[^\s\\]+$/i.test(u)) return { href: u, kind: "external" };
  return null;
}

const INLINE = /\*\*([^*]+?)\*\*|(?<![*\w])\*([^*\s][^*]*?)\*(?!\*)|`([^`]+)`|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []; let rest = src;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push({ t: "text", v: rest }); break; }
    if (m.index) out.push({ t: "text", v: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "i", c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: "code", v: m[3] });
    else { const link = safeHref(m[5]); out.push(link ? { t: "a", ...link, c: parseInline(m[4]) } : { t: "text", v: m[4] }); }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const plain = (c: Inline[]): string => c.map((x) => ("v" in x ? x.v : plain(x.c))).join("");

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n"), out: Block[] = [], used = new Map<string, number>();
  let i = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: "p", c: parseInline(para.join(" ")) }); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i], trimmed = line.trim();
    if (!trimmed) { flush(); i++; continue; }
    if (trimmed.startsWith("```")) { flush(); const buf: string[] = []; i++; while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]); i++; out.push({ t: "code", v: buf.join("\n") }); continue; }
    const h = /^(#{1,4})\s+(.+?)\s*#*$/.exec(trimmed);
    if (h) { flush(); const level = Math.min(Math.max(h[1].length, 2), 4) as 2 | 3 | 4, c = parseInline(h[2]), text = plain(c); let id = slugify(text) || "section"; const n = used.get(id) ?? 0; used.set(id, n + 1); if (n) id = `${id}-${n + 1}`; out.push({ t: "h", level, id, c, text }); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flush(); out.push({ t: "hr" }); i++; continue; }
    const prod = /^\[\[product:([a-z0-9-]{1,120})\]\]$/.exec(trimmed); if (prod) { flush(); out.push({ t: "product", slug: prod[1] }); i++; continue; }
    const img = /^!\[([^\]]*)\]\(media:([0-9a-f-]{36})\)$/i.exec(trimmed); if (img) { flush(); out.push({ t: "img", alt: img[1], mediaId: img[2].toLowerCase() }); i++; continue; }
    if (/^>\s?/.test(trimmed)) { flush(); const buf: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i].trim())) buf.push(lines[i++].trim().replace(/^>\s?/, "")); out.push({ t: "quote", c: parseInline(buf.join(" ")) }); continue; }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed), ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) { flush(); const re = ul ? /^[-*]\s+(.*)$/ : /^\d+[.)]\s+(.*)$/, items: Inline[][] = []; while (i < lines.length) { const m = re.exec(lines[i].trim()); if (!m) break; items.push(parseInline(m[1])); i++; } out.push({ t: ul ? "ul" : "ol", items }); continue; }
    para.push(trimmed); i++;
  }
  flush(); return out;
}

export const extractProductSlugs = (b: Block[]) => [...new Set(b.flatMap((x) => (x.t === "product" ? [x.slug] : [])))];
export const extractMediaIds = (b: Block[]) => [...new Set(b.flatMap((x) => (x.t === "img" ? [x.mediaId] : [])))];
export const headings = (b: Block[]) => b.flatMap((x) => (x.t === "h" ? [{ id: x.id, text: x.text, level: x.level }] : []));
/** Words in the visible text, for the reading-time estimate (about 200 words a minute). */
export const readingMinutes = (src: string) => Math.max(1, Math.round(src.replace(/\[\[product:[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length / 200));
/** First paragraph as plain text, trimmed to `max` characters on a word boundary. */
export function excerptOf(b: Block[], max = 160): string {
  const p = b.find((x) => x.t === "p"); if (!p || p.t !== "p") return "";
  const t = plain(p.c); if (t.length <= max) return t; const cut = t.slice(0, max - 1); return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}…`;
}
