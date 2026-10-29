import type { MetadataRoute } from "next";
import { enabled, legalLinks, nav, site } from "@/lib/config/site";
import { slugify } from "@/lib/slug";
import { loadBrands, loadCollections, loadCategories, loadArticles, loadProducts } from "@/lib/data/catalog";

export const revalidate = 3600;
type Entry = MetadataRoute.Sitemap[number];
const at = (path: string, lastModified?: Date): Entry => ({ url: `${site.url}${path === "/" ? "" : path}`, ...(lastModified && !Number.isNaN(+lastModified) ? { lastModified } : {}) });

/** Only published, indexable pages. lastModified is included only where we really know it; never "now". */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, articles, brands, categories, collections] = await Promise.all([loadProducts(), loadArticles(), loadBrands(), loadCategories(), loadCollections()]);
  const stores = [...new Set(products.flatMap((p) => p.offers.map((o) => slugify(o.merchant))))];
  return [
    at("/"),
    ...enabled([...nav, ...legalLinks]).map((i) => at(i.href)),
    ...categories.map((c) => at(`/categories/${c.slug}`)),
    ...products.map((p) => at(`/products/${p.slug}`, p.updatedAt)),
    ...brands.map((b) => at(`/brands/${b.slug}`)),
    ...collections.map((c) => at(`/collections/${c.slug}`)),
    ...stores.map((s) => at(`/stores/${s}`)),
    ...articles.map((a) => at(`/journal/${a.slug}`, new Date(a.date))),
  ];
}
