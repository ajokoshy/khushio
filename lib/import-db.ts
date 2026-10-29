import { inArray } from "drizzle-orm";
import { approvedFor, checkDestination } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { loadCategories } from "@/lib/data/catalog";
import { db, schema } from "@/lib/db";
import { planImport, validateProductRows, type PlannedRow } from "@/lib/import";
import { slugify } from "@/lib/slug";

export type PlanItem = PlannedRow & { productId?: string; merchantSlug: string; merchantId?: string; blocked?: string };

/** Single source of truth for both the preview screen and the confirm step, so what you preview is what gets applied. */
export async function buildImportPlan(csv: string, allowUpdate: boolean) {
  const v = validateProductRows(csv, (await loadCategories()).map((c) => c.slug));
  if (!db || v.missingColumns.length || !v.rows.length) return { ...v, items: [] as PlanItem[] };
  const existing = await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.slug, v.rows.map((r) => r.slug)));
  const planned = planImport(v.rows, new Set(existing.map((e) => e.slug)), allowUpdate);
  const mslugs = [...new Set(planned.map((r) => slugify(r.merchant) || "store"))];
  const merchants = await db.select().from(schema.merchants).where(inArray(schema.merchants.slug, mslugs));
  const items: PlanItem[] = planned.map((r) => {
    const merchantSlug = slugify(r.merchant) || "store", m = merchants.find((x) => x.slug === merchantSlug);
    const chk = checkDestination(r.url, m ? approvedFor(m.approvedDomains, m.website) : [], strictDomains());
    const blocked = m && !m.isActive ? `merchant ${r.merchant} is inactive` : chk.ok ? undefined : `link is not allowed for ${r.merchant} (${chk.reason})`;
    return { ...r, merchantSlug, productId: existing.find((e) => e.slug === r.slug)?.id, merchantId: m?.id, blocked };
  });
  return { ...v, items };
}
