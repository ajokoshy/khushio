import { categoryIcons, toneClass } from "@/lib/config/site";
import { parseDomains } from "./affiliate/rules";
import { parseCsv, unescapeCell } from "./csv";
import type { ImportError } from "./import";
import { slugify } from "./slug";

export type ImportKind = "products" | "offers" | "merchants" | "brands" | "categories" | "articles";
export const IMPORT_KINDS: Record<ImportKind, { label: string; required: string[]; optional: string[] }> = {
  products: { label: "Products", required: ["name", "price", "category", "url"], optional: ["slug", "brand", "blurb", "mrp", "status", "merchant"] },
  offers: { label: "Retailer offers and prices", required: ["product_slug", "merchant", "url"], optional: ["price", "mrp", "active", "expires", "price_checked"] },
  merchants: { label: "Merchants", required: ["name"], optional: ["slug", "website", "approved_domains", "active"] },
  brands: { label: "Brands", required: ["name"], optional: ["slug", "about"] },
  categories: { label: "Categories", required: ["label"], optional: ["slug", "icon", "tone", "position", "parent"] },
  articles: { label: "Journal articles", required: ["title", "body"], optional: ["slug", "excerpt", "date"] },
};
export const IMPORT_ROW_LIMIT = 500;
export const IMPORT_CHUNK = 100;

export type Parsed<T> = { rows: (T & { line: number; key: string })[]; errors: ImportError[]; missingColumns: string[]; truncated: number };
type Ctx = { today?: string; categoryParents?: Record<string, string | null>; limit?: number };

const yes = (v: string, dflt: boolean) => (v === "" ? dflt : !/^(0|no|n|false|off)$/i.test(v));
const ymd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(+new Date(`${s}T00:00:00Z`));

function read(text: string, kind: ImportKind, limit: number) {
  const [head = [], ...data] = parseCsv(text); const idx = head.map((h) => h.trim().toLowerCase());
  const missing = data.length || head.length ? IMPORT_KINDS[kind].required.filter((c) => !idx.includes(c)) : [];
  return { idx, data: missing.length ? [] : data.slice(0, limit), truncated: missing.length ? 0 : Math.max(0, data.length - limit), missing, col: (r: string[], k: string) => unescapeCell(r[idx.indexOf(k)] ?? "") };
}
function run<T>(kind: ImportKind, text: string, limit: number, each: (c: (k: string) => string, bad: (reason: string) => void, line: number) => (T & { key: string }) | undefined): Parsed<T> {
  const { data, truncated, missing, col } = read(text, kind, limit); const rows: Parsed<T>["rows"] = [], errors: ImportError[] = [], seen = new Set<string>();
  data.forEach((r, i) => {
    const line = i + 2; let failed = false; const bad = (reason: string) => { failed = true; errors.push({ line, reason }); };
    const row = each((k) => col(r, k), bad, line); if (failed || !row) return;
    if (seen.has(row.key)) return void errors.push({ line, reason: `"${row.key}" appears more than once in this file` });
    seen.add(row.key); rows.push({ ...row, line });
  });
  return { rows, errors, missingColumns: [...missing], truncated };
}

export type MerchantRow = { name: string; slug: string; website: string; approvedDomains: string; isActive: boolean };
export const parseMerchants = (text: string, ctx: Ctx = {}) => run<MerchantRow>("merchants", text, ctx.limit ?? IMPORT_ROW_LIMIT, (c, bad) => {
  const name = c("name"), slug = slugify(c("slug") || name), website = c("website");
  if (!name) return void bad("name is empty"); if (!slug) return void bad("name has no letters or digits to build a slug from");
  if (website && !website.startsWith("https://")) return void bad("website must start with https://");
  return { key: slug, name, slug, website, approvedDomains: parseDomains(c("approved_domains")).join(", "), isActive: yes(c("active"), true) };
});

export type BrandRow = { name: string; slug: string; about: string };
export const parseBrands = (text: string, ctx: Ctx = {}) => run<BrandRow>("brands", text, ctx.limit ?? IMPORT_ROW_LIMIT, (c, bad) => {
  const name = c("name"), slug = slugify(c("slug") || name);
  if (!name) return void bad("name is empty"); if (!slug) return void bad("name has no letters or digits to build a slug from");
  return { key: slug, name, slug, about: c("about") };
});

export type CategoryRow = { label: string; slug: string; icon: string; tone: string; position: number; parent: string };
export function parseCategories(text: string, ctx: Ctx = {}): Parsed<CategoryRow> {
  const out = run<CategoryRow>("categories", text, ctx.limit ?? IMPORT_ROW_LIMIT, (c, bad) => {
    const label = c("label"), slug = slugify(c("slug") || label), icon = c("icon") || "Sparkles", tone = c("tone") || "sand", parent = slugify(c("parent"));
    if (!label) return void bad("label is empty"); if (!slug) return void bad("label has no letters or digits to build a slug from");
    if (!(categoryIcons as readonly string[]).includes(icon)) return void bad(`unknown icon "${icon}"`);
    if (!(tone in toneClass)) return void bad(`unknown colour "${tone}"`);
    if (parent && parent === slug) return void bad("a category cannot be its own parent");
    const position = Math.round(Number(c("position")) || 0);
    return { key: slug, label, slug, icon, tone, position, parent };
  });
  // Parents must exist (in the file or already) and must not form a loop together with existing parents.
  const parents: Record<string, string | null> = { ...(ctx.categoryParents ?? {}) }; for (const r of out.rows) parents[r.slug] = r.parent || null;
  out.rows = out.rows.filter((r) => {
    if (r.parent && !(r.parent in parents)) { out.errors.push({ line: r.line, reason: `parent "${r.parent}" does not exist` }); return false; }
    let cur: string | null | undefined = r.parent || null, hops = 0; while (cur && hops++ < 50) { if (cur === r.slug) { out.errors.push({ line: r.line, reason: "parent would create a loop" }); return false; } cur = parents[cur]; }
    return true;
  });
  out.errors.sort((a, b) => a.line - b.line); return out;
}

export type ArticleRow = { title: string; slug: string; excerpt: string; body: string; date: string };
export const parseArticles = (text: string, ctx: Ctx = {}) => run<ArticleRow>("articles", text, ctx.limit ?? IMPORT_ROW_LIMIT, (c, bad) => {
  const title = c("title"), body = c("body"), slug = slugify(c("slug") || title), date = c("date") || ctx.today || new Date().toISOString().slice(0, 10);
  if (!title) return void bad("title is empty"); if (!body) return void bad("body is empty"); if (!slug) return void bad("title has no letters or digits to build a slug from");
  if (!ymd(date)) return void bad("date must look like 2026-12-31");
  return { key: slug, title, slug, excerpt: c("excerpt"), body, date };
});

export type OfferRow = { productSlug: string; merchant: string; url: string; price: number | null; mrp: number | null; isActive: boolean; expiresAt: string | null; priceChecked: boolean };
export const parseOffers = (text: string, ctx: Ctx = {}) => run<OfferRow>("offers", text, ctx.limit ?? IMPORT_ROW_LIMIT, (c, bad) => {
  const productSlug = slugify(c("product_slug")), merchant = c("merchant"), url = c("url"), priceRaw = c("price"), mrpRaw = c("mrp"), expires = c("expires");
  const price = priceRaw ? Math.round(Number(priceRaw)) : null, mrp = mrpRaw ? Math.round(Number(mrpRaw)) : null;
  if (!productSlug) return void bad("product_slug is empty"); if (!merchant) return void bad("merchant is empty");
  if (!url.startsWith("https://")) return void bad("link must start with https://");
  if (price !== null && !(price > 0)) return void bad("price must be a positive number"); if (mrp !== null && (price === null || !(mrp > price))) return void bad("mrp needs a price and must be higher than it");
  if (expires && !ymd(expires)) return void bad("expires must look like 2026-12-31");
  return { key: `${productSlug}|${slugify(merchant) || "store"}`, productSlug, merchant, url, price, mrp, isActive: yes(c("active"), true), expiresAt: expires ? new Date(`${expires}T23:59:59+05:30`).toISOString() : null, priceChecked: yes(c("price_checked"), false) };
});
