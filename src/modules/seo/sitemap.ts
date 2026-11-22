/**
 * Release 7A: sitemap files as pure functions (no database, no framework), so the rules can be tested.
 *
 * One URL list per kind: static pages, categories, brands, stores, articles (articles, guides, topics, stand-alone pages)
 * and products. Up to SITEMAP_CHUNK (5,000) URLs the site serves ONE sitemap at /sitemap.xml. Past that, /sitemap.xml
 * becomes a sitemap INDEX that lists one file per kind, with products split into numbered files of 5,000
 * (/sitemaps/products-1.xml, products-2.xml, ...). Search engines allow 50,000 per file; 5,000 keeps each answer small.
 */

export const SITEMAP_CHUNK = 5000;

export type ChangeFrequency = "daily" | "weekly" | "monthly";
export type SitemapEntry = { path: string; lastModified?: Date | null; changeFrequency?: ChangeFrequency; priority?: number };

export const SITEMAP_KINDS = ["static", "categories", "brands", "stores", "articles", "products"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];
export type SitemapCounts = Record<SitemapKind, number>;

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function urlsetXml(base: string, entries: readonly SitemapEntry[]): string {
  const root = base.replace(/\/+$/, "");
  const urls = entries.map((e) => {
    const loc = `${root}${e.path === "/" ? "" : e.path}` || root;
    return `<url><loc>${escapeXml(loc)}</loc>${e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : ""}${e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : ""}${e.priority !== undefined ? `<priority>${e.priority.toFixed(1)}</priority>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
}

export function indexXml(base: string, files: readonly string[]): string {
  const root = base.replace(/\/+$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map((f) => `<sitemap><loc>${escapeXml(`${root}/sitemaps/${f}`)}</loc></sitemap>`).join("")}</sitemapindex>\n`;
}

export type SitemapPlan = { mode: "single" } | { mode: "index"; files: string[] };

/** One file, or an index of files. Empty kinds get no file. */
export function planSitemap(counts: SitemapCounts): SitemapPlan {
  const total = SITEMAP_KINDS.reduce((sum, k) => sum + counts[k], 0);
  if (total <= SITEMAP_CHUNK) return { mode: "single" };
  const files: string[] = [];
  for (const kind of SITEMAP_KINDS) {
    if (counts[kind] === 0) continue;
    if (kind === "products") for (let n = 1; n <= Math.ceil(counts.products / SITEMAP_CHUNK); n++) files.push(`products-${n}.xml`);
    else files.push(`${kind}.xml`);
  }
  return { mode: "index", files };
}

/** "products-2.xml" -> { kind: "products", page: 2 }; "brands.xml" -> { kind: "brands", page: 1 }. Anything else is null (a 404). */
export function parseSitemapFile(name: string): { kind: SitemapKind; page: number } | null {
  const m = /^([a-z]+)(?:-([1-9][0-9]{0,3}))?\.xml$/.exec(name);
  if (!m) return null;
  const kind = m[1] as SitemapKind;
  if (!(SITEMAP_KINDS as readonly string[]).includes(kind)) return null;
  if (kind === "products") return m[2] ? { kind, page: Number(m[2]) } : null;
  return m[2] ? null : { kind, page: 1 };
}
