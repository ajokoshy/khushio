/**
 * DEVELOPMENT ONLY. Adds a starter category tree, two example brands and two merchants so the admin
 * screens have something to show. Safe to run twice (existing slugs are left alone).
 *
 *   npm run db:seed-dev -- --yes
 *
 * It prints which database it is about to write to and does nothing without --yes. It refuses to run
 * when NODE_ENV or VERCEL_ENV says production. Never point it at your production Neon branch.
 */
import { eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { brands, categories, merchants } from "@/core/database/schema";
import { SEED_BRANDS, SEED_CATEGORIES, SEED_MERCHANTS, type SeedCategory } from "./dev-seed-data";

async function addCategories(nodes: SeedCategory[], parentId: string | null): Promise<number> {
  let added = 0;
  for (const [index, node] of nodes.entries()) {
    const inserted = await db()
      .insert(categories)
      .values({ slug: node.slug, name: node.name, parentId, sortOrder: index })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    let id = inserted[0]?.id;
    if (id) added++;
    else {
      const [existing] = await db().select({ id: categories.id }).from(categories).where(eq(categories.slug, node.slug)).limit(1);
      id = existing?.id;
    }
    if (id && node.children) added += await addCategories(node.children, id);
  }
  return added;
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV or VERCEL_ENV says production. Dev seeds are for development databases only.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (use .env.local).");
  const host = new URL(url).host;
  if (!process.argv.includes("--yes")) {
    console.log(`This would add starter categories, brands and merchants to the database at ${host}.\nRun again with --yes if that is a DEVELOPMENT or PREVIEW database.`);
    return;
  }

  const addedCategories = await addCategories(SEED_CATEGORIES, null);
  const addedBrands = (await db().insert(brands).values(SEED_BRANDS).onConflictDoNothing().returning({ id: brands.id })).length;
  const addedMerchants = (await db().insert(merchants).values(SEED_MERCHANTS).onConflictDoNothing().returning({ id: merchants.id })).length;
  console.log(`Seeded ${host}: ${addedCategories} categories, ${addedBrands} brands, ${addedMerchants} merchants added.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
