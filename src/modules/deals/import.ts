import { revalidateTag } from "next/cache";
import { z } from "zod";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { parseFlexibleDate } from "@/core/validation/flexible-date";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/core/validation/slug";
import * as affiliate from "@/modules/affiliate/service";
import * as discover from "@/modules/discover/service";
import * as merchants from "@/modules/merchants/service";
import * as products from "@/modules/products/service";
import { given, readBool, readInt, splitList } from "@/modules/imports/values";
import type { ColumnSpec, EntityHandler, PlanUnit, RawRow, RowError } from "@/modules/imports/types";
import * as repo from "./import-repository";
import { DEAL_STATUSES, DEAL_TYPES, type DealStatus, type DealType } from "./types";
import { MAX_DEAL_CATEGORIES, MAX_DEAL_PRODUCTS } from "./validation";

/**
 * Deals CSV (Release 5B). A deal is matched by its slug (required: a made-up slug would create a duplicate on every
 * import). An empty cell never clears a value, so an existing deal keeps its dates, link and attachments unless the file
 * gives new ones. New deals start immediately when no start date is given, and are Drafts unless status says otherwise.
 */

export const DEAL_COLUMNS: readonly ColumnSpec[] = [
  { name: "slug", required: true, aliases: ["deal_slug", "id", "code"], help: "Identifies the deal.", example: "diwali-headphones" },
  { name: "title", required: true, aliases: ["name", "deal", "headline"], help: "Shown on the site.", example: "20% off headphones" },
  { name: "merchant", required: true, aliases: ["store", "merchant_slug", "store_slug"], help: "The slug of the store.", example: "amazon-india" },
  { name: "type", required: false, aliases: ["kind"], help: `One of ${DEAL_TYPES.join(", ")}. Default deal.`, example: "deal" },
  { name: "description", required: false, aliases: ["details", "terms"], help: "Up to 2,000 characters.", example: "Valid on selected models." },
  { name: "link", required: false, aliases: ["affiliate_link", "link_slug", "affiliate_link_slug"], help: "The slug of an affiliate link of the same store: the offer's button.", example: "amazon-sony-xm5" },
  { name: "starts_at", required: false, aliases: ["start", "start_date", "from", "starts"], help: "2026-11-01 or 01/11/2026 14:30 (India time). Empty: now.", example: "2026-11-01 09:00" },
  { name: "ends_at", required: false, aliases: ["end", "end_date", "to", "ends", "expires"], help: "Same formats. Empty: no end date.", example: "2026-11-05 23:59" },
  { name: "is_featured", required: false, aliases: ["featured"], help: "yes or no.", example: "yes" },
  { name: "sort_order", required: false, aliases: ["order", "position"], help: "0 to 9999. Lower comes first.", example: "0" },
  { name: "status", required: false, aliases: ["deal_status"], help: `One of ${DEAL_STATUSES.join(", ")}. Default draft for new deals.`, example: "published" },
  { name: "products", required: false, aliases: ["product_slugs", "product"], help: "Product slugs separated by | (replaces the list). Empty: store-wide or unchanged.", example: "sony-wh-1000xm5|sony-wf-1000xm5" },
  { name: "categories", required: false, aliases: ["category_slugs", "category"], help: "Category slugs separated by | (replaces the list).", example: "headphones" },
];

const rowSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, "slug is empty").max(SLUG_MAX_LENGTH, "slug is too long").refine((v) => SLUG_PATTERN.test(v), "slug may use lower-case letters, numbers and single hyphens only"),
  title: z.string().trim().min(1, "title is empty").max(120, "title is longer than 120 characters"),
  merchant: z.string().trim().toLowerCase().min(1, "merchant is empty").max(80, "merchant is too long"),
  type: z.string().trim().toLowerCase().refine((v) => v === "" || (DEAL_TYPES as readonly string[]).includes(v), `type must be one of ${DEAL_TYPES.join(", ")}`),
  description: z.string().trim().max(2000, "description is longer than 2,000 characters"),
  link: z.string().trim().toLowerCase().max(80, "link is too long"),
  starts_at: z.string().trim(),
  ends_at: z.string().trim(),
  is_featured: z.string(),
  sort_order: z.string(),
  status: z.string().trim().toLowerCase().refine((v) => v === "" || (DEAL_STATUSES as readonly string[]).includes(v), `status must be one of ${DEAL_STATUSES.join(", ")}`),
  products: z.string(),
  categories: z.string(),
});

type Parsed = {
  line: number; slug: string; title: string; merchant: string; type: DealType | null; description: string; link: string;
  startsAt: Date | null; endsAt: Date | null; featured: boolean | null; sortOrder: number | null; status: DealStatus | null;
  products: string[] | null; categories: string[] | null;
};

function parseRow(row: RawRow): { ok: true; value: Parsed } | { ok: false; error: string } {
  const r = rowSchema.safeParse(row.cells);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "invalid row" };
  const c = r.data;
  const featured = readBool(c.is_featured, "is_featured");
  if (!featured.ok) return featured;
  const order = readInt(c.sort_order, "sort_order", 0, 9999);
  if (!order.ok) return order;
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (c.starts_at) { const d = parseFlexibleDate(c.starts_at); if (!d.ok) return { ok: false, error: `starts_at: ${d.error}` }; startsAt = d.value; }
  if (c.ends_at) { const d = parseFlexibleDate(c.ends_at); if (!d.ok) return { ok: false, error: `ends_at: ${d.error}` }; endsAt = d.value; }
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: "ends_at must be after starts_at" };
  const productList = given(c.products) ? splitList(c.products).map((s) => s.toLowerCase()) : null;
  const categoryList = given(c.categories) ? splitList(c.categories).map((s) => s.toLowerCase()) : null;
  if (productList && (productList.length > MAX_DEAL_PRODUCTS || productList.some((s) => !SLUG_PATTERN.test(s)))) return { ok: false, error: `products: use up to ${MAX_DEAL_PRODUCTS} product slugs separated by |` };
  if (categoryList && (categoryList.length > MAX_DEAL_CATEGORIES || categoryList.some((s) => !SLUG_PATTERN.test(s)))) return { ok: false, error: `categories: use up to ${MAX_DEAL_CATEGORIES} category slugs separated by |` };
  return { ok: true, value: { line: row.line, slug: c.slug, title: c.title, merchant: c.merchant, type: (c.type || null) as DealType | null, description: c.description, link: c.link, startsAt, endsAt, featured: featured.value, sortOrder: order.value, status: (c.status || null) as DealStatus | null, products: productList, categories: categoryList } };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
/** Compared to the second: files carry no milliseconds. */
const ms = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

export const dealsHandler: EntityHandler = {
  entity: "deals",
  columns: DEAL_COLUMNS,

  async plan(rows) {
    const errors: RowError[] = [];
    const parsed: Parsed[] = [];
    const seen = new Map<string, number>();
    for (const row of rows) {
      const p = parseRow(row);
      if (!p.ok) { errors.push({ line: row.line, message: p.error }); continue; }
      if (seen.has(p.value.slug)) { errors.push({ line: row.line, message: `the slug "${p.value.slug}" is already used on line ${seen.get(p.value.slug)}` }); continue; }
      seen.set(p.value.slug, row.line);
      parsed.push(p.value);
    }

    const [existing, merchantMap, linkMap, productIds, categoryIds] = await Promise.all([
      repo.selectDealsForImport(parsed.map((p) => p.slug)),
      merchants.findMerchantsBySlugs([...new Set(parsed.map((p) => p.merchant))]),
      affiliate.findLinkRefsBySlugs([...new Set(parsed.map((p) => p.link).filter(Boolean))]),
      products.findProductIdsBySlugs([...new Set(parsed.flatMap((p) => p.products ?? []))]),
      discover.findCategoryIdsBySlugs([...new Set(parsed.flatMap((p) => p.categories ?? []))]),
    ]);
    const current = new Map(existing.map((d) => [d.slug, d] as const));

    const units: PlanUnit[] = [];
    for (const p of parsed) {
      const merchant = merchantMap.get(p.merchant);
      if (!merchant) { errors.push({ line: p.line, message: `the store "${p.merchant}" does not exist. Use the slug from the Merchants list.` }); continue; }
      let linkId: string | undefined;
      if (p.link) {
        const link = linkMap.get(p.link);
        if (!link) { errors.push({ line: p.line, message: `no affiliate link has the slug "${p.link}"` }); continue; }
        if (link.merchantId !== merchant.id) { errors.push({ line: p.line, message: `the link "${p.link}" belongs to a different store than "${p.merchant}"` }); continue; }
        linkId = link.id;
      }
      const missingProduct = (p.products ?? []).find((s) => !productIds.has(s));
      if (missingProduct) { errors.push({ line: p.line, message: `no product has the slug "${missingProduct}"` }); continue; }
      const missingCategory = (p.categories ?? []).find((s) => !categoryIds.has(s));
      if (missingCategory) { errors.push({ line: p.line, message: `no category has the slug "${missingCategory}"` }); continue; }
      const pIds = p.products ? p.products.map((s) => productIds.get(s) as string) : undefined;
      const cIds = p.categories ? p.categories.map((s) => categoryIds.get(s) as string) : undefined;

      const was = current.get(p.slug);
      if (!was) {
        if (!merchant.isActive) { errors.push({ line: p.line, message: `the store "${p.merchant}" is archived. Restore it before adding deals.` }); continue; }
        const startsAt = p.startsAt ?? new Date();
        if (p.endsAt && p.endsAt.getTime() <= startsAt.getTime()) { errors.push({ line: p.line, message: "ends_at must be after the start (which is now when starts_at is empty)" }); continue; }
        units.push({ lines: [p.line], action: "create", data: { id: crypto.randomUUID(), isNew: true, values: { slug: p.slug, title: p.title, merchantId: merchant.id, type: p.type ?? "deal", description: p.description || null, affiliateLinkId: linkId ?? null, startsAt, endsAt: p.endsAt, isFeatured: p.featured ?? false, sortOrder: p.sortOrder ?? 0, status: p.status ?? "draft" }, productIds: pIds, categoryIds: cIds } satisfies repo.DealBatchUnit });
        continue;
      }
      if (merchant.id !== was.merchantId && !merchant.isActive) { errors.push({ line: p.line, message: `the store "${p.merchant}" is archived. Restore it first.` }); continue; }
      const values = {
        slug: was.slug,
        title: p.title,
        merchantId: merchant.id,
        type: (p.type ?? was.type) as DealType,
        description: given(p.description) ? p.description : was.description,
        affiliateLinkId: linkId ?? was.affiliateLinkId,
        startsAt: p.startsAt ?? was.startsAt,
        endsAt: p.endsAt ?? was.endsAt,
        isFeatured: p.featured ?? was.isFeatured,
        sortOrder: p.sortOrder ?? was.sortOrder,
        status: (p.status ?? was.status) as DealStatus,
      };
      if (values.endsAt && values.endsAt.getTime() <= values.startsAt.getTime()) { errors.push({ line: p.line, message: "ends_at must be after starts_at" }); continue; }
      const listsChanged = (p.products !== null && !sameList(p.products, was.productSlugs)) || (p.categories !== null && !sameList(p.categories, was.categorySlugs));
      const changed = listsChanged || values.title !== was.title || values.merchantId !== was.merchantId || values.type !== was.type || values.description !== was.description || values.affiliateLinkId !== was.affiliateLinkId || ms(values.startsAt) !== ms(was.startsAt) || ms(values.endsAt) !== ms(was.endsAt) || values.isFeatured !== was.isFeatured || values.sortOrder !== was.sortOrder || values.status !== was.status;
      units.push({ lines: [p.line], action: changed ? "update" : "unchanged", data: { id: was.id, isNew: false, values, productIds: p.products !== null && !sameList(p.products, was.productSlugs) ? pIds : undefined, categoryIds: p.categories !== null && !sameList(p.categories, was.categorySlugs) ? cIds : undefined } satisfies repo.DealBatchUnit });
    }
    return { units, errors };
  },

  async apply(units, actorId) {
    const batch = units.map((u) => u.data as repo.DealBatchUnit);
    await repo.writeDealBatch(batch);
    revalidateTag(CACHE_TAGS.deals);
    await logAuditBestEffort({ actor: actorId, action: "deal.imported", entityType: "deal", entityId: null, metadata: { created: batch.filter((b) => b.isNew).length, updated: batch.filter((b) => !b.isNew).length } });
  },
};

export const parseDealRow = parseRow;

/** "2026-11-01T03:30:00Z": exact to the second and read back the same way by the importer. */
const utc = (d: Date | null) => (d ? `${d.toISOString().slice(0, 19)}Z` : "");

/** The deals CSV, same columns as the import template. */
export async function exportDealRows(limit: number, offset: number): Promise<{ rows: (string | number)[][]; more: boolean }> {
  const page = await repo.selectDealsForExport(limit + 1, offset);
  return { rows: page.slice(0, limit).map((d) => [d.slug, d.title, d.merchantSlug, d.type, d.description ?? "", d.linkSlug ?? "", utc(d.startsAt), utc(d.endsAt), d.isFeatured ? "yes" : "no", d.sortOrder, d.status, d.productSlugs.join("|"), d.categorySlugs.join("|")]), more: page.length > limit };
}
