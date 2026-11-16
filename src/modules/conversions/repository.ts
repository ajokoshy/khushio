import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { affiliateConversions, affiliateImportLogs, affiliateLinks, affiliateNetworks } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { ConversionFilters, ConversionRow, ConversionWrite } from "./types";

/** Repository: the only code in this module that talks to the database. */

const columns = {
  id: affiliateConversions.id,
  linkId: affiliateConversions.linkId,
  linkSlug: affiliateLinks.slug,
  networkId: affiliateConversions.networkId,
  networkName: affiliateNetworks.name,
  externalOrderId: affiliateConversions.externalOrderId,
  commissionMinor: affiliateConversions.commissionMinor,
  currency: affiliateConversions.currency,
  status: affiliateConversions.status,
  convertedAt: affiliateConversions.convertedAt,
};

function query() {
  return db()
    .select(columns)
    .from(affiliateConversions)
    .leftJoin(affiliateLinks, eq(affiliateLinks.id, affiliateConversions.linkId))
    .leftJoin(affiliateNetworks, eq(affiliateNetworks.id, affiliateConversions.networkId));
}

const clean = (rows: ConversionRow[]): ConversionRow[] => rows.map((r) => ({ ...r, currency: r.currency.trim() }));

/** Newest first. Uses conv_converted_at_idx for the ordering. */
export async function selectConversions(opts: ConversionFilters & { limit: number; offset: number }): Promise<ConversionRow[]> {
  const conditions: (SQL | undefined)[] = [];
  if (opts.q) {
    const pattern = `%${escapeLike(opts.q)}%`;
    conditions.push(or(ilike(affiliateConversions.externalOrderId, pattern), ilike(affiliateLinks.slug, pattern)));
  }
  if (opts.status) conditions.push(eq(affiliateConversions.status, opts.status));
  if (opts.networkId) conditions.push(eq(affiliateConversions.networkId, opts.networkId));
  const rows = await query().where(and(...conditions)).orderBy(desc(affiliateConversions.convertedAt), desc(affiliateConversions.id)).limit(opts.limit).offset(opts.offset);
  return clean(rows);
}

export async function selectConversionById(id: string): Promise<ConversionRow | null> {
  const rows = await query().where(eq(affiliateConversions.id, id)).limit(1);
  return clean(rows)[0] ?? null;
}

export async function insertConversion(values: ConversionWrite): Promise<{ id: string }> {
  const [row] = await db().insert(affiliateConversions).values(values).returning({ id: affiliateConversions.id });
  if (!row) throw new Error("Conversion insert returned no row");
  return row;
}

export async function updateConversionRow(id: string, values: Partial<ConversionWrite>): Promise<boolean> {
  const rows = await db().update(affiliateConversions).set(values).where(eq(affiliateConversions.id, id)).returning({ id: affiliateConversions.id });
  return rows.length > 0;
}

export async function deleteConversionRow(id: string): Promise<void> {
  await db().delete(affiliateConversions).where(eq(affiliateConversions.id, id));
}

/** Slug -> id for the links named in an import. Uses affiliate_links_slug_unique. */
export async function selectLinkIdsBySlugs(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await db().select({ id: affiliateLinks.id, slug: affiliateLinks.slug }).from(affiliateLinks).where(inArray(affiliateLinks.slug, slugs));
  return new Map(rows.map((r) => [r.slug, r.id]));
}

export async function selectLinkIdBySlug(slug: string): Promise<string | null> {
  return (await selectLinkIdsBySlugs([slug])).get(slug) ?? null;
}

/**
 * Inserts new orders and RECONCILES existing ones on (network_id, external_order_id), so importing the same report twice
 * changes nothing and a later report that moves an order from pending to approved updates it. Only a changed status,
 * commission or currency counts as an update; the original date stays; a link is added when the order had none.
 * Returns what was written: rows that were inserted, and rows that were updated. Unchanged rows are not returned.
 * One statement, so it is all-or-nothing. Callers must not pass the same (network, order) twice in one call.
 */
export async function upsertConversions(rows: ConversionWrite[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const written = await db()
    .insert(affiliateConversions)
    .values(rows)
    .onConflictDoUpdate({
      target: [affiliateConversions.networkId, affiliateConversions.externalOrderId],
      set: {
        status: sql`excluded.status`,
        commissionMinor: sql`excluded.commission_minor`,
        currency: sql`excluded.currency`,
        linkId: sql`coalesce(${affiliateConversions.linkId}, excluded.link_id)`,
      },
      setWhere: sql`(${affiliateConversions.status}, ${affiliateConversions.commissionMinor}, ${affiliateConversions.currency}) is distinct from (excluded.status, excluded.commission_minor, excluded.currency)`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  const inserted = written.filter((r) => r.inserted).length;
  return { inserted, updated: written.length - inserted };
}

export async function insertImportLog(values: { source: string; rowsProcessed: number; rowsFailed: number; startedAt: Date }): Promise<void> {
  await db().insert(affiliateImportLogs).values({ ...values, finishedAt: new Date() });
}
