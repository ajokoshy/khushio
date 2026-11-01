import { slugify } from "./slug";

const listOf = (v: string, max: number) => [...new Set(v.split(/[,\n]/).map((x) => slugify(x)).filter(Boolean))].slice(0, max);
const posInt = (v: string) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };

export type OccasionInput = { slug: string; title: string; intro: string; categories: string; minPrice: number | null; maxPrice: number | null; query: string; position: number; enabled: boolean };
/** A gift occasion is a saved search: title, optional categories, price range and words. Nothing per product is stored. */
export function cleanOccasion(r: { title: string; slug: string; intro: string; categories: string; min: string; max: string; query: string; position: string; enabled: boolean }): { ok: true; value: OccasionInput } | { ok: false; error: "title" | "slug" | "price" | "empty" } {
  const title = r.title.trim().replace(/\s+/g, " ").slice(0, 80); if (!title) return { ok: false, error: "title" };
  const slug = slugify(r.slug || title).slice(0, 60); if (!slug) return { ok: false, error: "slug" };
  const min = r.min.trim() ? posInt(r.min) : null, max = r.max.trim() ? posInt(r.max) : null;
  if ((r.min.trim() && min === null) || (r.max.trim() && max === null) || (min !== null && max !== null && max < min)) return { ok: false, error: "price" };
  const categories = listOf(r.categories, 8).join(","), query = r.query.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!categories && min === null && max === null && !query) return { ok: false, error: "empty" };
  return { ok: true, value: { slug, title, intro: r.intro.trim().slice(0, 400), categories, minPrice: min, maxPrice: max, query, position: Math.round(Number(r.position)) || 0, enabled: r.enabled } };
}

export type ComparisonInput = { slug: string; title: string; intro: string; verdict: string; productSlugs: string[]; status: "draft" | "published" };
export function cleanComparison(r: { title: string; slug: string; intro: string; verdict: string; products: string; status: string }): { ok: true; value: ComparisonInput } | { ok: false; error: "title" | "slug" | "products" } {
  const title = r.title.trim().replace(/\s+/g, " ").slice(0, 100); if (!title) return { ok: false, error: "title" };
  const slug = slugify(r.slug || title).slice(0, 80); if (!slug) return { ok: false, error: "slug" };
  const productSlugs = listOf(r.products, 4); if (productSlugs.length < 2) return { ok: false, error: "products" };
  return { ok: true, value: { slug, title, intro: r.intro.trim().slice(0, 600), verdict: r.verdict.replace(/\r\n?/g, "\n").trim().slice(0, 1500), productSlugs, status: r.status === "draft" ? "draft" : "published" } };
}

/** Deal addresses are readable and unique: "Big sale" -> "big-sale", or "big-sale-3fa9" when taken. */
export function dealSlug(title: string, taken: (s: string) => boolean, rand: () => string = () => Math.random().toString(16).slice(2, 6)): string {
  const base = slugify(title).slice(0, 50) || "deal"; if (!taken(base)) return base;
  for (let i = 0; i < 8; i++) { const s = `${base}-${rand()}`; if (!taken(s)) return s; }
  return `${base}-${Date.now().toString(36)}`;
}
