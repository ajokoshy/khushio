import { and, asc, eq } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";

export type Comparison = { slug: string; title: string; intro: string; verdict: string; productSlugs: string[]; updatedAt?: string };
export const loadComparison = cached(async (slug: string): Promise<Comparison | undefined> => {
  if (!db) return undefined;
  const [r] = await db.select().from(schema.comparisons).where(and(eq(schema.comparisons.slug, slug), eq(schema.comparisons.status, "published")));
  return r && { slug: r.slug, title: r.title, intro: r.intro, verdict: r.verdict, productSlugs: r.productSlugs, updatedAt: r.updatedAt?.toISOString() };
}, "comparison", ["comparisons"], 21600);
export const loadComparisons = cached(async (): Promise<Comparison[]> => {
  if (!db) return [];
  return (await db.select().from(schema.comparisons).where(eq(schema.comparisons.status, "published")).orderBy(asc(schema.comparisons.title))).map((r) => ({ slug: r.slug, title: r.title, intro: r.intro, verdict: r.verdict, productSlugs: r.productSlugs, updatedAt: r.updatedAt?.toISOString() }));
}, "comparisons", ["comparisons"], 21600);
