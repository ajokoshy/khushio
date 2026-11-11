import type { MetadataRoute } from "next";
import { env } from "@/core/config/env";
// Phase 1: homepage only. Product/category/article URLs are added as those modules ship.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: env.NEXT_PUBLIC_SITE_URL, changeFrequency: "daily", priority: 1 }];
}
