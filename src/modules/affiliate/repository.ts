import { and, asc, count, desc, eq, ilike, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import {
  affiliateClickDaily,
  affiliateClicks,
  affiliateConversions,
  affiliateLinks,
  affiliateNetworks,
  merchantPrograms,
  merchants,
  products,
} from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type {
  LinkHistory,
  LinkRow,
  LinkWrite,
  MerchantOption,
  NetworkOption,
  NetworkRow,
  NetworkUsage,
  NetworkWrite,
  ProductRef,
  ProgramRow,
  ProgramWrite,
  StatusFilter,
} from "./types";

/** Repository: the only code in this module (apart from click-repository.ts) that talks to the database. */

type Page = { q?: string; status: StatusFilter; limit: number; offset: number };

// -------------------------------------------------------------------------------------------------------------------
// Networks
// -------------------------------------------------------------------------------------------------------------------

const networkColumns = { id: affiliateNetworks.id, key: affiliateNetworks.key, name: affiliateNetworks.name, isActive: affiliateNetworks.isActive };

export async function selectNetworks(opts: Page): Promise<NetworkRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(affiliateNetworks.name, pattern), ilike(affiliateNetworks.key, pattern)));
  }
  if (opts.status === "active") conditions.push(eq(affiliateNetworks.isActive, true));
  if (opts.status === "archived") conditions.push(eq(affiliateNetworks.isActive, false));
  return db()
    .select(networkColumns)
    .from(affiliateNetworks)
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${affiliateNetworks.name})`), asc(affiliateNetworks.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectNetworkById(id: string): Promise<NetworkRow | null> {
  const [row] = await db().select(networkColumns).from(affiliateNetworks).where(eq(affiliateNetworks.id, id)).limit(1);
  return row ?? null;
}

export async function selectNetworkByName(name: string): Promise<NetworkRow | null> {
  const [row] = await db().select(networkColumns).from(affiliateNetworks).where(sql`lower(${affiliateNetworks.name}) = lower(${name})`).limit(1);
  return row ?? null;
}

export async function selectNetworkKeysLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ key: affiliateNetworks.key })
    .from(affiliateNetworks)
    .where(or(eq(affiliateNetworks.key, base), like(affiliateNetworks.key, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.key);
}

export async function insertNetwork(values: NetworkWrite): Promise<NetworkRow> {
  const [row] = await db().insert(affiliateNetworks).values(values).returning(networkColumns);
  if (!row) throw new Error("Network insert returned no row");
  return row;
}

export async function updateNetworkRow(id: string, values: Partial<NetworkWrite>): Promise<NetworkRow | null> {
  const [row] = await db().update(affiliateNetworks).set(values).where(eq(affiliateNetworks.id, id)).returning(networkColumns);
  return row ?? null;
}

export async function deleteNetworkRow(id: string): Promise<void> {
  await db().delete(affiliateNetworks).where(eq(affiliateNetworks.id, id));
}

export async function selectNetworkUsage(id: string): Promise<NetworkUsage> {
  const [programs, conversions] = await Promise.all([
    db().select({ n: count() }).from(merchantPrograms).where(eq(merchantPrograms.networkId, id)),
    db().select({ n: count() }).from(affiliateConversions).where(eq(affiliateConversions.networkId, id)),
  ]);
  return { programs: Number(programs[0]?.n ?? 0), conversions: Number(conversions[0]?.n ?? 0) };
}

export async function selectNetworkOptions(): Promise<NetworkOption[]> {
  return db()
    .select({ id: affiliateNetworks.id, name: affiliateNetworks.name, isActive: affiliateNetworks.isActive })
    .from(affiliateNetworks)
    .orderBy(asc(sql`lower(${affiliateNetworks.name})`));
}

// -------------------------------------------------------------------------------------------------------------------
// Merchant programmes
// -------------------------------------------------------------------------------------------------------------------

const programColumns = {
  id: merchantPrograms.id,
  merchantId: merchantPrograms.merchantId,
  merchantName: merchants.name,
  networkId: merchantPrograms.networkId,
  networkName: affiliateNetworks.name,
  externalProgramId: merchantPrograms.externalProgramId,
  commissionNote: merchantPrograms.commissionNote,
  isActive: merchantPrograms.isActive,
};

export async function selectPrograms(opts: Page): Promise<ProgramRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(merchants.name, pattern), ilike(affiliateNetworks.name, pattern), ilike(merchantPrograms.externalProgramId, pattern)));
  }
  if (opts.status === "active") conditions.push(eq(merchantPrograms.isActive, true));
  if (opts.status === "archived") conditions.push(eq(merchantPrograms.isActive, false));
  return db()
    .select(programColumns)
    .from(merchantPrograms)
    .innerJoin(merchants, eq(merchants.id, merchantPrograms.merchantId))
    .innerJoin(affiliateNetworks, eq(affiliateNetworks.id, merchantPrograms.networkId))
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${merchants.name})`), asc(sql`lower(${affiliateNetworks.name})`), asc(merchantPrograms.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectProgramById(id: string): Promise<ProgramRow | null> {
  const [row] = await db()
    .select(programColumns)
    .from(merchantPrograms)
    .innerJoin(merchants, eq(merchants.id, merchantPrograms.merchantId))
    .innerJoin(affiliateNetworks, eq(affiliateNetworks.id, merchantPrograms.networkId))
    .where(eq(merchantPrograms.id, id))
    .limit(1);
  return row ?? null;
}

/** Uses programs_merchant_idx. */
export async function selectProgramForPair(merchantId: string, networkId: string): Promise<{ id: string } | null> {
  const [row] = await db()
    .select({ id: merchantPrograms.id })
    .from(merchantPrograms)
    .where(and(eq(merchantPrograms.merchantId, merchantId), eq(merchantPrograms.networkId, networkId)))
    .limit(1);
  return row ?? null;
}

export async function insertProgram(values: ProgramWrite): Promise<{ id: string }> {
  const [row] = await db().insert(merchantPrograms).values(values).returning({ id: merchantPrograms.id });
  if (!row) throw new Error("Programme insert returned no row");
  return row;
}

export async function updateProgramRow(id: string, values: Partial<ProgramWrite>): Promise<boolean> {
  const rows = await db().update(merchantPrograms).set(values).where(eq(merchantPrograms.id, id)).returning({ id: merchantPrograms.id });
  return rows.length > 0;
}

export async function deleteProgramRow(id: string): Promise<void> {
  await db().delete(merchantPrograms).where(eq(merchantPrograms.id, id));
}

// -------------------------------------------------------------------------------------------------------------------
// Affiliate links
// -------------------------------------------------------------------------------------------------------------------

const linkColumns = {
  id: affiliateLinks.id,
  slug: affiliateLinks.slug,
  destinationUrl: affiliateLinks.destinationUrl,
  trackingParams: affiliateLinks.trackingParams,
  isActive: affiliateLinks.isActive,
  lastVerifiedAt: affiliateLinks.lastVerifiedAt,
  merchantId: affiliateLinks.merchantId,
  merchantName: merchants.name,
  merchantActive: merchants.isActive,
  merchantDomains: merchants.allowedDomains,
  productId: affiliateLinks.productId,
  productName: products.name,
  productSlug: products.slug,
};

function linkQuery() {
  return db()
    .select(linkColumns)
    .from(affiliateLinks)
    .innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId))
    .leftJoin(products, eq(products.id, affiliateLinks.productId));
}

export async function selectLinks(opts: Page & { merchantId?: string }): Promise<LinkRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(affiliateLinks.slug, pattern), ilike(merchants.name, pattern), ilike(products.name, pattern), ilike(products.slug, pattern)));
  }
  if (opts.status === "active") conditions.push(eq(affiliateLinks.isActive, true));
  if (opts.status === "archived") conditions.push(eq(affiliateLinks.isActive, false));
  if (opts.merchantId) conditions.push(eq(affiliateLinks.merchantId, opts.merchantId));
  return linkQuery()
    .where(and(...conditions))
    .orderBy(desc(affiliateLinks.createdAt), asc(affiliateLinks.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectLinkById(id: string): Promise<LinkRow | null> {
  const [row] = await linkQuery().where(eq(affiliateLinks.id, id)).limit(1);
  return row ?? null;
}

/** Active links of active merchants, never-checked first, then the longest since the last check. */
export async function selectLinksToVerify(limit: number): Promise<LinkRow[]> {
  return linkQuery()
    .where(and(eq(affiliateLinks.isActive, true), eq(merchants.isActive, true)))
    .orderBy(sql`${affiliateLinks.lastVerifiedAt} asc nulls first`, asc(affiliateLinks.id))
    .limit(limit);
}

export async function selectLinkSlugsLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ slug: affiliateLinks.slug })
    .from(affiliateLinks)
    .where(or(eq(affiliateLinks.slug, base), like(affiliateLinks.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

export async function insertLink(values: LinkWrite): Promise<{ id: string; slug: string }> {
  const [row] = await db().insert(affiliateLinks).values(values).returning({ id: affiliateLinks.id, slug: affiliateLinks.slug });
  if (!row) throw new Error("Link insert returned no row");
  return row;
}

/** A changed destination or merchant resets the verification stamp: the old check no longer describes this link. */
export async function updateLinkRow(id: string, values: Partial<LinkWrite> & { lastVerifiedAt?: Date | null }): Promise<boolean> {
  const rows = await db().update(affiliateLinks).set(values).where(eq(affiliateLinks.id, id)).returning({ id: affiliateLinks.id });
  return rows.length > 0;
}

export async function deleteLinkRow(id: string): Promise<void> {
  await db().delete(affiliateLinks).where(eq(affiliateLinks.id, id));
}

/** Uses clicks_link_time_idx, click_daily_uq and a scan of the (small) conversions table. */
export async function selectLinkHistory(id: string): Promise<LinkHistory> {
  const [clicks, daily, conversions] = await Promise.all([
    db().select({ n: count() }).from(affiliateClicks).where(eq(affiliateClicks.linkId, id)),
    db().select({ n: count() }).from(affiliateClickDaily).where(eq(affiliateClickDaily.linkId, id)),
    db().select({ n: count() }).from(affiliateConversions).where(eq(affiliateConversions.linkId, id)),
  ]);
  return { clicks: Number(clicks[0]?.n ?? 0), dailyRows: Number(daily[0]?.n ?? 0), conversions: Number(conversions[0]?.n ?? 0) };
}

export async function selectMerchantOptions(): Promise<MerchantOption[]> {
  return db()
    .select({ id: merchants.id, name: merchants.name, isActive: merchants.isActive, allowedDomains: merchants.allowedDomains })
    .from(merchants)
    .orderBy(asc(sql`lower(${merchants.name})`));
}

export async function selectMerchantOptionById(id: string): Promise<MerchantOption | null> {
  const [row] = await db()
    .select({ id: merchants.id, name: merchants.name, isActive: merchants.isActive, allowedDomains: merchants.allowedDomains })
    .from(merchants)
    .where(eq(merchants.id, id))
    .limit(1);
  return row ?? null;
}

export async function selectProductRefBySlug(slug: string): Promise<ProductRef | null> {
  const [row] = await db().select({ id: products.id, slug: products.slug, name: products.name }).from(products).where(eq(products.slug, slug)).limit(1);
  return row ?? null;
}

export async function selectProductRefById(id: string): Promise<ProductRef | null> {
  const [row] = await db().select({ id: products.id, slug: products.slug, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

/** Links of one product, for the product's edit screen. Uses links_product_idx. */
export async function selectLinksForProduct(productId: string): Promise<LinkRow[]> {
  return linkQuery().where(eq(affiliateLinks.productId, productId)).orderBy(asc(sql`lower(${merchants.name})`), asc(affiliateLinks.slug));
}

export async function markLinkVerified(id: string, at: Date): Promise<void> {
  await db().update(affiliateLinks).set({ lastVerifiedAt: at }).where(eq(affiliateLinks.id, id));
}

export type LinkRef = { id: string; slug: string; merchantId: string; isActive: boolean };

/** Uses affiliate_links_slug_unique. */
export async function selectLinkRefsBySlugs(slugs: readonly string[]): Promise<LinkRef[]> {
  if (slugs.length === 0) return [];
  return db().select({ id: affiliateLinks.id, slug: affiliateLinks.slug, merchantId: affiliateLinks.merchantId, isActive: affiliateLinks.isActive }).from(affiliateLinks).where(inArray(affiliateLinks.slug, [...slugs]));
}
