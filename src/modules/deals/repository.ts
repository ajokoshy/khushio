import { and, asc, desc, eq, ilike, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { affiliateLinks, categories, coupons, dealCategories, dealProducts, deals, merchants, products } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import {
  expiredDealCondition,
  liveDealCondition,
  liveOrSoonCouponCondition,
  liveOrSoonDealCondition,
  scheduledDealCondition,
} from "./conditions";
import type {
  CouponFilters,
  CouponRow,
  CouponWrite,
  DealFilters,
  DealRow,
  DealsPage,
  DealWrite,
  PublicCoupon,
  PublicDeal,
  PublicStandaloneCoupon,
} from "./types";

/** Repository: the only code in this module that talks to the database. */

/* ================================== admin: deals ================================== */

const dealColumns = {
  id: deals.id,
  slug: deals.slug,
  title: deals.title,
  merchantId: deals.merchantId,
  merchantName: merchants.name,
  merchantActive: merchants.isActive,
  type: deals.type,
  description: deals.description,
  affiliateLinkId: deals.affiliateLinkId,
  affiliateLinkSlug: affiliateLinks.slug,
  startsAt: deals.startsAt,
  endsAt: deals.endsAt,
  isFeatured: deals.isFeatured,
  sortOrder: deals.sortOrder,
  status: deals.status,
  productCount: sql<number>`(select count(*)::int from deal_products dp where dp.deal_id = ${deals.id})`,
  categoryCount: sql<number>`(select count(*)::int from deal_categories dc where dc.deal_id = ${deals.id})`,
  couponCount: sql<number>`(select count(*)::int from coupons c where c.deal_id = ${deals.id})`,
};

function dealQuery() {
  return db()
    .select(dealColumns)
    .from(deals)
    .innerJoin(merchants, eq(merchants.id, deals.merchantId))
    .leftJoin(affiliateLinks, eq(affiliateLinks.id, deals.affiliateLinkId));
}

function stateCondition(state: DealFilters["state"]): SQL | undefined {
  switch (state) {
    case "live": return liveDealCondition();
    case "scheduled": return scheduledDealCondition();
    case "expired": return expiredDealCondition();
    case "draft": return eq(deals.status, "draft");
    case "archived": return eq(deals.status, "archived");
    default: return undefined;
  }
}

/** The order visitors see: featured first, then the manual order, then newest start. */
export async function selectDeals(opts: DealFilters & { limit: number; offset: number }): Promise<DealRow[]> {
  const conditions: (SQL | undefined)[] = [stateCondition(opts.state)];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(deals.title, pattern), ilike(deals.slug, pattern)));
  }
  if (opts.merchantId) conditions.push(eq(deals.merchantId, opts.merchantId));
  return dealQuery()
    .where(and(...conditions))
    .orderBy(desc(deals.isFeatured), asc(deals.sortOrder), desc(deals.startsAt), asc(deals.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectDealById(id: string): Promise<DealRow | null> {
  const [row] = await dealQuery().where(eq(deals.id, id)).limit(1);
  return row ?? null;
}

export async function selectDealRefBySlug(slug: string): Promise<{ id: string; slug: string; title: string; merchantId: string } | null> {
  const [row] = await db().select({ id: deals.id, slug: deals.slug, title: deals.title, merchantId: deals.merchantId }).from(deals).where(eq(deals.slug, slug)).limit(1);
  return row ?? null;
}

export async function selectDealSlugsLike(base: string): Promise<string[]> {
  const rows = await db().select({ slug: deals.slug }).from(deals).where(or(eq(deals.slug, base), like(deals.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

export async function selectDealProducts(dealId: string): Promise<string[]> {
  const rows = await db().select({ slug: products.slug }).from(dealProducts).innerJoin(products, eq(products.id, dealProducts.productId)).where(eq(dealProducts.dealId, dealId)).orderBy(asc(products.slug));
  return rows.map((r) => r.slug);
}

export async function selectDealCategories(dealId: string): Promise<string[]> {
  const rows = await db().select({ slug: categories.slug }).from(dealCategories).innerJoin(categories, eq(categories.id, dealCategories.categoryId)).where(eq(dealCategories.dealId, dealId)).orderBy(asc(categories.slug));
  return rows.map((r) => r.slug);
}

/** A deal and the products and categories it applies to are saved as ONE unit. */
export async function insertDealGraph(id: string, values: DealWrite, productIds: readonly string[], categoryIds: readonly string[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [d.insert(deals).values({ id, ...values })];
    if (productIds.length > 0) statements.push(d.insert(dealProducts).values(productIds.map((productId) => ({ dealId: id, productId }))));
    if (categoryIds.length > 0) statements.push(d.insert(dealCategories).values(categoryIds.map((categoryId) => ({ dealId: id, categoryId }))));
    return statements;
  });
}

export async function updateDealGraph(id: string, values: DealWrite, productIds: readonly string[], categoryIds: readonly string[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [
      d.update(deals).set(values).where(eq(deals.id, id)),
      d.delete(dealProducts).where(eq(dealProducts.dealId, id)),
      d.delete(dealCategories).where(eq(dealCategories.dealId, id)),
    ];
    if (productIds.length > 0) statements.push(d.insert(dealProducts).values(productIds.map((productId) => ({ dealId: id, productId }))));
    if (categoryIds.length > 0) statements.push(d.insert(dealCategories).values(categoryIds.map((categoryId) => ({ dealId: id, categoryId }))));
    return statements;
  });
}

export async function deleteDealRow(id: string): Promise<void> {
  await db().delete(deals).where(eq(deals.id, id));
}

/* ---- bulk changes: each is ONE statement, so it is all or nothing ---- */

export async function setDealsFeatured(ids: readonly string[], featured: boolean): Promise<{ id: string; slug: string }[]> {
  return db().update(deals).set({ isFeatured: featured }).where(and(inArray(deals.id, [...ids]), eq(deals.isFeatured, !featured))).returning({ id: deals.id, slug: deals.slug });
}

/**
 * Ends the chosen published deals right now (the database clock). A deal that has not started yet is moved to "now" as
 * well, so its window never ends before it begins. Deals that are not published or have already ended are left alone.
 */
export async function expireDealsNow(ids: readonly string[]): Promise<{ id: string; slug: string }[]> {
  return db()
    .update(deals)
    .set({ endsAt: sql`now()`, startsAt: sql`least(${deals.startsAt}, now())` })
    .where(and(inArray(deals.id, [...ids]), eq(deals.status, "published"), sql`(${deals.endsAt} IS NULL OR ${deals.endsAt} > now())`))
    .returning({ id: deals.id, slug: deals.slug });
}

export async function archiveDeals(ids: readonly string[]): Promise<{ id: string; slug: string }[]> {
  return db().update(deals).set({ status: "archived" }).where(and(inArray(deals.id, [...ids]), sql`${deals.status} <> 'archived'`)).returning({ id: deals.id, slug: deals.slug });
}

/** Writes the manual order of the rows on one page, all together. */
export async function setSortOrders(pairs: readonly { id: string; sortOrder: number }[]): Promise<void> {
  if (pairs.length === 0) return;
  await runAtomically((d) => pairs.map((p) => d.update(deals).set({ sortOrder: p.sortOrder }).where(eq(deals.id, p.id))));
}

/* ================================== admin: coupons ================================== */

const couponColumns = {
  id: coupons.id,
  dealId: coupons.dealId,
  dealSlug: deals.slug,
  dealTitle: deals.title,
  merchantId: coupons.merchantId,
  merchantName: merchants.name,
  code: coupons.code,
  discountType: coupons.discountType,
  discountValue: coupons.discountValue,
  currency: coupons.currency,
  minSpendMinor: coupons.minSpendMinor,
  startsAt: coupons.startsAt,
  endsAt: coupons.endsAt,
  isActive: coupons.isActive,
};

const trimCurrency = (rows: CouponRow[]): CouponRow[] => rows.map((r) => ({ ...r, currency: r.currency.trim() }));

function couponQuery() {
  return db().select(couponColumns).from(coupons).innerJoin(merchants, eq(merchants.id, coupons.merchantId)).leftJoin(deals, eq(deals.id, coupons.dealId));
}

export async function selectCoupons(opts: CouponFilters & { limit: number; offset: number }): Promise<CouponRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(coupons.code, pattern), ilike(merchants.name, pattern), ilike(deals.title, pattern)));
  }
  if (opts.merchantId) conditions.push(eq(coupons.merchantId, opts.merchantId));
  const rows = await couponQuery().where(and(...conditions)).orderBy(desc(coupons.startsAt), asc(coupons.id)).limit(opts.limit).offset(opts.offset);
  return trimCurrency(rows);
}

export async function selectCouponById(id: string): Promise<CouponRow | null> {
  const rows = await couponQuery().where(eq(coupons.id, id)).limit(1);
  return trimCurrency(rows)[0] ?? null;
}

export async function insertCoupon(values: CouponWrite): Promise<{ id: string }> {
  const [row] = await db().insert(coupons).values(values).returning({ id: coupons.id });
  if (!row) throw new Error("Coupon insert returned no row");
  return row;
}

export async function updateCouponRow(id: string, values: CouponWrite): Promise<boolean> {
  const rows = await db().update(coupons).set(values).where(eq(coupons.id, id)).returning({ id: coupons.id });
  return rows.length > 0;
}

export async function deleteCouponRow(id: string): Promise<void> {
  await db().delete(coupons).where(eq(coupons.id, id));
}

/* ================================== public reads ================================== */

/**
 * What the public site shows. Every query here includes the live-or-starting-soon rule and the store being active,
 * and the service filters the result again with the clock at render time (see public.ts and window.ts).
 */

const publicDealColumns = {
  id: deals.id,
  slug: deals.slug,
  title: deals.title,
  type: deals.type,
  description: deals.description,
  merchantName: merchants.name,
  merchantSlug: merchants.slug,
  linkSlug: sql<string | null>`case when ${affiliateLinks.isActive} then ${affiliateLinks.slug} else null end`,
  startsAt: deals.startsAt,
  endsAt: deals.endsAt,
  isFeatured: deals.isFeatured,
  hasProducts: sql<boolean>`exists (select 1 from deal_products dp where dp.deal_id = ${deals.id})`,
  hasCategories: sql<boolean>`exists (select 1 from deal_categories dc where dc.deal_id = ${deals.id})`,
};

const iso = (d: Date) => d.toISOString();

function publicDealQuery(extra: SQL | undefined, limit: number) {
  return db()
    .select(publicDealColumns)
    .from(deals)
    .innerJoin(merchants, and(eq(merchants.id, deals.merchantId), eq(merchants.isActive, true)))
    .leftJoin(affiliateLinks, eq(affiliateLinks.id, deals.affiliateLinkId))
    .where(and(liveOrSoonDealCondition(), extra))
    .orderBy(desc(deals.isFeatured), asc(deals.sortOrder), desc(deals.startsAt), asc(deals.id))
    .limit(limit);
}

async function withCoupons(rows: Awaited<ReturnType<typeof publicDealQuery>>): Promise<PublicDeal[]> {
  const ids = rows.map((r) => r.id);
  const byDeal = new Map<string, PublicCoupon[]>();
  if (ids.length > 0) {
    const couponRows = await db()
      .select({ dealId: coupons.dealId, id: coupons.id, code: coupons.code, discountType: coupons.discountType, discountValue: coupons.discountValue, currency: coupons.currency, minSpendMinor: coupons.minSpendMinor, startsAt: coupons.startsAt, endsAt: coupons.endsAt })
      .from(coupons)
      .where(and(inArray(coupons.dealId, ids), liveOrSoonCouponCondition()))
      .orderBy(asc(coupons.startsAt), asc(coupons.id));
    for (const c of couponRows) {
      if (!c.dealId) continue;
      const list = byDeal.get(c.dealId) ?? [];
      list.push({ id: c.id, code: c.code, discountType: c.discountType, discountValue: c.discountValue, currency: c.currency.trim(), minSpendMinor: c.minSpendMinor, startsAt: iso(c.startsAt), endsAt: c.endsAt ? iso(c.endsAt) : null });
      byDeal.set(c.dealId, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    description: r.description,
    merchantName: r.merchantName,
    merchantSlug: r.merchantSlug,
    linkSlug: r.linkSlug,
    startsAt: iso(r.startsAt),
    endsAt: r.endsAt ? iso(r.endsAt) : null,
    isFeatured: r.isFeatured,
    scope: r.hasProducts ? "products" : r.hasCategories ? "categories" : "store",
    coupons: byDeal.get(r.id) ?? [],
  }));
}

export async function selectStandaloneCoupons(limit: number): Promise<PublicStandaloneCoupon[]> {
  const rows = await db()
    .select({ id: coupons.id, code: coupons.code, discountType: coupons.discountType, discountValue: coupons.discountValue, currency: coupons.currency, minSpendMinor: coupons.minSpendMinor, startsAt: coupons.startsAt, endsAt: coupons.endsAt, merchantName: merchants.name, merchantSlug: merchants.slug })
    .from(coupons)
    .innerJoin(merchants, and(eq(merchants.id, coupons.merchantId), eq(merchants.isActive, true)))
    .where(and(sql`${coupons.dealId} IS NULL`, liveOrSoonCouponCondition()))
    .orderBy(asc(merchants.name), asc(coupons.id))
    .limit(limit);
  return rows.map((c) => ({ id: c.id, code: c.code, discountType: c.discountType, discountValue: c.discountValue, currency: c.currency.trim(), minSpendMinor: c.minSpendMinor, startsAt: iso(c.startsAt), endsAt: c.endsAt ? iso(c.endsAt) : null, merchantName: c.merchantName, merchantSlug: c.merchantSlug }));
}

/** The /deals page: every live offer and every live stand-alone coupon. Capped, so a runaway import cannot make the page huge. */
export async function selectDealsPage(limit = 100): Promise<DealsPage> {
  const [rows, standalone] = await Promise.all([publicDealQuery(undefined, limit), selectStandaloneCoupons(50)]);
  return { deals: await withCoupons(rows), coupons: standalone };
}

/** A store page: every live offer of that store, whatever it is attached to. */
export async function selectDealsForMerchant(merchantId: string, limit = 20): Promise<PublicDeal[]> {
  return withCoupons(await publicDealQuery(eq(deals.merchantId, merchantId), limit));
}

/**
 * A product page: offers attached to the product, offers attached to one of its categories or their parents (an offer on
 * "Electronics" applies to a product in "Headphones"), and store-wide offers of the stores that sell this product.
 */
export async function selectDealsForProduct(productId: string, limit = 12): Promise<PublicDeal[]> {
  const scope = sql`(
    exists (select 1 from deal_products dp where dp.deal_id = ${deals.id} and dp.product_id = ${productId})
    or exists (
      select 1 from deal_categories dc where dc.deal_id = ${deals.id} and dc.category_id in (
        with recursive up(id) as (
          select pc.category_id from product_categories pc where pc.product_id = ${productId}
          union
          select c.parent_id from categories c join up on c.id = up.id where c.parent_id is not null
        ) select id from up
      )
    )
    or (
      not exists (select 1 from deal_products dp2 where dp2.deal_id = ${deals.id})
      and not exists (select 1 from deal_categories dc2 where dc2.deal_id = ${deals.id})
      and ${deals.merchantId} in (select al.merchant_id from affiliate_links al where al.product_id = ${productId} and al.is_active)
    )
  )`;
  return withCoupons(await publicDealQuery(scope, limit));
}
