import type { Metadata } from "next";
import { env } from "@/core/config/env";
import { imageUrl } from "@/infrastructure/cloudinary";
import type { SeoFields } from "./types";

/**
 * Search and share tags for an article or page: the editor's SEO fields win, otherwise sensible defaults from the content.
 * "Keep out of search results" (robots) becomes noindex; the canonical address is the page's own unless one is set.
 */
export function contentMetadata(opts: { title: string; description: string | null; path: string; seo: SeoFields; coverPublicId?: string | null; type: "article" | "website" }): Metadata {
  const { seo } = opts;
  const url = seo.canonical ?? `${env.NEXT_PUBLIC_SITE_URL}${opts.path}`;
  const title = seo.title ?? opts.title;
  const description = seo.description ?? opts.description ?? undefined;
  const image = seo.ogImage ?? (opts.coverPublicId ? imageUrl(opts.coverPublicId, "editorial") : null);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: seo.robots ? { index: false, follow: seo.robots === "noindex,follow" } : { index: true, follow: true },
    openGraph: { title, description, url, type: opts.type, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}
