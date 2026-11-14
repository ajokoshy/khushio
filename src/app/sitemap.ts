import type { MetadataRoute } from "next";
import { env } from "@/core/config/env";
import { listSitemapProducts } from "@/modules/catalog/service";
import { listBrandOptions, listPublicCategoryOptions } from "@/modules/discover/service";

export const revalidate = 3600;

/** Homepage, the catalogue, and every visible product, active category and active brand. A database outage must not break the sitemap. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const [products, categories, brands] = await Promise.all([listSitemapProducts(5000), listPublicCategoryOptions(), listBrandOptions()]);
    for (const c of categories) entries.push({ url: `${base}/categories/${c.slug}`, changeFrequency: "daily", priority: 0.7 });
    for (const b of brands) entries.push({ url: `${base}/brands/${b.slug}`, changeFrequency: "weekly", priority: 0.5 });
    for (const p of products) entries.push({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.6 });
  } catch (error) {
    console.error("Sitemap: catalogue unavailable", error);
  }
  return entries;
}
