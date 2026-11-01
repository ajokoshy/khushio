// Sample data below is for local development only (no DATABASE_URL, NODE_ENV != production). It is never served in production.
import { categories, toneClass } from "@/lib/config/site";
import { approvedFor } from "@/lib/affiliate/rules";
import { cached } from "@/lib/cache";
import { normalizeSearch, pageCount, searchInMemory, type SearchResult, type Sort } from "@/lib/search-core";
export type Offer = { id: string; merchant: string; url: string; price?: number; mrp?: number; currency?: string; checkedAt?: string; inactive?: boolean };
export type Product = { updatedAt?: string; featured?: boolean; seoTitle?: string; seoDescription?: string; priceIsReference?: boolean; slug: string; name: string; brand: string; category: string; categoryLabel?: string; blurb: string; price: number; mrp?: number; image?: string; offers: Offer[] };
export type Deal = { slug: string; title: string; merchant: string; offerId: string; ends: string; description?: string; expiresAt?: string };
export type Coupon = { code: string; merchant: string; detail: string; offerId: string; verifiedAt?: string };
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
// Every loader is cached in Next's data cache under a tag; admin changes invalidate just those tags.
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** True only for local development without a database. Evaluated per call so tests can change NODE_ENV. */
export const samplesAllowed = () => !db && process.env.NODE_ENV !== "production";
const notExpired = (col: Parameters<typeof gt>[0]) => or(isNull(col), gt(col, new Date()));
const UUID = /^[0-9a-f-]{36}$/i;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
async function safe<T>(fn: () => Promise<T[]>, fallback: T[]): Promise<T[]> { if (!db) return samplesAllowed() ? fallback : []; return fn(); }

type ProductRow = typeof schema.products.$inferSelect;
/** Attaches offers, derives the displayed price and returns plain JSON-safe products. Offers are listed cheapest first. */
async function hydrate(rows: ProductRow[], opts: { includeInactive?: boolean } = {}): Promise<Product[]> {
  if (!rows.length) return [];
  const conds = [inArray(schema.offers.productId, rows.map((r) => r.id))];
  if (!opts.includeInactive) conds.push(eq(schema.offers.isActive, true), notExpired(schema.offers.expiresAt)!, or(isNull(schema.merchants.id), eq(schema.merchants.isActive, true))!);
  const offs = await db!.select({ o: schema.offers, mActive: schema.merchants.isActive }).from(schema.offers)
    .leftJoin(schema.merchants, eq(schema.merchants.id, schema.offers.merchantId)).where(and(...conds)).orderBy(asc(schema.offers.createdAt));
  const labels = Object.fromEntries((await loadCategories()).map((c) => [c.slug, c.label]));
  const now = Date.now();
  return rows.map((r) => {
    const own: Offer[] = offs.filter((x) => x.o.productId === r.id).map(({ o, mActive }) => ({
      id: o.id, merchant: o.merchant, url: o.url, price: o.price && o.price > 0 ? o.price : undefined, mrp: o.mrp ?? undefined, currency: o.currency, checkedAt: iso(o.priceCheckedAt),
      ...(!o.isActive || (o.expiresAt && o.expiresAt.getTime() <= now) || mActive === false ? { inactive: true } : {}),
    })).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    const best = own.find((o) => o.price && !o.inactive);
    return {
      slug: r.slug, name: r.name, brand: r.brand, category: r.category, categoryLabel: labels[r.category], blurb: r.blurb, image: r.imageUrl ?? undefined,
      price: best ? best.price! : r.price, mrp: best ? (best.mrp && best.mrp > best.price! ? best.mrp : undefined) : r.mrp ?? undefined, priceIsReference: !best,
      featured: r.featured || undefined, seoTitle: r.seoTitle ?? undefined, seoDescription: r.seoDescription ?? undefined, updatedAt: iso(r.updatedAt ?? r.createdAt), offers: own,
    };
  });
}

/** Every published product. Fine for small tasks and tests; pages use the targeted loaders below instead. */
export const loadProducts = cached(async (): Promise<Product[]> => {
  if (!db) return samplesAllowed() ? products : [];
  return hydrate(await db.select().from(schema.products).where(eq(schema.products.status, "published")).orderBy(asc(schema.products.createdAt)));
}, "products-all", ["products", "categories"]);

export const loadProduct = cached(async (slug: string): Promise<Product | undefined> => {
  if (!db) return samplesAllowed() ? products.find((p) => p.slug === slug) : undefined;
  return (await hydrate(await db.select().from(schema.products).where(and(eq(schema.products.slug, slug), eq(schema.products.status, "published")))))[0];
}, "product", ["products", "categories"]);

/** Draft and archived products too, with inactive offers flagged. Admin preview only; never cached. */
export async function loadProductForPreview(id: string): Promise<(Product & { status: string }) | undefined> {
  if (!db || !UUID.test(id)) return undefined;
  const [r] = await db.select().from(schema.products).where(eq(schema.products.id, id)); if (!r) return undefined;
  return { ...(await hydrate([r], { includeInactive: true }))[0], status: r.status };
}

export const loadProductsBySlugs = cached(async (slugs: string[]): Promise<Product[]> => {
  const want = [...new Set(slugs)].slice(0, 60); if (!want.length) return [];
  if (!db) return samplesAllowed() ? want.flatMap((s) => products.filter((p) => p.slug === s)) : [];
  const got = await hydrate(await db.select().from(schema.products).where(and(inArray(schema.products.slug, want), eq(schema.products.status, "published"))));
  return want.flatMap((s) => got.filter((p) => p.slug === s));
}, "products-by-slugs", ["products", "categories"]);

/** Slugs and last-modified dates only: cheap enough for the sitemap and static params. */
export const loadProductSlugs = cached(async (): Promise<{ slug: string; updatedAt?: string }[]> => {
  if (!db) return samplesAllowed() ? products.map((p) => ({ slug: p.slug })) : [];
  return (await db.select({ slug: schema.products.slug, u: schema.products.updatedAt, c: schema.products.createdAt }).from(schema.products).where(eq(schema.products.status, "published")).orderBy(asc(schema.products.createdAt))).map((r) => ({ slug: r.slug, updatedAt: iso(r.u ?? r.c) }));
}, "product-slugs", ["products"]);

/** Name and slug of every published product, for pickers (compare). */
export const loadProductOptions = cached(async (): Promise<{ slug: string; name: string }[]> => {
  if (!db) return samplesAllowed() ? products.map((p) => ({ slug: p.slug, name: p.name })) : [];
  return db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(eq(schema.products.status, "published")).orderBy(asc(schema.products.name)).limit(300);
}, "product-options", ["products"]);

const MERCHANT_SLUG = sql`trim(both '-' from lower(regexp_replace(o.merchant, '[^a-zA-Z0-9]+', '-', 'g')))`;
const LIVE_OFFER = sql`o.is_active and (o.expires_at is null or o.expires_at > now()) and (m.id is null or m.is_active)`;
/** Store slugs that currently have at least one live offer on a published product. */
export const loadStoreSlugs = cached(async (): Promise<string[]> => {
  if (!db) return samplesAllowed() ? [...new Set(products.flatMap((p) => p.offers.map((o) => slugify(o.merchant))))] : [];
  const res = await db.execute(sql`select distinct coalesce(m.slug, ${MERCHANT_SLUG}) as s from offers o join products p on p.id = o.product_id left join merchants m on m.id = o.merchant_id where p.status = 'published' and ${LIVE_OFFER}`);
  return (res.rows as { s: string }[]).map((r) => r.s).filter(Boolean).sort();
}, "store-slugs", ["products"]);
export const loadMerchantName = cached(async (slug: string): Promise<string | undefined> => {
  if (!db) return samplesAllowed() ? products.flatMap((p) => p.offers).find((o) => slugify(o.merchant) === slug)?.merchant : undefined;
  const res = await db.execute(sql`select coalesce(m.name, o.merchant) as n from offers o join products p on p.id = o.product_id left join merchants m on m.id = o.merchant_id where p.status = 'published' and ${LIVE_OFFER} and coalesce(m.slug, ${MERCHANT_SLUG}) = ${slug} limit 1`);
  return (res.rows as { n: string }[])[0]?.n;
}, "merchant-name", ["products"]);

// ---- Search ---------------------------------------------------------------------------------------------------
const liveMin = sql`(select min(o.price) from offers o left join merchants m on m.id = o.merchant_id where o.product_id = p.id and ${LIVE_OFFER} and o.price > 0)`;
const effPrice = sql`coalesce(${liveMin}, p.price)`;
const strs = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

/** Postgres full-text search with filters, sorting and pagination. `categories` should already include sub-categories. */
const searchDb = cached(async (p: ReturnType<typeof normalizeSearch>): Promise<SearchResult<Product>> => {
  const { toTsQuery } = await import("@/lib/search-core");
  const tsq = toTsQuery(p.q), where = [sql`p.status = 'published'`];
  if (tsq) where.push(sql`p.search @@ to_tsquery('simple', ${tsq})`);
  if (p.categories?.length) where.push(sql`p.category in (${strs(p.categories)})`);
  if (p.brand) where.push(sql`p.brand = ${p.brand}`);
  if (p.merchant) where.push(sql`exists (select 1 from offers o left join merchants m on m.id = o.merchant_id where o.product_id = p.id and ${LIVE_OFFER} and coalesce(m.slug, ${MERCHANT_SLUG}) = ${p.merchant})`);
  if (p.min) where.push(sql`${effPrice} >= ${p.min}`);
  if (p.max) where.push(sql`${effPrice} <= ${p.max}`);
  const w = sql.join(where, sql` and `);
  const order: Record<Sort, ReturnType<typeof sql>> = {
    relevance: tsq ? sql`ts_rank(p.search, to_tsquery('simple', ${tsq})) desc, p.created_at desc` : sql`p.featured desc, p.created_at desc`,
    featured: sql`p.featured desc, p.created_at desc`, newest: sql`p.created_at desc`,
    "price-asc": sql`${effPrice} asc, p.created_at desc`, "price-desc": sql`${effPrice} desc, p.created_at desc`,
    saving: sql`coalesce((p.mrp - p.price)::float / nullif(p.mrp, 0), 0) desc, p.created_at desc`,
  };
  const total = Number(((await db!.execute(sql`select count(*)::int as n from products p where ${w}`)).rows as { n: number }[])[0]?.n ?? 0);
  const pages = pageCount(total, p.pageSize), page = Math.min(p.page, pages);
  if (!total) return { items: [], total: 0, page: 1, pages: 1, pageSize: p.pageSize };
  const ids = ((await db!.execute(sql`select p.id from products p where ${w} order by ${order[p.sort]}, p.id limit ${p.pageSize} offset ${(page - 1) * p.pageSize}`)).rows as { id: string }[]).map((r) => r.id);
  const prow = await db!.select().from(schema.products).where(inArray(schema.products.id, ids));
  const got = await hydrate(prow);
  const items = ids.flatMap((id) => { const slug = prow.find((r) => r.id === id)?.slug; const g = got.find((x) => x.slug === slug); return g ? [g] : []; });
  return { items, total, page, pages, pageSize: p.pageSize };
}, "search", ["products", "categories"]);

/** Category slug plus all of its descendants (so a parent category page lists its children's products). */
export function descendantSlugs(cats: { id?: string; slug: string; parentId?: string | null }[], slug: string): string[] {
  const root = cats.find((c) => c.slug === slug); if (!root?.id) return [slug];
  const out = [slug]; const queue = [root.id];
  for (let i = 0; i < queue.length && i < 200; i++) for (const c of cats) if (c.parentId === queue[i] && c.id && !queue.includes(c.id)) { queue.push(c.id); out.push(c.slug); }
  return out;
}
/** Parent chain from the top-level category down to `slug` (inclusive). */
export function categoryChain(cats: { id?: string; slug: string; label: string; parentId?: string | null }[], slug: string) {
  const chain: typeof cats = []; let cur = cats.find((c) => c.slug === slug);
  while (cur && chain.length < 10 && !chain.includes(cur)) { chain.unshift(cur); cur = cur.parentId ? cats.find((c) => c.id === cur!.parentId) : undefined; }
  return chain;
}

export async function searchProducts(raw: Parameters<typeof normalizeSearch>[0]): Promise<SearchResult<Product>> {
  const p = normalizeSearch(raw);
  if (p.categories) { const cats = await loadCategories(); p.categories = [...new Set(p.categories.flatMap((s) => descendantSlugs(cats, s)))]; }
  if (!db) return samplesAllowed() ? searchInMemory(products, p) : { items: [], total: 0, page: 1, pages: 1, pageSize: p.pageSize };
  return searchDb(p);
}

// ---- Everything else ------------------------------------------------------------------------------------------
export const loadDeals = cached(() => safe<Deal>(async () => (await db!.select().from(schema.deals)
  .where(and(eq(schema.deals.isActive, true), notExpired(schema.deals.expiresAt))).orderBy(desc(schema.deals.createdAt)))
  .map((r) => ({ slug: r.slug ?? r.id, title: r.title, merchant: r.merchant, offerId: r.id, ends: r.ends, description: r.description || undefined, expiresAt: iso(r.expiresAt) })), deals), "deals", ["deals"], 1800);
export const loadCoupons = cached(() => safe<Coupon>(async () => (await db!.select().from(schema.coupons)
  .where(and(eq(schema.coupons.isActive, true), notExpired(schema.coupons.expiresAt))).orderBy(desc(schema.coupons.createdAt)))
  .map((r) => ({ code: r.code, merchant: r.merchant, detail: r.detail, offerId: r.id, verifiedAt: iso(r.verifiedAt) })), coupons), "coupons", ["coupons"], 1800);
export const loadArticles = cached(() => safe<Article>(async () => (await db!.select().from(schema.articles).orderBy(desc(schema.articles.createdAt)))
  .map((r) => ({ slug: r.slug, title: r.title, excerpt: r.excerpt, date: r.date, body: r.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) })), articles), "articles", ["articles"]);

/** A followable outbound link, with everything /go/[id] needs to validate it. Never cached: it must reflect the database right now. */
export type ResolvedOffer = { id: string; merchant: string; merchantId: string | null; url: string; approvedDomains: string[] };

export async function resolveOffer(id: string): Promise<ResolvedOffer | undefined> {
  if (!db) { const s = samplesAllowed() ? findOffer(id) : undefined; return s && { id: s.id, merchant: s.merchant, url: s.url, merchantId: null, approvedDomains: [] }; }
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
export const loadBrands = cached(async (): Promise<Brand[]> => {
  if (!db) return samplesAllowed() ? brands : [];
  return (await db.select().from(schema.brands).orderBy(asc(schema.brands.name))).map((r) => ({ slug: r.slug, name: r.name, about: r.about }));
}, "brands", ["brands"]);

export type Category = { id?: string; parentId?: string | null; slug: string; label: string; icon: string; tone: string };
export const loadCategories = cached(async (): Promise<Category[]> => {
  if (!db) return samplesAllowed() ? [...categories] : [];
  return (await db.select().from(schema.categories).orderBy(asc(schema.categories.position))).map((r) => ({ id: r.id, parentId: r.parentId, slug: r.slug, label: r.label, icon: r.icon, tone: toneClass[r.tone] ?? toneClass.sand }));
}, "categories", ["categories"]);

export type Collection = { slug: string; title: string; description: string; productSlugs: string[] };
export const loadCollections = cached(() => safe<Collection>(async () => {
  const cs = await db!.select().from(schema.collections).orderBy(asc(schema.collections.position));
  const links = await db!.select({ cid: schema.collectionProducts.collectionId, slug: schema.products.slug }).from(schema.collectionProducts)
    .innerJoin(schema.products, and(eq(schema.products.id, schema.collectionProducts.productId), eq(schema.products.status, "published"))).orderBy(asc(schema.collectionProducts.position));
  return cs.map((c) => ({ slug: c.slug, title: c.title, description: c.description, productSlugs: links.filter((l) => l.cid === c.id).map((l) => l.slug) }));
}, []), "collections", ["collections", "products"]);

/** Retailers that currently have a live offer on a published product, for the homepage "stores" section. */
export const loadStores = cached(async (limit: number = 12): Promise<{ slug: string; name: string }[]> => {
  if (!db) return samplesAllowed() ? [...new Map(products.flatMap((p) => p.offers).map((o) => [slugify(o.merchant), { slug: slugify(o.merchant), name: o.merchant }] as const)).values()].slice(0, limit) : [];
  const res = await db.execute(sql`select coalesce(m.slug, ${MERCHANT_SLUG}) as slug, min(coalesce(m.name, o.merchant)) as name from offers o join products p on p.id = o.product_id left join merchants m on m.id = o.merchant_id where p.status = 'published' and ${LIVE_OFFER} group by 1 order by count(*) desc, 1 limit ${limit}`);
  return (res.rows as { slug: string; name: string }[]).filter((r) => r.slug);
}, "stores", ["products"], 21600);

/** A deal by address, including one that ended recently (so old links show "this deal has ended" instead of an error). */
export const loadDealBySlug = cached(async (slug: string): Promise<(Deal & { ended: boolean }) | undefined> => {
  if (!db) { const d = samplesAllowed() ? deals.find((x) => x.slug === slug) : undefined; return d && { ...d, ended: false }; }
  const [r] = await db.select().from(schema.deals).where(and(eq(schema.deals.isActive, true), or(eq(schema.deals.slug, slug), UUID.test(slug) ? eq(schema.deals.id, slug) : undefined)!));
  return r && { slug: r.slug ?? r.id, title: r.title, merchant: r.merchant, offerId: r.id, ends: r.ends, description: r.description || undefined, expiresAt: iso(r.expiresAt), ended: !!r.expiresAt && r.expiresAt.getTime() <= Date.now() };
}, "deal", ["deals"], 1800);

/** Product counts per brand for the brands index. */
export const loadBrandCounts = cached(async (): Promise<Record<string, number>> => {
  if (!db) return samplesAllowed() ? Object.fromEntries(brands.map((b) => [b.slug, products.filter((p) => p.brand === b.slug).length])) : {};
  const res = await db.execute(sql`select brand, count(*)::int as n from products where status = 'published' and brand <> '' group by brand`);
  return Object.fromEntries((res.rows as { brand: string; n: number }[]).map((r) => [r.brand, r.n]));
}, "brand-counts", ["products", "brands"], 21600);
