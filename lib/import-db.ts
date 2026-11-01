import { inArray } from "drizzle-orm";
import { approvedFor, checkDestination } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { loadBrands, loadCategories } from "@/lib/data/catalog";
import { db, schema } from "@/lib/db";
import { validateProductRows, type ImportError } from "@/lib/import";
import { IMPORT_ROW_LIMIT, parseArticles, parseBrands, parseCategories, parseMerchants, parseOffers, type ImportKind } from "@/lib/import-kinds";
import { slugify } from "@/lib/slug";

export type Action = "create" | "update" | "skip-existing";
export type PlanItem = { kind: ImportKind; line: number; key: string; label: string; detail: string; action: Action; blocked?: string; data: any; refs: Record<string, string | undefined> };
export type ImportPlan = { kind: ImportKind; items: PlanItem[]; errors: ImportError[]; missingColumns: string[]; truncated: number };

const act = (exists: boolean, allowUpdate: boolean): Action => (!exists ? "create" : allowUpdate ? "update" : "skip-existing");
const inr = (n: number | null | undefined) => (n ? `₹${n}` : "");
const empty = (kind: ImportKind, v: { errors: ImportError[]; missingColumns: string[]; truncated: number }): ImportPlan => ({ kind, items: [], errors: v.errors, missingColumns: v.missingColumns, truncated: v.truncated });

/** Single source of truth for both the preview screen and the confirm step, so what you preview is what gets applied. */
export async function buildImportPlan(kind: ImportKind, csv: string, allowUpdate: boolean): Promise<ImportPlan> {
  const merchantCheck = (m: { approvedDomains: string; website: string; isActive: boolean } | undefined, name: string, url: string) => {
    const chk = checkDestination(url, m ? approvedFor(m.approvedDomains, m.website) : [], strictDomains());
    return m && !m.isActive ? `merchant ${name} is inactive` : chk.ok ? undefined : `link is not allowed for ${name} (${chk.reason})`;
  };
  const merchantsBySlug = async (names: string[]) => { const slugs = [...new Set(names.map((n) => slugify(n) || "store"))]; return slugs.length ? await db!.select().from(schema.merchants).where(inArray(schema.merchants.slug, slugs)) : []; };

  if (kind === "products") {
    const cats = await loadCategories(), brands = await loadBrands();
    const v = validateProductRows(csv, cats.map((c) => c.slug), IMPORT_ROW_LIMIT, brands.map((b) => b.slug));
    if (!db || v.missingColumns.length || !v.rows.length) return empty(kind, v);
    const existing = await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.slug, v.rows.map((r) => r.slug)));
    const merchants = await merchantsBySlug(v.rows.map((r) => r.merchant));
    const [bBy, cBy] = [Object.fromEntries((await db.select().from(schema.brands)).map((b) => [b.slug, b.id])), Object.fromEntries((await db.select().from(schema.categories)).map((c) => [c.slug, c.id]))];
    return { ...empty(kind, v), items: v.rows.map((r) => {
      const ms = slugify(r.merchant) || "store", m = merchants.find((x) => x.slug === ms), id = existing.find((e) => e.slug === r.slug)?.id;
      return { kind, line: r.line, key: r.slug, label: r.name, detail: `${r.merchant} · ${inr(r.price)}`, action: act(!!id, allowUpdate), blocked: merchantCheck(m, r.merchant, r.url), data: r,
        refs: { productId: id, merchantId: m?.id, merchantSlug: ms, brandId: r.brand ? bBy[r.brand] : undefined, categoryId: cBy[r.category] } };
    }) };
  }

  if (kind === "offers") {
    const v = parseOffers(csv);
    if (!db || v.missingColumns.length || !v.rows.length) return empty(kind, v);
    const prods = await db.select({ id: schema.products.id, slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(inArray(schema.products.slug, [...new Set(v.rows.map((r) => r.productSlug))]));
    const merchants = await merchantsBySlug(v.rows.map((r) => r.merchant));
    const offs = prods.length ? await db.select().from(schema.offers).where(inArray(schema.offers.productId, prods.map((p) => p.id))) : [];
    return { ...empty(kind, v), items: v.rows.map((r) => {
      const ms = slugify(r.merchant) || "store", m = merchants.find((x) => x.slug === ms), p = prods.find((x) => x.slug === r.productSlug);
      const o = p && offs.find((x) => x.productId === p.id && (m ? x.merchantId === m.id : slugify(x.merchant) === ms));
      return { kind, line: r.line, key: r.key, label: p?.name ?? r.productSlug, detail: `${r.merchant} · ${r.price ? inr(r.price) : "no price"}`, action: act(!!o, allowUpdate),
        blocked: !p ? `product "${r.productSlug}" does not exist` : merchantCheck(m, r.merchant, r.url), data: r, refs: { productId: p?.id, merchantId: m?.id, merchantSlug: ms, offerId: o?.id } };
    }) };
  }

  if (kind === "merchants" || kind === "brands" || kind === "categories" || kind === "articles") {
    const cats = kind === "categories" ? await db?.select().from(schema.categories) : undefined;
    const idOf = Object.fromEntries((cats ?? []).map((c) => [c.id, c.slug]));
    const v = kind === "merchants" ? parseMerchants(csv) : kind === "brands" ? parseBrands(csv) : kind === "articles" ? parseArticles(csv)
      : parseCategories(csv, { categoryParents: Object.fromEntries((cats ?? []).map((c) => [c.slug, c.parentId ? idOf[c.parentId] ?? null : null])) });
    if (!db || v.missingColumns.length || !v.rows.length) return empty(kind, v);
    const keys = v.rows.map((r) => r.slug ?? r.key);
    const t = kind === "merchants" ? schema.merchants : kind === "brands" ? schema.brands : kind === "categories" ? schema.categories : schema.articles;
    const have = await db.select({ id: t.id, slug: t.slug }).from(t).where(inArray(t.slug, keys));
    return { ...empty(kind, v), items: v.rows.map((r: any) => {
      const id = have.find((h) => h.slug === r.slug)?.id;
      const label = r.name ?? r.label ?? r.title;
      const detail = kind === "merchants" ? (r.approvedDomains || r.website || "") : kind === "categories" ? (r.parent ? `under ${r.parent}` : "top level") : kind === "articles" ? r.date : r.about.slice(0, 60);
      return { kind, line: r.line, key: r.slug, label, detail, action: act(!!id, allowUpdate), data: r, refs: { id } };
    }) };
  }
  throw new Error(`unknown import kind ${kind}`);
}
