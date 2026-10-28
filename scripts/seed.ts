import { db, schema } from "../lib/db";
import { articles, coupons, deals, products as sample } from "../lib/data/catalog";
async function main() {
  if (!db) throw new Error("DATABASE_URL missing");
  for (const p of sample) {
    const [row] = await db.insert(schema.products).values({ slug: p.slug, name: p.name, brand: p.brand, category: p.category, blurb: p.blurb, price: p.price, mrp: p.mrp ?? null }).onConflictDoNothing().returning();
    if (row) await db.insert(schema.offers).values(p.offers.map((o) => ({ productId: row.id, merchant: o.merchant, url: o.url })));
  }
  const url = (id: string) => sample.flatMap((p) => p.offers).find((o) => o.id === id)!.url;
  await db.insert(schema.deals).values(deals.map((d) => ({ title: d.title, merchant: d.merchant, url: url(d.offerId), ends: d.ends })));
  await db.insert(schema.coupons).values(coupons.map((c) => ({ code: c.code, merchant: c.merchant, detail: c.detail, url: url(c.offerId) })));
  await db.insert(schema.articles).values(articles.map((a) => ({ slug: a.slug, title: a.title, excerpt: a.excerpt, body: a.body.join("\n\n"), date: a.date }))).onConflictDoNothing();
  console.log("Seeded.");
}
main();
