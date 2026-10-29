// Sample data below is for local development only (no DATABASE_URL, NODE_ENV != production). It is never served in production.
import { categories, toneClass } from "@/lib/config/site";
import { approvedFor } from "@/lib/affiliate/rules";
export type Offer = { id: string; merchant: string; url: string };
export type Product = { updatedAt?: Date; slug: string; name: string; brand: string; category: string; categoryLabel?: string; blurb: string; price: number; mrp?: number; image?: string; offers: Offer[] };
export type Deal = { slug: string; title: string; merchant: string; offerId: string; ends: string };
export type Coupon = { code: string; merchant: string; detail: string; offerId: string; verifiedAt?: Date };
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

// ---- Live data ----------------------------------------------------------------------------------------------
// Fail closed: with a database, errors propagate (Next.js keeps serving the last good static page) and empty tables
// mean empty pages. Samples are used only when there is NO database and we are not in production.
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** True only for local development without a database. Evaluated per call so tests can change NODE_ENV. */
export const samplesAllowed = () => !db && process.env.NODE_ENV !== "production";
const notExpired = (col: Parameters<typeof gt>[0]) => or(isNull(col), gt(col, new Date()));
const UUID = /^[0-9a-f-]{36}$/i;
async function safe<T>(fn: () => Promise<T[]>, fallback: T[]): Promise<T[]> { if (!db) return samplesAllowed() ? fallback : []; return fn(); }

export async function loadProducts(): Promise<Product[]> {
  if (!db) return samplesAllowed() ? products : [];
  const rows = await db.select().from(schema.products).where(eq(schema.products.status, "published")).orderBy(asc(schema.products.createdAt));
  if (!rows.length) return [];
  const offs = (await db.select({ o: schema.offers }).from(schema.offers)
    .leftJoin(schema.merchants, eq(schema.merchants.id, schema.offers.merchantId))
    .where(and(inArray(schema.offers.productId, rows.map((r) => r.id)), eq(schema.offers.isActive, true), notExpired(schema.offers.expiresAt), or(isNull(schema.merchants.id), eq(schema.merchants.isActive, true))))).map((r) => r.o);
  const labels = Object.fromEntries((await loadCategories()).map((c) => [c.slug, c.label]));
  return rows.map((r) => ({
    categoryLabel: labels[r.category], slug: r.slug, name: r.name, brand: r.brand, category: r.category, blurb: r.blurb, price: r.price, mrp: r.mrp ?? undefined,
    image: r.imageUrl ?? undefined, updatedAt: r.updatedAt ?? r.createdAt ?? undefined,
    offers: offs.filter((o) => o.productId === r.id).map((o) => ({ id: o.id, merchant: o.merchant, url: o.url })),
  }));
}

export const loadDeals = () => safe<Deal>(async () => (await db!.select().from(schema.deals)
  .where(and(eq(schema.deals.isActive, true), notExpired(schema.deals.expiresAt))).orderBy(desc(schema.deals.createdAt)))
  .map((r) => ({ slug: r.id, title: r.title, merchant: r.merchant, offerId: r.id, ends: r.ends })), deals);
export const loadCoupons = () => safe<Coupon>(async () => (await db!.select().from(schema.coupons)
  .where(and(eq(schema.coupons.isActive, true), notExpired(schema.coupons.expiresAt))).orderBy(desc(schema.coupons.createdAt)))
  .map((r) => ({ code: r.code, merchant: r.merchant, detail: r.detail, offerId: r.id, verifiedAt: r.verifiedAt ?? undefined })), coupons);
export const loadArticles = () => safe<Article>(async () => (await db!.select().from(schema.articles).orderBy(desc(schema.articles.createdAt)))
  .map((r) => ({ slug: r.slug, title: r.title, excerpt: r.excerpt, date: r.date, body: r.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) })), articles);

/** A followable outbound link, with everything /go/[id] needs to validate it. */
export type ResolvedOffer = { id: string; merchant: string; merchantId: string | null; url: string; approvedDomains: string[] };

export async function resolveOffer(id: string): Promise<ResolvedOffer | undefined> {
  if (!db) { const s = samplesAllowed() ? findOffer(id) : undefined; return s && { ...s, merchantId: null, approvedDomains: [] }; }
  if (!UUID.test(id)) return undefined;
  const [hit] = await db.select({ o: schema.offers, m: schema.merchants }).from(schema.offers)
    .innerJoin(schema.products, eq(schema.products.id, schema.offers.productId))
    .leftJoin(schema.merchants, eq(schema.merchants.id, schema.offers.merchantId))
    .where(and(eq(schema.offers.id, id), eq(schema.offers.isActive, true), notExpired(schema.offers.expiresAt), eq(schema.products.status, "published"), or(isNull(schema.merchants.id), eq(schema.merchants.isActive, true))));
  if (hit) return { id, merchant: hit.o.merchant, merchantId: hit.m?.id ?? null, url: hit.o.url, approvedDomains: hit.m ? approvedFor(hit.m.approvedDomains, hit.m.website) : [] };
  const byName = async (name: string) => (await db!.select().from(schema.merchants).where(eq(schema.merchants.slug, slugify(name))))[0];
  const [d] = await db.select().from(schema.deals).where(and(eq(schema.deals.id, id), eq(schema.deals.isActive, true), notExpired(schema.deals.expiresAt)));
  if (d) { const m = await byName(d.merchant); if (m && !m.isActive) return undefined; return { id, merchant: d.merchant, merchantId: m?.id ?? null, url: d.url, approvedDomains: m ? approvedFor(m.approvedDomains, m.website) : [] }; }
  const [c] = await db.select().from(schema.coupons).where(and(eq(schema.coupons.id, id), eq(schema.coupons.isActive, true), notExpired(schema.coupons.expiresAt)));
  if (c) { const m = await byName(c.merchant); if (m && !m.isActive) return undefined; return { id, merchant: c.merchant, merchantId: m?.id ?? null, url: c.url, approvedDomains: m ? approvedFor(m.approvedDomains, m.website) : [] }; }
}
/** Kept for callers that only need merchant and url. */
export async function findOfferAsync(id: string): Promise<{ id: string; merchant: string; url: string } | undefined> {
  const r = await resolveOffer(id); return r && { id: r.id, merchant: r.merchant, url: r.url };
}

export type Brand = { slug: string; name: string; about: string };
export async function loadBrands(): Promise<Brand[]> {
  if (!db) return samplesAllowed() ? brands : [];
  return (await db.select().from(schema.brands).orderBy(asc(schema.brands.name))).map((r) => ({ slug: r.slug, name: r.name, about: r.about }));
}

export type Category = { slug: string; label: string; icon: string; tone: string };
export async function loadCategories(): Promise<Category[]> {
  if (!db) return samplesAllowed() ? [...categories] : [];
  return (await db.select().from(schema.categories).orderBy(asc(schema.categories.position))).map((r) => ({ slug: r.slug, label: r.label, icon: r.icon, tone: toneClass[r.tone] ?? toneClass.sand }));
}

export type Collection = { slug: string; title: string; description: string; productSlugs: string[] };
export const loadCollections = () => safe<Collection>(async () => {
  const cs = await db!.select().from(schema.collections).orderBy(asc(schema.collections.position));
  const links = await db!.select({ cid: schema.collectionProducts.collectionId, slug: schema.products.slug }).from(schema.collectionProducts)
    .innerJoin(schema.products, and(eq(schema.products.id, schema.collectionProducts.productId), eq(schema.products.status, "published"))).orderBy(asc(schema.collectionProducts.position));
  return cs.map((c) => ({ slug: c.slug, title: c.title, description: c.description, productSlugs: links.filter((l) => l.cid === c.id).map((l) => l.slug) }));
}, []);
