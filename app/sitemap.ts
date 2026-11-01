import type { MetadataRoute } from "next";
import { enabled, legalLinks, nav, site } from "@/lib/config/site";
import { loadBrands, loadCategories, loadCollections, loadDeals, loadProductSlugs, loadStoreSlugs } from "@/lib/data/catalog";
import { loadComparisons } from "@/lib/data/comparisons";
import { loadOccasions } from "@/lib/data/occasions";
import { loadPageSlugs } from "@/lib/pages";
import { loadJournalSlugs } from "@/lib/data/journal";

export const revalidate = 21600;
type Entry = MetadataRoute.Sitemap[number];
const at = (path: string, lastModified?: string | Date): Entry => {
  const d = lastModified ? new Date(lastModified) : undefined;
  return { url: `${site.url}${path === "/" ? "" : path}`, ...(d && !Number.isNaN(+d) ? { lastModified: d } : {}) };
};

/** Only published, indexable pages. lastModified is included only where we really know it; never "now". */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, journal, brands, categories, collections, stores, deals, occasions, comparisons, pages] = await Promise.all([loadProductSlugs(), loadJournalSlugs(), loadBrands(), loadCategories(), loadCollections(), loadStoreSlugs(), loadDeals(), loadOccasions(), loadComparisons(), loadPageSlugs()]);
  const staticLinks = enabled([...nav, ...legalLinks]);
  return [
    at("/"),
    ...staticLinks.map((i) => at(i.href)),
    ...pages.filter((slug) => !staticLinks.some((i) => i.href === `/${slug}`)).map((slug) => at(`/${slug}`)),
    ...categories.map((c) => at(`/categories/${c.slug}`)),
    ...products.map((p) => at(`/products/${p.slug}`, p.updatedAt)),
    ...brands.map((b) => at(`/brands/${b.slug}`)),
    ...collections.map((c) => at(`/collections/${c.slug}`)),
    ...stores.map((s) => at(`/stores/${s}`)),
    ...deals.map((d) => at(`/deals/${d.slug}`)),
    ...occasions.map((o) => at(`/gifts/${o.slug}`)),
    ...comparisons.map((c) => at(`/compare/${c.slug}`, c.updatedAt)),
    ...journal.articles.map((a) => at(`/journal/${a.slug}`, a.updatedAt)),
    ...journal.categories.map((c) => at(`/journal/${c}`)),
  ];
}
