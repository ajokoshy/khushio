import { revalidateTag } from "next/cache";
import { z } from "zod";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/core/validation/slug";
import * as merchants from "@/modules/merchants/service";
import * as products from "@/modules/products/service";
import { given, readBool } from "@/modules/imports/values";
import type { ColumnSpec, EntityHandler, PlanUnit, RawRow, RowError } from "@/modules/imports/types";
import { checkDestination, MAX_TRACKING_LENGTH, parseTrackingParams } from "./destination";
import * as repo from "./import-repository";

/**
 * Affiliate links CSV (Release 5B). A link is matched by its slug, which is required here (a made-up slug would create a
 * duplicate on every import). The destination goes through the SAME check as the link form: https only, and the host must
 * be one of the store's allowed domains, so an import can never create a link that /go would refuse to follow.
 */

export const LINK_COLUMNS: readonly ColumnSpec[] = [
  { name: "slug", required: true, aliases: ["link_slug", "id", "code"], help: "Identifies the link: the address is /go/<slug>.", example: "amazon-sony-xm5" },
  { name: "merchant", required: true, aliases: ["store", "merchant_slug", "store_slug"], help: "The slug of the store.", example: "amazon-india" },
  { name: "product", required: false, aliases: ["product_slug"], help: "The slug of the product this link buys. Empty: a store link.", example: "sony-wh-1000xm5" },
  { name: "destination_url", required: true, aliases: ["destination", "url", "link", "affiliate_url"], help: "A full https:// address on one of the store's allowed domains.", example: "https://www.amazon.in/dp/B09XS7JWHH" },
  { name: "tracking_params", required: false, aliases: ["tracking", "params", "query"], help: "Extra query parameters, such as tag=khushio-21&ref=x.", example: "tag=khushio-21" },
  { name: "is_active", required: false, aliases: ["active", "enabled"], help: "yes or no. Default yes.", example: "yes" },
];

const rowSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, "slug is empty").max(SLUG_MAX_LENGTH, "slug is too long").refine((v) => SLUG_PATTERN.test(v), "slug may use lower-case letters, numbers and single hyphens only"),
  merchant: z.string().trim().toLowerCase().min(1, "merchant is empty").max(80, "merchant is too long"),
  product: z.string().trim().toLowerCase().max(80, "product is too long"),
  destination_url: z.string().trim().min(1, "destination_url is empty"),
  tracking_params: z.string().trim().max(MAX_TRACKING_LENGTH, `tracking_params is longer than ${MAX_TRACKING_LENGTH} characters`),
  is_active: z.string(),
});

export const linksHandler: EntityHandler = {
  entity: "links",
  columns: LINK_COLUMNS,

  async plan(rows: RawRow[]) {
    const errors: RowError[] = [];
    const parsed: { line: number; slug: string; merchant: string; product: string; url: string; tracking: string; active: boolean | null }[] = [];
    const seen = new Map<string, number>();
    for (const row of rows) {
      const r = rowSchema.safeParse(row.cells);
      if (!r.success) { errors.push({ line: row.line, message: r.error.issues[0]?.message ?? "invalid row" }); continue; }
      const active = readBool(r.data.is_active, "is_active");
      if (!active.ok) { errors.push({ line: row.line, message: active.error }); continue; }
      if (seen.has(r.data.slug)) { errors.push({ line: row.line, message: `the slug "${r.data.slug}" is already used on line ${seen.get(r.data.slug)}` }); continue; }
      seen.set(r.data.slug, row.line);
      parsed.push({ line: row.line, slug: r.data.slug, merchant: r.data.merchant, product: r.data.product, url: r.data.destination_url, tracking: r.data.tracking_params, active: active.value });
    }

    const [existing, merchantMap, productIds] = await Promise.all([
      repo.selectLinksForImport(parsed.map((p) => p.slug)),
      merchants.findMerchantsBySlugs([...new Set(parsed.map((p) => p.merchant))]),
      products.findProductIdsBySlugs([...new Set(parsed.map((p) => p.product).filter(Boolean))]),
    ]);
    const current = new Map(existing.map((l) => [l.slug, l] as const));

    const units: PlanUnit[] = [];
    for (const p of parsed) {
      const merchant = merchantMap.get(p.merchant);
      if (!merchant) { errors.push({ line: p.line, message: `the store "${p.merchant}" does not exist. Use the slug from the Merchants list.` }); continue; }
      let productId: string | null | undefined;
      if (p.product) {
        productId = productIds.get(p.product);
        if (!productId) { errors.push({ line: p.line, message: `no product has the slug "${p.product}"` }); continue; }
      }
      const checked = checkDestination(p.url, merchant.allowedDomains);
      if (!checked.ok) { errors.push({ line: p.line, message: `destination_url: ${checked.message}` }); continue; }
      let tracking: string | null | undefined;
      if (given(p.tracking)) {
        const t = parseTrackingParams(p.tracking);
        if (!t.ok) { errors.push({ line: p.line, message: `tracking_params: ${t.error}` }); continue; }
        tracking = t.value;
      }
      const destination = checked.url.href;
      const was = current.get(p.slug);
      if (!was) {
        if (!merchant.isActive) { errors.push({ line: p.line, message: `the store "${p.merchant}" is archived. Restore it before adding links.` }); continue; }
        units.push({ lines: [p.line], action: "create", data: { slug: p.slug, merchantId: merchant.id, productId: productId ?? null, destinationUrl: destination, trackingParams: tracking ?? null, isActive: p.active ?? true } satisfies repo.LinkCreate });
        continue;
      }
      if (merchant.id !== was.merchantId && !merchant.isActive) { errors.push({ line: p.line, message: `the store "${p.merchant}" is archived. Restore it first.` }); continue; }
      const next = { id: was.id, merchantId: merchant.id, productId: productId ?? was.productId, destinationUrl: destination, trackingParams: tracking === undefined ? was.trackingParams : tracking, isActive: p.active ?? was.isActive };
      const stale = next.destinationUrl !== was.destinationUrl || next.merchantId !== was.merchantId;
      const changed = stale || next.productId !== was.productId || next.trackingParams !== was.trackingParams || next.isActive !== was.isActive;
      units.push({ lines: [p.line], action: changed ? "update" : "unchanged", data: { ...next, resetCheck: stale } satisfies repo.LinkUpdate });
    }
    return { units, errors };
  },

  async apply(units, actorId) {
    const creates = units.filter((u) => u.action === "create").map((u) => u.data as repo.LinkCreate);
    const updates = units.filter((u) => u.action === "update").map((u) => u.data as repo.LinkUpdate);
    await repo.writeLinkBatch(creates, updates);
    revalidateTag(CACHE_TAGS.products);
    revalidateTag(CACHE_TAGS.dashboard);
    revalidateTag(CACHE_TAGS.deals);
    await logAuditBestEffort({ actor: actorId, action: "affiliate_link.imported", entityType: "affiliate_link", entityId: null, metadata: { created: creates.length, updated: updates.length } });
  },
};

/** The links CSV, same columns as the import template. */
export async function exportLinkRows(limit: number, offset: number): Promise<{ rows: string[][]; more: boolean }> {
  const page = await repo.selectLinksForExport(limit + 1, offset);
  return { rows: page.slice(0, limit).map((l) => [l.slug, l.merchantSlug, l.productSlug ?? "", l.destinationUrl, l.trackingParams ?? "", l.isActive ? "yes" : "no"]), more: page.length > limit };
}
