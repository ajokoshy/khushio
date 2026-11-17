import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import { brands, categories, productCategories, products, productTags, productVariants } from "@/core/database/schema";

/** Product reads and writes for CSV import (Release 5B). The only database access of products/import.ts. */

export type ExistingVariant = { id: string; sku: string | null; label: string; priceMinor: number | null; currency: string };
export type ExistingProduct = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  brandId: string | null;
  status: string;
  primaryCategoryId: string | null;
  tags: string[];
  variants: ExistingVariant[];
};

/** Products by slug with their variants, main category and tags, plus who owns each given SKU. A few indexed reads, whatever the file size. */
export async function loadForImport(slugs: readonly string[], skus: readonly string[]): Promise<{ products: ExistingProduct[]; skuOwners: Map<string, { productId: string; slug: string }> }> {
  const found = slugs.length === 0 ? [] : await db().select({ id: products.id, slug: products.slug, name: products.name, summary: products.summary, description: products.description, brandId: products.brandId, status: products.status }).from(products).where(inArray(products.slug, [...slugs]));
  const ids = found.map((p) => p.id);
  const [variants, categoryRows, tagRows, owners] = await Promise.all([
    ids.length === 0 ? [] : db().select({ productId: productVariants.productId, id: productVariants.id, sku: productVariants.sku, label: productVariants.label, priceMinor: productVariants.priceMinor, currency: productVariants.currency }).from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
    ids.length === 0 ? [] : db().select({ productId: productCategories.productId, categoryId: productCategories.categoryId }).from(productCategories).where(and(inArray(productCategories.productId, ids), eq(productCategories.isPrimary, true))),
    ids.length === 0 ? [] : db().select({ productId: productTags.productId, tag: productTags.tag }).from(productTags).where(inArray(productTags.productId, ids)),
    skus.length === 0 ? [] : db().select({ sku: productVariants.sku, productId: productVariants.productId, slug: products.slug }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(productVariants.sku, [...skus])),
  ]);
  const list: ExistingProduct[] = found.map((p) => ({
    ...p,
    primaryCategoryId: categoryRows.find((c) => c.productId === p.id)?.categoryId ?? null,
    tags: tagRows.filter((t) => t.productId === p.id).map((t) => t.tag).sort(),
    variants: variants.filter((v) => v.productId === p.id).map((v) => ({ id: v.id, sku: v.sku, label: v.label, priceMinor: v.priceMinor, currency: v.currency.trim() })),
  }));
  const skuOwners = new Map<string, { productId: string; slug: string }>();
  for (const o of owners) if (o.sku) skuOwners.set(o.sku.toLowerCase(), { productId: o.productId, slug: o.slug });
  return { products: list, skuOwners };
}

export type NewVariant = { id: string; sku: string | null; label: string; priceMinor: number | null; currency: string; sortOrder: number };
export type ChangedVariant = { id: string; label?: string; priceMinor?: number | null; currency?: string };
export type ProductBatchUnit = {
  id: string;
  isNew: boolean;
  slug: string;
  /** Fields to write. For a new product: all of them. For an existing one: only what the file changes. */
  fields: { name?: string; summary?: string | null; description?: string | null; brandId?: string | null; status?: "DRAFT" | "REVIEW" };
  primaryCategoryId?: string;
  /** Replaces the product's tags when present. */
  tags?: string[];
  newVariants: NewVariant[];
  changedVariants: ChangedVariant[];
};

/**
 * One batch of products as ONE atomic write: the product rows, main categories, tags and variants of up to 100 products.
 * A failure anywhere (for example a SKU taken by another product in the meantime) rolls the whole batch back.
 */
export async function writeProductBatch(units: readonly ProductBatchUnit[]): Promise<void> {
  await runAtomically((d) => {
    const statements: unknown[] = [];
    const created = units.filter((u) => u.isNew);
    if (created.length > 0) {
      statements.push(d.insert(products).values(created.map((u) => ({ id: u.id, slug: u.slug, name: u.fields.name ?? u.slug, summary: u.fields.summary ?? null, description: u.fields.description ?? null, brandId: u.fields.brandId ?? null, status: u.fields.status ?? "DRAFT" }))));
    }
    for (const u of units) if (!u.isNew && Object.keys(u.fields).length > 0) statements.push(d.update(products).set(u.fields).where(eq(products.id, u.id)));

    const withCategory = units.filter((u) => u.primaryCategoryId);
    if (withCategory.length > 0) {
      statements.push(d.delete(productCategories).where(and(inArray(productCategories.productId, withCategory.map((u) => u.id)), eq(productCategories.isPrimary, true))));
      statements.push(d.insert(productCategories).values(withCategory.map((u) => ({ productId: u.id, categoryId: u.primaryCategoryId as string, isPrimary: true }))).onConflictDoUpdate({ target: [productCategories.productId, productCategories.categoryId], set: { isPrimary: true } }));
    }

    const withTags = units.filter((u) => u.tags !== undefined);
    if (withTags.length > 0) {
      statements.push(d.delete(productTags).where(inArray(productTags.productId, withTags.map((u) => u.id))));
      const rows = withTags.flatMap((u) => (u.tags ?? []).map((tag) => ({ productId: u.id, tag })));
      if (rows.length > 0) statements.push(d.insert(productTags).values(rows));
    }

    const newVariants = units.flatMap((u) => u.newVariants.map((v) => ({ productId: u.id, ...v })));
    if (newVariants.length > 0) statements.push(d.insert(productVariants).values(newVariants));
    for (const u of units) {
      for (const v of u.changedVariants) {
        const { id, ...set } = v;
        statements.push(d.update(productVariants).set(set).where(and(eq(productVariants.id, id), eq(productVariants.productId, u.id))));
      }
    }
    return statements;
  });
}

export type ProductExportRow = { slug: string; name: string; summary: string | null; description: string | null; brandSlug: string | null; categorySlug: string | null; tags: string[]; status: string; variants: { sku: string | null; label: string; priceMinor: number | null; currency: string }[] };

/** One page of products (slug order) with brand, main category, tags and variants. */
export async function selectProductsForExport(limit: number, offset: number): Promise<ProductExportRow[]> {
  const rows = await db().select({ id: products.id, slug: products.slug, name: products.name, summary: products.summary, description: products.description, brandSlug: brands.slug, status: products.status })
    .from(products).leftJoin(brands, eq(brands.id, products.brandId)).orderBy(asc(products.slug)).limit(limit).offset(offset);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [cats, tagRows, variants] = await Promise.all([
    db().select({ productId: productCategories.productId, slug: categories.slug }).from(productCategories).innerJoin(categories, eq(categories.id, productCategories.categoryId)).where(and(inArray(productCategories.productId, ids), eq(productCategories.isPrimary, true))),
    db().select({ productId: productTags.productId, tag: productTags.tag }).from(productTags).where(inArray(productTags.productId, ids)),
    db().select({ productId: productVariants.productId, sku: productVariants.sku, label: productVariants.label, priceMinor: productVariants.priceMinor, currency: productVariants.currency }).from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
  ]);
  return rows.map(({ id, ...r }) => ({
    ...r,
    categorySlug: cats.find((c) => c.productId === id)?.slug ?? null,
    tags: tagRows.filter((t) => t.productId === id).map((t) => t.tag).sort(),
    variants: variants.filter((v) => v.productId === id).map((v) => ({ sku: v.sku, label: v.label, priceMinor: v.priceMinor, currency: v.currency.trim() })),
  }));
}
