// SAMPLE DATA ONLY: replace with Neon/Drizzle queries (see drizzle/schema.ts). Offer URLs are placeholders.
import { categories } from "@/lib/config/site";
export type Offer = { id: string; merchant: string; url: string };
export type Product = { slug: string; name: string; brand: string; category: string; blurb: string; price: number; mrp?: number; offers: Offer[] };
export type Deal = { slug: string; title: string; merchant: string; offerId: string; ends: string };
export type Coupon = { code: string; merchant: string; detail: string; offerId: string };
export type Article = { slug: string; title: string; excerpt: string; date: string; body: string[] };

export const brands = [
  { slug: "greenleaf", name: "Greenleaf", about: "Sample emerging brand for everyday home goods." },
  { slug: "tarang", name: "Tarang", about: "Sample brand for sound and small electronics." },
  { slug: "kora", name: "Kora", about: "Sample brand for skin and body care." },
];
export const products: Product[] = [
  { slug: "jute-storage-basket-set", name: "Jute storage basket set", brand: "greenleaf", category: "home-living", blurb: "Three nesting baskets for shelves and wardrobes.", price: 899, mrp: 1299, offers: [{ id: "o1", merchant: "Sample Store", url: "https://example.com/p/1" }] },
  { slug: "wireless-earbuds-air", name: "Wireless earbuds Air", brand: "tarang", category: "electronics-gadgets", blurb: "Lightweight earbuds with a pocket charging case.", price: 1799, mrp: 2999, offers: [{ id: "o2", merchant: "Sample Store", url: "https://example.com/p/2" }] },
  { slug: "vitamin-c-face-serum", name: "Vitamin C face serum", brand: "kora", category: "beauty-personal-care", blurb: "A daily serum for an even-looking glow.", price: 549, offers: [{ id: "o3", merchant: "Sample Beauty", url: "https://example.com/p/3" }] },
  { slug: "cotton-block-print-scarf", name: "Cotton block-print scarf", brand: "greenleaf", category: "fashion-accessories", blurb: "A soft, breathable scarf in a terracotta print.", price: 699, offers: [{ id: "o4", merchant: "Sample Store", url: "https://example.com/p/4" }] },
  { slug: "resistance-band-kit", name: "Resistance band kit", brand: "tarang", category: "sports-fitness", blurb: "Five bands with a carry pouch for home workouts.", price: 499, mrp: 799, offers: [{ id: "o5", merchant: "Sample Sports", url: "https://example.com/p/5" }] },
  { slug: "wooden-stacking-toy", name: "Wooden stacking toy", brand: "greenleaf", category: "kids-baby", blurb: "A painted wooden stacker for toddlers.", price: 649, offers: [{ id: "o6", merchant: "Sample Kids", url: "https://example.com/p/6" }] },
];
export const deals: Deal[] = [
  { slug: "earbuds-festive-offer", title: "Wireless earbuds Air at 40% off", merchant: "Sample Store", offerId: "o2", ends: "2026-11-15" },
  { slug: "home-refresh-sale", title: "Home storage sale on baskets", merchant: "Sample Store", offerId: "o1", ends: "2026-11-30" },
];
export const coupons: Coupon[] = [
  { code: "SAMPLE10", merchant: "Sample Beauty", detail: "10% off your first order (sample)", offerId: "o3" },
  { code: "KIDS150", merchant: "Sample Kids", detail: "₹150 off above ₹999 (sample)", offerId: "o6" },
];
export const articles: Article[] = [
  { slug: "how-we-pick-products", title: "How we pick products", date: "2026-10-28", excerpt: "What we look at before a product appears on Khushio.", body: ["We start with what people actually need: durable, fairly priced everyday items.", "We compare price history, reviews and return policies before listing anything.", "Some links on Khushio are affiliate links. They never change which products we choose."] },
  { slug: "small-upgrades-for-a-happier-home", title: "Small upgrades for a happier home", date: "2026-10-28", excerpt: "Five low-cost changes that make a room feel calmer.", body: ["Start with storage: baskets and shelves clear visual clutter fast.", "Add one natural texture such as jute, cotton or wood.", "Swap harsh bulbs for warm light in the evening."] },
];
export const catLabel = (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug;
export const findOffer = (id: string) => products.flatMap((p) => p.offers).find((o) => o.id === id);
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// ---- Live data: Neon when DATABASE_URL is set and has published products, otherwise the samples above ----
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
export async function loadProducts(): Promise<Product[]> {
  if (!db) return products;
  try {
    const rows = await db.select().from(schema.products).where(eq(schema.products.status, "published"));
    if (!rows.length) return products;
    const offs = await db.select().from(schema.offers);
    return rows.map((r) => ({ slug: r.slug, name: r.name, brand: r.brand, category: r.category, blurb: r.blurb, price: r.price, mrp: r.mrp ?? undefined,
      offers: offs.filter((o) => o.productId === r.id).map((o) => ({ id: o.id, merchant: o.merchant, url: o.url })) }));
  } catch { return products; }
}
const UUID = /^[0-9a-f-]{36}$/i;
async function safe<T>(fn: () => Promise<T[]>, fallback: T[]): Promise<T[]> { if (!db) return fallback; try { return await fn(); } catch { return fallback; } }
export const loadDeals = () => safe<Deal>(async () => (await db!.select().from(schema.deals).orderBy(desc(schema.deals.createdAt))).map((r) => ({ slug: r.id, title: r.title, merchant: r.merchant, offerId: r.id, ends: r.ends })), deals);
export const loadCoupons = () => safe<Coupon>(async () => (await db!.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt))).map((r) => ({ code: r.code, merchant: r.merchant, detail: r.detail, offerId: r.id })), coupons);
export const loadArticles = () => safe<Article>(async () => (await db!.select().from(schema.articles).orderBy(desc(schema.articles.createdAt))).map((r) => ({ slug: r.slug, title: r.title, excerpt: r.excerpt, date: r.date, body: r.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) })), articles);
export async function findOfferAsync(id: string): Promise<{ id: string; merchant: string; url: string } | undefined> {
  const hit = findOffer(id) ?? (await loadProducts()).flatMap((p) => p.offers).find((o) => o.id === id);
  if (hit || !db || !UUID.test(id)) return hit;
  try {
    const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)); if (d) return { id, merchant: d.merchant, url: d.url };
    const [c] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id)); if (c) return { id, merchant: c.merchant, url: c.url };
  } catch {}
}
