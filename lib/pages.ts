import { eq } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";
import { DEFAULT_PAGES } from "@/lib/pages-core";

export type SitePage = { slug: string; title: string; body: string; description: string; custom: boolean };

/** A published page: the customised version if one was saved, otherwise the built-in default text. */
export const loadPage = cached(async (slug: string): Promise<SitePage | undefined> => {
  const d = DEFAULT_PAGES[slug];
  if (db) {
    const [r] = await db.select().from(schema.pages).where(eq(schema.pages.slug, slug));
    if (r) return r.status === "published" ? { slug, title: r.title, body: r.body, description: r.seoDescription, custom: true } : undefined;
  }
  return d ? { slug, title: d.title, body: d.body, description: d.description, custom: false } : undefined;
}, "page", ["pages"], 86400);

export const loadPageSlugs = cached(async (): Promise<string[]> => {
  const custom = db ? (await db.select({ slug: schema.pages.slug }).from(schema.pages).where(eq(schema.pages.status, "published"))).map((r) => r.slug) : [];
  return [...new Set([...Object.keys(DEFAULT_PAGES), ...custom])];
}, "page-slugs", ["pages"], 86400);
