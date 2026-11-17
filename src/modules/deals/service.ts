import { revalidateTag } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { NotFoundError, ValidationError } from "@/core/errors";
import { uniqueViolationOf } from "@/core/validation/slug";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import * as affiliate from "@/modules/affiliate/service";
import * as discover from "@/modules/discover/service";
import * as merchants from "@/modules/merchants/service";
import * as products from "@/modules/products/service";
import * as repo from "./repository";
import type { CouponFilters, CouponRow, DealFilters, DealRow, DealWrite } from "./types";
import type { CouponInput, DealInput } from "./validation";

/**
 * Admin rules for deals and coupons (Release 5A). Every write: validated input (by the caller), permission checked by
 * the server action, business rules here, one atomic write, an audit row, and revalidateTag("deals") so the public
 * pages refresh at once. Public reads are in public.ts.
 */

const touch = () => revalidateTag(CACHE_TAGS.deals);
const page = <T>(rows: T[], limit: number) => ({ rows: rows.slice(0, limit), hasNext: rows.length > limit });

/* ================================== deals ================================== */

export async function listDeals(opts: DealFilters & { limit: number; offset: number }) {
  return page(await repo.selectDeals({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getDeal(id: string): Promise<{ deal: DealRow; productSlugs: string[]; categorySlugs: string[] }> {
  const deal = await repo.selectDealById(id);
  if (!deal) throw new NotFoundError("Deal not found");
  const [productSlugs, categorySlugs] = await Promise.all([repo.selectDealProducts(id), repo.selectDealCategories(id)]);
  return { deal, productSlugs, categorySlugs };
}

function rethrowDealDuplicate(error: unknown): never {
  if (uniqueViolationOf(error)) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  throw error;
}

const missing = (wanted: readonly string[], found: ReadonlyMap<string, string>) => wanted.filter((s) => !found.has(s));

/** Store, link, products and categories of a deal form, checked against the database. */
async function resolveDealRefs(input: DealInput, current: DealRow | null) {
  const merchant = await merchants.findMerchant(input.merchantId);
  if (!merchant) throw new ValidationError("Unknown store", { merchantId: "Choose one of the listed stores." });
  if (!merchant.isActive && merchant.id !== current?.merchantId) throw new ValidationError("Store archived", { merchantId: "This store is archived. Restore it first or choose another." });

  let linkId: string | null = null;
  if (input.affiliateLinkSlug) {
    const link = await affiliate.findLinkRefBySlug(input.affiliateLinkSlug);
    if (!link) throw new ValidationError("Unknown link", { affiliateLinkSlug: "No affiliate link has this slug. Copy it from the links list, or leave the field empty." });
    if (link.merchantId !== merchant.id) throw new ValidationError("Link of another store", { affiliateLinkSlug: `This link belongs to a different store than ${merchant.name}.` });
    linkId = link.id;
  }

  const [productIds, categoryIds] = await Promise.all([products.findProductIdsBySlugs(input.productSlugs), discover.findCategoryIdsBySlugs(input.categorySlugs)]);
  const noProducts = missing(input.productSlugs, productIds);
  if (noProducts.length > 0) throw new ValidationError("Unknown products", { productSlugs: `No product has the slug: ${noProducts.slice(0, 5).join(", ")}${noProducts.length > 5 ? " ..." : ""}` });
  const noCategories = missing(input.categorySlugs, categoryIds);
  if (noCategories.length > 0) throw new ValidationError("Unknown categories", { categorySlugs: `No category has the slug: ${noCategories.slice(0, 5).join(", ")}${noCategories.length > 5 ? " ..." : ""}` });
  return { merchant, linkId, productIds: input.productSlugs.map((s) => productIds.get(s) as string), categoryIds: input.categorySlugs.map((s) => categoryIds.get(s) as string) };
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const when = (d: Date | null) => (d ? d.getTime() : null);

export async function createDeal(input: DealInput, actorId: string, now: Date = new Date()): Promise<{ id: string; slug: string }> {
  const { merchant, linkId, productIds, categoryIds } = await resolveDealRefs(input, null);
  const slug = await resolveCreateSlug({ name: input.title, explicit: input.slug, findTaken: repo.selectDealSlugsLike });
  const values: DealWrite = {
    slug,
    title: input.title,
    merchantId: merchant.id,
    type: input.type,
    description: input.description,
    affiliateLinkId: linkId,
    startsAt: input.startsAt ?? now,
    endsAt: input.endsAt,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
    status: input.status,
  };
  if (values.endsAt && values.endsAt.getTime() <= values.startsAt.getTime()) throw new ValidationError("Dates", { endsAt: "The end must be after the start" });

  const id = crypto.randomUUID();
  try {
    await repo.insertDealGraph(id, values, productIds, categoryIds);
  } catch (error) {
    rethrowDealDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "deal.created",
    entityType: "deal",
    entityId: id,
    metadata: { slug, title: input.title, merchant: merchant.name, status: input.status, startsAt: values.startsAt.toISOString(), endsAt: values.endsAt?.toISOString() ?? null, products: productIds.length, categories: categoryIds.length },
  });
  touch();
  return { id, slug };
}

export async function updateDeal(id: string, input: DealInput, actorId: string, now: Date = new Date()): Promise<void> {
  const { deal: current, productSlugs: currentProducts, categorySlugs: currentCategories } = await getDeal(id);
  const { merchant, linkId, productIds, categoryIds } = await resolveDealRefs(input, current);
  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectDealSlugsLike });

  const next: DealWrite = {
    slug,
    title: input.title,
    merchantId: merchant.id,
    type: input.type,
    description: input.description,
    affiliateLinkId: linkId,
    // An empty start keeps the existing one: an edit never silently moves a deal that is already running.
    startsAt: input.startsAt ?? current.startsAt ?? now,
    endsAt: input.endsAt,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
    status: input.status,
  };
  if (next.endsAt && next.endsAt.getTime() <= next.startsAt.getTime()) throw new ValidationError("Dates", { endsAt: "The end must be after the start" });

  const changed: string[] = [];
  if (next.slug !== current.slug) changed.push("slug");
  if (next.title !== current.title) changed.push("title");
  if (next.merchantId !== current.merchantId) changed.push("merchant");
  if (next.type !== current.type) changed.push("type");
  if (next.description !== current.description) changed.push("description");
  if (next.affiliateLinkId !== current.affiliateLinkId) changed.push("link");
  if (when(next.startsAt) !== when(current.startsAt)) changed.push("startsAt");
  if (when(next.endsAt) !== when(current.endsAt)) changed.push("endsAt");
  if (next.isFeatured !== current.isFeatured) changed.push("featured");
  if (next.sortOrder !== current.sortOrder) changed.push("sortOrder");
  if (next.status !== current.status) changed.push("status");
  if (!same([...input.productSlugs].sort(), [...currentProducts].sort())) changed.push("products");
  if (!same([...input.categorySlugs].sort(), [...currentCategories].sort())) changed.push("categories");
  if (changed.length === 0) return;

  try {
    await repo.updateDealGraph(id, next, productIds, categoryIds);
  } catch (error) {
    rethrowDealDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actorId,
    action: "deal.updated",
    entityType: "deal",
    entityId: id,
    metadata: { changed, ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}), ...(next.status !== current.status ? { status: { from: current.status, to: next.status } } : {}) },
  });
  touch();
}

export async function deleteDeal(id: string, actorId: string): Promise<void> {
  const current = await repo.selectDealById(id);
  if (!current) throw new NotFoundError("Deal not found");
  await repo.deleteDealRow(id);
  await logAuditBestEffort({ actor: actorId, action: "deal.deleted", entityType: "deal", entityId: id, metadata: { slug: current.slug, title: current.title, coupons: current.couponCount } });
  touch();
}

/* ---- bulk changes on the list: each one audited as a single row naming the deals it touched ---- */

async function bulkAudit(action: string, actorId: string, changed: { id: string; slug: string }[], asked: number) {
  if (changed.length > 0) await logAuditBestEffort({ actor: actorId, action, entityType: "deal", entityId: null, metadata: { count: changed.length, asked, slugs: changed.slice(0, 50).map((d) => d.slug) } });
  touch();
  return changed.length;
}

export async function setFeatured(ids: readonly string[], featured: boolean, actorId: string): Promise<number> {
  return bulkAudit(featured ? "deal.featured" : "deal.unfeatured", actorId, await repo.setDealsFeatured(ids, featured), ids.length);
}

/** Ends the chosen published deals now. Draft, archived and already ended deals are left as they are. */
export async function expireNow(ids: readonly string[], actorId: string): Promise<number> {
  return bulkAudit("deal.expired", actorId, await repo.expireDealsNow(ids), ids.length);
}

export async function archiveMany(ids: readonly string[], actorId: string): Promise<number> {
  return bulkAudit("deal.archived", actorId, await repo.archiveDeals(ids), ids.length);
}

/** The manual order typed on the list page (0 to 9999 for each deal shown). */
export async function saveOrder(pairs: readonly { id: string; sortOrder: number }[], actorId: string): Promise<number> {
  if (pairs.some((p) => !Number.isInteger(p.sortOrder) || p.sortOrder < 0 || p.sortOrder > 9999)) throw new ValidationError("Order", { order: "Use whole numbers from 0 to 9999." });
  await repo.setSortOrders(pairs);
  await logAuditBestEffort({ actor: actorId, action: "deal.reordered", entityType: "deal", entityId: null, metadata: { count: pairs.length } });
  touch();
  return pairs.length;
}

/* ================================== coupons ================================== */

export async function listCoupons(opts: CouponFilters & { limit: number; offset: number }) {
  return page(await repo.selectCoupons({ ...opts, limit: opts.limit + 1 }), opts.limit);
}

export async function getCoupon(id: string): Promise<CouponRow> {
  const coupon = await repo.selectCouponById(id);
  if (!coupon) throw new NotFoundError("Coupon not found");
  return coupon;
}

function rethrowCouponDuplicate(error: unknown): never {
  if (uniqueViolationOf(error)) throw new ValidationError("Duplicate code", { code: "This store already has a coupon with this code. Open it and change its dates instead." });
  throw error;
}

async function resolveCouponRefs(input: CouponInput, current: CouponRow | null) {
  const merchant = await merchants.findMerchant(input.merchantId);
  if (!merchant) throw new ValidationError("Unknown store", { merchantId: "Choose one of the listed stores." });
  if (!merchant.isActive && merchant.id !== current?.merchantId) throw new ValidationError("Store archived", { merchantId: "This store is archived. Restore it first or choose another." });
  let dealId: string | null = null;
  if (input.dealSlug) {
    const deal = await repo.selectDealRefBySlug(input.dealSlug);
    if (!deal) throw new ValidationError("Unknown deal", { dealSlug: "No deal has this slug. Copy it from the deals list, or leave the field empty for a stand-alone coupon." });
    if (deal.merchantId !== merchant.id) throw new ValidationError("Deal of another store", { dealSlug: `This deal belongs to a different store than ${merchant.name}.` });
    dealId = deal.id;
  }
  return { merchant, dealId };
}

export async function createCoupon(input: CouponInput, actorId: string, now: Date = new Date()): Promise<{ id: string }> {
  const { merchant, dealId } = await resolveCouponRefs(input, null);
  const startsAt = input.startsAt ?? now;
  if (input.endsAt && input.endsAt.getTime() <= startsAt.getTime()) throw new ValidationError("Dates", { endsAt: "The end must be after the start" });
  let created: { id: string };
  try {
    created = await repo.insertCoupon({ dealId, merchantId: merchant.id, code: input.code, discountType: input.discountType, discountValue: input.discountValue, currency: input.currency, minSpendMinor: input.minSpendMinor, startsAt, endsAt: input.endsAt, isActive: input.isActive });
  } catch (error) {
    rethrowCouponDuplicate(error);
  }
  await logAuditBestEffort({ actor: actorId, action: "coupon.created", entityType: "coupon", entityId: created.id, metadata: { code: input.code, merchant: merchant.name, deal: input.dealSlug, type: input.discountType, endsAt: input.endsAt?.toISOString() ?? null } });
  touch();
  return created;
}

export async function updateCoupon(id: string, input: CouponInput, actorId: string, now: Date = new Date()): Promise<void> {
  const current = await getCoupon(id);
  const { merchant, dealId } = await resolveCouponRefs(input, current);
  const startsAt = input.startsAt ?? current.startsAt ?? now;
  if (input.endsAt && input.endsAt.getTime() <= startsAt.getTime()) throw new ValidationError("Dates", { endsAt: "The end must be after the start" });
  const next = { dealId, merchantId: merchant.id, code: input.code, discountType: input.discountType, discountValue: input.discountValue, currency: input.currency, minSpendMinor: input.minSpendMinor, startsAt, endsAt: input.endsAt, isActive: input.isActive };

  const changed: string[] = [];
  if (next.dealId !== current.dealId) changed.push("deal");
  if (next.merchantId !== current.merchantId) changed.push("merchant");
  if (next.code !== current.code) changed.push("code");
  if (next.discountType !== current.discountType) changed.push("discountType");
  if (next.discountValue !== current.discountValue) changed.push("discountValue");
  if (next.currency !== current.currency) changed.push("currency");
  if (next.minSpendMinor !== current.minSpendMinor) changed.push("minSpend");
  if (when(next.startsAt) !== when(current.startsAt)) changed.push("startsAt");
  if (when(next.endsAt) !== when(current.endsAt)) changed.push("endsAt");
  if (next.isActive !== current.isActive) changed.push("active");
  if (changed.length === 0) return;

  try {
    if (!(await repo.updateCouponRow(id, next))) throw new NotFoundError("Coupon not found");
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    rethrowCouponDuplicate(error);
  }
  await logAuditBestEffort({ actor: actorId, action: "coupon.updated", entityType: "coupon", entityId: id, metadata: { changed, code: input.code } });
  touch();
}

export async function deleteCoupon(id: string, actorId: string): Promise<void> {
  const current = await getCoupon(id);
  await repo.deleteCouponRow(id);
  await logAuditBestEffort({ actor: actorId, action: "coupon.deleted", entityType: "coupon", entityId: id, metadata: { code: current.code, merchant: current.merchantName } });
  touch();
}
