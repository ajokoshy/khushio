/**
 * DEVELOPMENT ONLY. Adds a starter category tree, two example brands, two merchants and 60 sample products (no images) so the admin
 * screens have something to show. Safe to run twice (existing slugs are left alone).
 *
 *   npm run db:seed-dev -- --yes
 *
 * It prints which database it is about to write to and does nothing without --yes. It refuses to run
 * when NODE_ENV or VERCEL_ENV says production. Never point it at your production Neon branch.
 */
import { eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { brands, categories, coupons, deals, merchants, productCategories, productTags, productVariants, products } from "@/core/database/schema";
import { generateSeedProducts, SEED_BRANDS, SEED_CATEGORIES, SEED_MERCHANTS, type SeedCategory } from "./dev-seed-data";

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

/** Sample products with variants, a main category and tags. A product that already exists (same slug) is left alone. */
async function addProducts(): Promise<number> {
  const cats = new Map((await db().select({ id: categories.id, slug: categories.slug }).from(categories)).map((c) => [c.slug, c.id]));
  const brandIds = new Map((await db().select({ id: brands.id, slug: brands.slug }).from(brands)).map((b) => [b.slug, b.id]));
  let added = 0;
  for (const p of generateSeedProducts()) {
    const [row] = await db()
      .insert(products)
      .values({ slug: p.slug, name: p.name, summary: p.summary, description: p.description, status: p.status, brandId: brandIds.get(p.brandSlug) ?? null })
      .onConflictDoNothing()
      .returning({ id: products.id });
    if (!row) continue;
    added++;
    const categoryId = cats.get(p.categorySlug);
    if (categoryId) await db().insert(productCategories).values({ productId: row.id, categoryId, isPrimary: true });
    await db().insert(productVariants).values(p.variants.map((v, i) => ({ productId: row.id, label: v.label, sku: v.sku, priceMinor: v.priceMinor, currency: "INR", sortOrder: i })));
    await db().insert(productTags).values(p.tags.map((tag) => ({ productId: row.id, tag })));
  }
  return added;
}

/** Three example offers on the first seeded store: one live, one that starts tomorrow, one that ends in two hours (plus a coupon on the live one). */
async function addDeals(): Promise<number> {
  const [store] = await db().select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, SEED_MERCHANTS[0]?.slug ?? "")).limit(1);
  if (!store) return 0;
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  const rows = [
    { slug: "dev-deal-live", title: "Sample deal: live now", startsAt: new Date(now - hour), endsAt: new Date(now + 48 * hour), isFeatured: true, sortOrder: 0 },
    { slug: "dev-deal-tomorrow", title: "Sample deal: starts tomorrow", startsAt: new Date(now + 24 * hour), endsAt: new Date(now + 72 * hour), isFeatured: false, sortOrder: 1 },
    { slug: "dev-deal-ending", title: "Sample deal: ends in two hours", startsAt: new Date(now - 24 * hour), endsAt: new Date(now + 2 * hour), isFeatured: false, sortOrder: 2 },
  ].map((d) => ({ ...d, merchantId: store.id, type: "deal", status: "published", description: "Example offer from the development seed." }));
  const added = await db().insert(deals).values(rows).onConflictDoNothing().returning({ id: deals.id, slug: deals.slug });
  const live = added.find((d) => d.slug === "dev-deal-live");
  if (live) await db().insert(coupons).values({ dealId: live.id, merchantId: store.id, code: "DEVSAVE15", discountType: "percent", discountValue: 1500, startsAt: new Date(now - hour), endsAt: new Date(now + 48 * hour) }).onConflictDoNothing();
  return added.length;
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV or VERCEL_ENV says production. Dev seeds are for development databases only.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (use .env.local).");
  const host = new URL(url).host;
  if (!process.argv.includes("--yes")) {
    console.log(`This would add starter categories, brands, merchants and sample products to the database at ${host}.\nRun again with --yes if that is a DEVELOPMENT or PREVIEW database.`);
    return;
  }

  const addedCategories = await addCategories(SEED_CATEGORIES, null);
  const addedBrands = (await db().insert(brands).values(SEED_BRANDS).onConflictDoNothing().returning({ id: brands.id })).length;
  const addedMerchants = (await db().insert(merchants).values(SEED_MERCHANTS).onConflictDoNothing().returning({ id: merchants.id })).length;
  const addedProducts = await addProducts();
  const addedDeals = await addDeals();
  console.log(`Seeded ${host}: ${addedCategories} categories, ${addedBrands} brands, ${addedMerchants} merchants, ${addedProducts} products, ${addedDeals} deals added.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
