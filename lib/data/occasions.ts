import { asc, eq } from "drizzle-orm";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";

export type Occasion = { slug: string; title: string; intro: string; categories: string[]; minPrice?: number; maxPrice?: number; query: string };
const toOccasion = (r: typeof schema.giftOccasions.$inferSelect): Occasion => ({ slug: r.slug, title: r.title, intro: r.intro, categories: r.categories.split(",").map((x) => x.trim()).filter(Boolean), minPrice: r.minPrice ?? undefined, maxPrice: r.maxPrice ?? undefined, query: r.query });

export const loadOccasions = cached(async (): Promise<Occasion[]> => {
  if (!db) return [];
  return (await db.select().from(schema.giftOccasions).where(eq(schema.giftOccasions.enabled, true)).orderBy(asc(schema.giftOccasions.position), asc(schema.giftOccasions.title))).map(toOccasion);
}, "occasions", ["occasions"], 21600);

export const loadOccasion = cached(async (slug: string): Promise<Occasion | undefined> => {
  if (!db) return undefined;
  const [r] = await db.select().from(schema.giftOccasions).where(eq(schema.giftOccasions.slug, slug));
  return r && r.enabled ? toOccasion(r) : undefined;
}, "occasion", ["occasions"], 21600);
