import type { MetadataRoute } from "next";
import { categories, enabled, legalLinks, nav, site } from "@/lib/config/site";
import { brands, loadArticles, loadProducts } from "@/lib/data/catalog";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await loadProducts();
  const articles = await loadArticles();
  const paths = ["/", ...enabled([...nav, ...legalLinks]).map((i) => i.href), ...categories.map((c) => `/categories/${c.slug}`),
    ...products.map((p) => `/products/${p.slug}`), ...brands.map((b) => `/brands/${b.slug}`), ...articles.map((a) => `/journal/${a.slug}`)];
  return paths.map((p) => ({ url: `${site.url}${p === "/" ? "" : p}`, lastModified: new Date() }));
}
