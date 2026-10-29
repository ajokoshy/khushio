import type { MetadataRoute } from "next";
import { enabled, legalLinks, nav, site } from "@/lib/config/site";
import { slugify } from "@/lib/slug";
import { loadBrands, loadCollections, loadCategories, loadArticles, loadProducts } from "@/lib/data/catalog";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await loadProducts();
  const articles = await loadArticles();
  const brands = await loadBrands();
  const categories = await loadCategories();
  const collections = await loadCollections();
  const stores = [...new Set(products.flatMap((p) => p.offers.map((o) => slugify(o.merchant))))];
  const paths = ["/", ...enabled([...nav, ...legalLinks]).map((i) => i.href), ...categories.map((c) => `/categories/${c.slug}`),
    ...products.map((p) => `/products/${p.slug}`), ...brands.map((b) => `/brands/${b.slug}`), ...collections.map((c) => `/collections/${c.slug}`), ...stores.map((s) => `/stores/${s}`), ...articles.map((a) => `/journal/${a.slug}`)];
  return paths.map((p) => ({ url: `${site.url}${p === "/" ? "" : p}`, lastModified: new Date() }));
}
