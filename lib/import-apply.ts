import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { PlanItem } from "@/lib/import-db";
import type { ImportKind } from "@/lib/import-kinds";

/** Merchants created earlier in this import (slug -> id), shared across chunks so a new merchant is created once. */
export type ImportState = { merchants: Map<string, string>; counts: { created: number; updated: number } };
export const newState = (): ImportState => ({ merchants: new Map(), counts: { created: 0, updated: 0 } });

/** Parents before children, so a chunk boundary can never separate a child from a parent that does not exist yet. */
export function orderForImport(kind: ImportKind, items: PlanItem[]): PlanItem[] {
  if (kind !== "categories") return items;
  const parent = new Map(items.map((i) => [i.key, i.data.parent as string]));
  const depth = (k: string): number => { let d = 0, cur = parent.get(k); while (cur && parent.has(cur) && d < 50) { d++; cur = parent.get(cur); } return d; };
  return [...items].sort((a, b) => depth(a.key) - depth(b.key));
}

/** Builds the SQL statements for one chunk. The caller runs them in a single atomic batch. */
export async function buildStatements(kind: ImportKind, items: PlanItem[], st: ImportState): Promise<unknown[]> {
  const d = db!, out: unknown[] = [], now = new Date();
  const count = (it: PlanItem) => { if (it.action === "update") st.counts.updated++; else st.counts.created++; };
  const merchantId = (it: PlanItem) => it.refs.merchantId ?? st.merchants.get(it.refs.merchantSlug!);
  const ensureMerchants = () => {
    const fresh = new Map<string, string>();
    for (const it of items) if (!it.refs.merchantId && !st.merchants.has(it.refs.merchantSlug!) && !fresh.has(it.refs.merchantSlug!)) fresh.set(it.refs.merchantSlug!, it.data.merchant);
    if (fresh.size) { const rows = [...fresh].map(([slug, name]) => ({ id: randomUUID(), slug, name })); rows.forEach((r) => st.merchants.set(r.slug, r.id)); out.push(d.insert(schema.merchants).values(rows).onConflictDoNothing()); }
  };

  if (kind === "products") {
    ensureMerchants();
    const existing = items.filter((i) => i.refs.productId).map((i) => i.refs.productId!);
    const offs = existing.length ? await d.select().from(schema.offers).where(inArray(schema.offers.productId, existing)) : [];
    for (const it of items) {
      const r = it.data, mid = merchantId(it)!, f = { slug: r.slug, name: r.name, brand: r.brand, category: r.category, blurb: r.blurb, price: r.price, mrp: r.mrp, status: r.status, brandId: it.refs.brandId ?? null, categoryId: it.refs.categoryId ?? null };
      const priceFields = { price: r.price as number, mrp: r.mrp as number | null, priceCheckedAt: null };
      if (it.refs.productId) {
        out.push(d.update(schema.products).set({ ...f, updatedAt: now }).where(eq(schema.products.id, it.refs.productId)));
        const o = offs.find((x) => x.productId === it.refs.productId && x.merchantId === mid);
        out.push(o ? d.update(schema.offers).set({ url: r.url, merchant: r.merchant, isActive: true, ...priceFields }).where(eq(schema.offers.id, o.id)) : d.insert(schema.offers).values({ productId: it.refs.productId, merchant: r.merchant, merchantId: mid, url: r.url, ...priceFields }));
      } else {
        const pid = randomUUID();
        out.push(d.insert(schema.products).values({ id: pid, ...f }), d.insert(schema.offers).values({ productId: pid, merchant: r.merchant, merchantId: mid, url: r.url, ...priceFields }));
      }
      count(it);
    }
  } else if (kind === "offers") {
    ensureMerchants();
    for (const it of items) {
      const r = it.data, mid = merchantId(it)!;
      const priceFields = r.price !== null ? { price: r.price as number, mrp: r.mrp as number | null, priceCheckedAt: r.priceChecked ? now : null } : {};
      const v = { merchant: r.merchant, merchantId: mid, url: r.url, isActive: r.isActive as boolean, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null, ...priceFields };
      out.push(it.refs.offerId ? d.update(schema.offers).set(v).where(and(eq(schema.offers.id, it.refs.offerId), eq(schema.offers.productId, it.refs.productId!))) : d.insert(schema.offers).values({ productId: it.refs.productId!, ...v }));
      out.push(d.update(schema.products).set({ updatedAt: now }).where(eq(schema.products.id, it.refs.productId!)));
      count(it);
    }
  } else if (kind === "merchants") {
    for (const it of items) { const r = it.data, v = { name: r.name, website: r.website, approvedDomains: r.approvedDomains, isActive: r.isActive };
      out.push(it.refs.id ? d.update(schema.merchants).set(v).where(eq(schema.merchants.id, it.refs.id)) : d.insert(schema.merchants).values({ slug: r.slug, ...v })); count(it); }
  } else if (kind === "brands") {
    for (const it of items) { const r = it.data, v = { name: r.name, about: r.about };
      out.push(it.refs.id ? d.update(schema.brands).set(v).where(eq(schema.brands.id, it.refs.id)) : d.insert(schema.brands).values({ slug: r.slug, ...v })); count(it); }
  } else if (kind === "articles") {
    for (const it of items) { const r = it.data, v = { title: r.title, excerpt: r.excerpt, body: r.body, date: r.date };
      out.push(it.refs.id ? d.update(schema.articles).set({ ...v, updatedAt: now }).where(eq(schema.articles.id, it.refs.id)) : d.insert(schema.articles).values({ slug: r.slug, ...v })); count(it); }
  } else if (kind === "categories") {
    const ids = new Map((await d.select({ id: schema.categories.id, slug: schema.categories.slug }).from(schema.categories)).map((c) => [c.slug, c.id]));
    for (const it of items) if (!it.refs.id) ids.set(it.data.slug, randomUUID());
    for (const it of items) {
      const r = it.data, v = { label: r.label, icon: r.icon, tone: r.tone, position: r.position };
      if (it.refs.id) out.push(d.update(schema.categories).set(v).where(eq(schema.categories.id, it.refs.id)));
      else out.push(d.insert(schema.categories).values({ id: ids.get(r.slug)!, slug: r.slug, ...v }));
      out.push(d.update(schema.categories).set({ parentId: r.parent ? ids.get(r.parent) ?? null : null }).where(eq(schema.categories.id, ids.get(r.slug)!)));
      count(it);
    }
  }
  return out;
}

export const TAGS_FOR: Record<ImportKind, ("products" | "collections" | "brands" | "categories" | "articles" | "deals" | "coupons")[]> = {
  products: ["products", "collections"], offers: ["products", "collections"], merchants: ["products", "deals", "coupons"], brands: ["brands", "products"], categories: ["categories", "products"], articles: ["articles"],
};
