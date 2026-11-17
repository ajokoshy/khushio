import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { affiliateLinks, categories, dealCategories, dealProducts, deals, merchants, products } from "@/core/database/schema";
import type { DealWrite } from "./types";

/** Deal reads and writes for CSV import (Release 5B). The only database access of deals/import.ts. */

export type ImportDeal = {
  id: string; slug: string; title: string; merchantId: string; type: string; description: string | null; affiliateLinkId: string | null;
  startsAt: Date; endsAt: Date | null; isFeatured: boolean; sortOrder: number; status: string; productSlugs: string[]; categorySlugs: string[];
};

export async function selectDealsForImport(slugs: readonly string[]): Promise<ImportDeal[]> {
  if (slugs.length === 0) return [];
  const rows = await db().select().from(deals).where(inArray(deals.slug, [...slugs]));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [p, c] = await Promise.all([
    db().select({ dealId: dealProducts.dealId, slug: products.slug }).from(dealProducts).innerJoin(products, eq(products.id, dealProducts.productId)).where(inArray(dealProducts.dealId, ids)),
    db().select({ dealId: dealCategories.dealId, slug: categories.slug }).from(dealCategories).innerJoin(categories, eq(categories.id, dealCategories.categoryId)).where(inArray(dealCategories.dealId, ids)),
  ]);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, merchantId: r.merchantId, type: r.type, description: r.description, affiliateLinkId: r.affiliateLinkId,
    startsAt: r.startsAt, endsAt: r.endsAt, isFeatured: r.isFeatured, sortOrder: r.sortOrder, status: r.status,
    productSlugs: p.filter((x) => x.dealId === r.id).map((x) => x.slug).sort(),
    categorySlugs: c.filter((x) => x.dealId === r.id).map((x) => x.slug).sort(),
  }));
}

export type DealBatchUnit = {
  id: string;
  isNew: boolean;
  values: DealWrite;
  /** Replace the attached products / categories when present. */
  productIds?: string[];
  categoryIds?: string[];
};

export async function writeDealBatch(units: readonly DealBatchUnit[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [];
    const created = units.filter((u) => u.isNew);
    if (created.length > 0) statements.push(d.insert(deals).values(created.map((u) => ({ id: u.id, ...u.values }))));
    for (const u of units) if (!u.isNew) statements.push(d.update(deals).set(u.values).where(eq(deals.id, u.id)));
    const withProducts = units.filter((u) => u.productIds !== undefined);
    if (withProducts.length > 0) {
      statements.push(d.delete(dealProducts).where(inArray(dealProducts.dealId, withProducts.map((u) => u.id))));
      const rows = withProducts.flatMap((u) => (u.productIds ?? []).map((productId) => ({ dealId: u.id, productId })));
      if (rows.length > 0) statements.push(d.insert(dealProducts).values(rows));
    }
    const withCategories = units.filter((u) => u.categoryIds !== undefined);
    if (withCategories.length > 0) {
      statements.push(d.delete(dealCategories).where(inArray(dealCategories.dealId, withCategories.map((u) => u.id))));
      const rows = withCategories.flatMap((u) => (u.categoryIds ?? []).map((categoryId) => ({ dealId: u.id, categoryId })));
      if (rows.length > 0) statements.push(d.insert(dealCategories).values(rows));
    }
    return statements;
  });
}

export type DealExportRow = { slug: string; title: string; merchantSlug: string; type: string; description: string | null; linkSlug: string | null; startsAt: Date; endsAt: Date | null; isFeatured: boolean; sortOrder: number; status: string; productSlugs: string[]; categorySlugs: string[] };

export async function selectDealsForExport(limit: number, offset: number): Promise<DealExportRow[]> {
  const rows = await db().select({ id: deals.id, slug: deals.slug, title: deals.title, merchantSlug: merchants.slug, type: deals.type, description: deals.description, linkSlug: affiliateLinks.slug, startsAt: deals.startsAt, endsAt: deals.endsAt, isFeatured: deals.isFeatured, sortOrder: deals.sortOrder, status: deals.status })
    .from(deals).innerJoin(merchants, eq(merchants.id, deals.merchantId)).leftJoin(affiliateLinks, eq(affiliateLinks.id, deals.affiliateLinkId)).orderBy(asc(deals.slug)).limit(limit).offset(offset);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [p, c] = await Promise.all([
    db().select({ dealId: dealProducts.dealId, slug: products.slug }).from(dealProducts).innerJoin(products, eq(products.id, dealProducts.productId)).where(inArray(dealProducts.dealId, ids)),
    db().select({ dealId: dealCategories.dealId, slug: categories.slug }).from(dealCategories).innerJoin(categories, eq(categories.id, dealCategories.categoryId)).where(inArray(dealCategories.dealId, ids)),
  ]);
  return rows.map(({ id, ...r }) => ({ ...r, productSlugs: p.filter((x) => x.dealId === id).map((x) => x.slug).sort(), categorySlugs: c.filter((x) => x.dealId === id).map((x) => x.slug).sort() }));
}
