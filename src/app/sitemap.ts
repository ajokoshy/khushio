import type { MetadataRoute } from "next";
import { env } from "@/core/config/env";
import { listSitemapProducts } from "@/modules/catalog/service";
import { listSitemapContent } from "@/modules/content/public";
import { listBrandOptions, listPublicCategoryOptions } from "@/modules/discover/service";

export const revalidate = 3600;

/** Homepage, the catalogue, and every visible product, active category and active brand. A database outage must not break the sitemap. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "daily", priority: 0.8 },
    // Only the list page: individual offers have no page of their own, so no ended offer can ever be in the sitemap.
    { url: `${base}/deals`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/articles`, changeFrequency: "daily", priority: 0.6 },
  ];
  try {
    const [products, categories, brands] = await Promise.all([listSitemapProducts(5000), listPublicCategoryOptions(), listBrandOptions()]);
    for (const c of categories) entries.push({ url: `${base}/categories/${c.slug}`, changeFrequency: "daily", priority: 0.7 });
    for (const b of brands) entries.push({ url: `${base}/brands/${b.slug}`, changeFrequency: "weekly", priority: 0.5 });
    for (const p of products) entries.push({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.6 });
  } catch (error) {
    console.error("Sitemap: catalogue unavailable", error);
  }
  try {
    const content = await listSitemapContent(5000);
    for (const t of content.topics) entries.push({ url: `${base}/articles/category/${t.slug}`, changeFrequency: "weekly", priority: 0.5 });
    for (const a of content.articles) entries.push({ url: `${base}/articles/${a.slug}`, lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.6 });
    for (const p of content.pages) entries.push({ url: `${base}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.4 });
  } catch (error) {
    console.error("Sitemap: articles unavailable", error);
  }
  return entries;
}
