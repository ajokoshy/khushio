import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { affiliateLinks, merchants, products } from "@/core/database/schema";

/** Affiliate link reads and writes for CSV import (Release 5B). The only database access of affiliate/import.ts. */

export type ImportLinkRow = { id: string; slug: string; merchantId: string; productId: string | null; destinationUrl: string; trackingParams: string | null; isActive: boolean };

export async function selectLinksForImport(slugs: readonly string[]): Promise<ImportLinkRow[]> {
  if (slugs.length === 0) return [];
  return db().select({ id: affiliateLinks.id, slug: affiliateLinks.slug, merchantId: affiliateLinks.merchantId, productId: affiliateLinks.productId, destinationUrl: affiliateLinks.destinationUrl, trackingParams: affiliateLinks.trackingParams, isActive: affiliateLinks.isActive }).from(affiliateLinks).where(inArray(affiliateLinks.slug, [...slugs]));
}

export type LinkCreate = { slug: string; merchantId: string; productId: string | null; destinationUrl: string; trackingParams: string | null; isActive: boolean };
export type LinkUpdate = { id: string; merchantId: string; productId: string | null; destinationUrl: string; trackingParams: string | null; isActive: boolean; resetCheck: boolean };

export async function writeLinkBatch(creates: readonly LinkCreate[], updates: readonly LinkUpdate[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [];
    if (creates.length > 0) statements.push(d.insert(affiliateLinks).values([...creates]));
    for (const u of updates) {
      const { id, resetCheck, ...set } = u;
      statements.push(d.update(affiliateLinks).set({ ...set, ...(resetCheck ? { lastVerifiedAt: null } : {}) }).where(eq(affiliateLinks.id, id)));
    }
    return statements;
  });
}

export type LinkExportRow = { slug: string; merchantSlug: string; productSlug: string | null; destinationUrl: string; trackingParams: string | null; isActive: boolean };

export async function selectLinksForExport(limit: number, offset: number): Promise<LinkExportRow[]> {
  return db().select({ slug: affiliateLinks.slug, merchantSlug: merchants.slug, productSlug: products.slug, destinationUrl: affiliateLinks.destinationUrl, trackingParams: affiliateLinks.trackingParams, isActive: affiliateLinks.isActive })
    .from(affiliateLinks).innerJoin(merchants, eq(merchants.id, affiliateLinks.merchantId)).leftJoin(products, eq(products.id, affiliateLinks.productId)).orderBy(asc(affiliateLinks.slug)).limit(limit).offset(offset);
}
