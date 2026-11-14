import { and, asc, count, desc, eq, ilike, inArray, like, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { runAtomically } from "@/core/database/atomic";
import {
  affiliateLinks,
  brands,
  categories,
  productAttributes,
  productCategories,
  productImages,
  products,
  productTags,
  productVariants,
} from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { AttributeRow, ProductFilter, ProductGraph, ProductImageRow, ProductListRow, ProductRow, ProductStatus, VariantRow } from "./types";

/** Repository: the only code in this module that talks to the database. */

const productColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  summary: products.summary,
  description: products.description,
  brandId: products.brandId,
  status: products.status,
  publishAt: products.publishAt,
  isFeatured: products.isFeatured,
};

const variantColumns = {
  id: productVariants.id,
  sku: productVariants.sku,
  label: productVariants.label,
  priceMinor: productVariants.priceMinor,
  currency: productVariants.currency,
  sortOrder: productVariants.sortOrder,
};

const imageColumns = { id: productImages.id, publicId: productImages.publicId, alt: productImages.alt, sortOrder: productImages.sortOrder };

/* ------------------------------- reading ------------------------------- */

function listFilters(q: string | undefined, status: ProductFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(products.name, pattern), ilike(products.slug, pattern)));
  }
  if (status !== "all") conditions.push(eq(products.status, status));
  return and(...conditions);
}

/** Newest edits first. The category shown is the primary one. */
export async function selectProducts(opts: { q?: string; status: ProductFilter; limit: number; offset: number }): Promise<ProductListRow[]> {
  return db()
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      publishAt: products.publishAt,
      isFeatured: products.isFeatured,
      brandName: brands.name,
      categoryName: categories.name,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(productCategories, and(eq(productCategories.productId, products.id), eq(productCategories.isPrimary, true)))
    .leftJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(listFilters(opts.q, opts.status))
    .orderBy(desc(products.updatedAt), asc(products.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectProductById(id: string): Promise<ProductRow | null> {
  const [row] = await db().select(productColumns).from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

export async function selectCategoryLinks(productId: string): Promise<{ categoryId: string; isPrimary: boolean }[]> {
  return db().select({ categoryId: productCategories.categoryId, isPrimary: productCategories.isPrimary }).from(productCategories).where(eq(productCategories.productId, productId));
}

export async function selectAttributes(productId: string): Promise<AttributeRow[]> {
  return db().select({ name: productAttributes.name, value: productAttributes.value }).from(productAttributes).where(eq(productAttributes.productId, productId)).orderBy(asc(productAttributes.id));
}

export async function selectTags(productId: string): Promise<string[]> {
  const rows = await db().select({ tag: productTags.tag }).from(productTags).where(eq(productTags.productId, productId)).orderBy(asc(productTags.tag));
  return rows.map((r) => r.tag);
}

export async function selectVariants(productId: string): Promise<VariantRow[]> {
  return db().select(variantColumns).from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt), asc(productVariants.id));
}

export async function selectImages(productId: string): Promise<ProductImageRow[]> {
  return db().select(imageColumns).from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
}

/** Slugs equal to `base` or starting with `base-` (uses the unique index on slug). */
export async function selectProductSlugsLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ slug: products.slug })
    .from(products)
    .where(or(eq(products.slug, base), like(products.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

/** Variants of OTHER products that already use one of these SKUs (uses variants_sku_uq). */
export async function selectSkuClashes(skus: string[], exceptProductId: string | null): Promise<{ sku: string; productId: string }[]> {
  if (skus.length === 0) return [];
  const rows = await db()
    .select({ sku: productVariants.sku, productId: productVariants.productId })
    .from(productVariants)
    .where(and(inArray(productVariants.sku, skus), exceptProductId ? sql`${productVariants.productId} <> ${exceptProductId}` : undefined));
  return rows.flatMap((r) => (r.sku ? [{ sku: r.sku, productId: r.productId }] : []));
}

/** Uses links_product_idx. */
export async function countAffiliateLinksForProduct(productId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(affiliateLinks).where(eq(affiliateLinks.productId, productId));
  return Number(row?.n ?? 0);
}

/* ------------------------------- writing ------------------------------- */

/**
 * A product and everything saved with it (categories, attributes, tags, variants) are written as ONE unit:
 * either all of it is saved or none of it, so a failure halfway never leaves a product without its variants.
 */
function graphStatements(d: ReturnType<typeof db>, productId: string, graph: ProductGraph, mode: "create" | "update") {
  const statements: unknown[] = [];

  if (mode === "create") statements.push(d.insert(products).values({ id: productId, ...graph.product }));
  else statements.push(d.update(products).set(graph.product).where(eq(products.id, productId)));

  if (mode === "update") statements.push(d.delete(productCategories).where(eq(productCategories.productId, productId)));
  if (graph.categoryLinks.length > 0) statements.push(d.insert(productCategories).values(graph.categoryLinks.map((l) => ({ productId, ...l }))));

  if (mode === "update") statements.push(d.delete(productAttributes).where(eq(productAttributes.productId, productId)));
  if (graph.attributes.length > 0) statements.push(d.insert(productAttributes).values(graph.attributes.map((a) => ({ productId, name: a.name, value: a.value }))));

  if (mode === "update") statements.push(d.delete(productTags).where(eq(productTags.productId, productId)));
  if (graph.tags.length > 0) statements.push(d.insert(productTags).values(graph.tags.map((tag) => ({ productId, tag }))));

  return statements;
}

export async function insertProductGraph(productId: string, graph: ProductGraph): Promise<void> {
  await runAtomically((d) => {
    const statements = graphStatements(d, productId, graph, "create");
    if (graph.variants.length > 0) statements.push(d.insert(productVariants).values(graph.variants.map((v) => ({ productId, ...v }))));
    return statements;
  });
}

/** Variants whose id is in `existingVariantIds` are updated, the other submitted ones are added, and variants not submitted are removed. */
export async function updateProductGraph(productId: string, graph: ProductGraph, existingVariantIds: ReadonlySet<string>): Promise<void> {
  await runAtomically((d) => {
    const statements = graphStatements(d, productId, graph, "update");
    const kept = graph.variants.filter((v) => existingVariantIds.has(v.id));
    const added = graph.variants.filter((v) => !existingVariantIds.has(v.id));

    statements.push(
      d.delete(productVariants).where(and(eq(productVariants.productId, productId), kept.length > 0 ? notInArray(productVariants.id, kept.map((v) => v.id)) : undefined)),
    );
    for (const v of kept) {
      statements.push(d.update(productVariants).set({ sku: v.sku, label: v.label, priceMinor: v.priceMinor, currency: v.currency, sortOrder: v.sortOrder }).where(and(eq(productVariants.id, v.id), eq(productVariants.productId, productId))));
    }
    if (added.length > 0) statements.push(d.insert(productVariants).values(added.map((v) => ({ productId, ...v }))));
    return statements;
  });
}

export async function updateProductStatusRow(id: string, status: ProductStatus, publishAt: Date | null): Promise<ProductRow | null> {
  const [row] = await db().update(products).set({ status, publishAt }).where(eq(products.id, id)).returning(productColumns);
  return row ?? null;
}

export async function deleteProductRow(id: string): Promise<void> {
  await db().delete(products).where(eq(products.id, id));
}

/* -------------------------------- images -------------------------------- */

export async function countImages(productId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(productImages).where(eq(productImages.productId, productId));
  return Number(row?.n ?? 0);
}

export async function selectImageById(imageId: string): Promise<(ProductImageRow & { productId: string }) | null> {
  const [row] = await db().select({ ...imageColumns, productId: productImages.productId }).from(productImages).where(eq(productImages.id, imageId)).limit(1);
  return row ?? null;
}

export async function insertImage(values: { productId: string; publicId: string; alt: string; sortOrder: number }): Promise<ProductImageRow> {
  const [row] = await db().insert(productImages).values(values).returning(imageColumns);
  if (!row) throw new Error("Image insert returned no row");
  return row;
}

export async function updateImageAltRow(imageId: string, alt: string): Promise<void> {
  await db().update(productImages).set({ alt }).where(eq(productImages.id, imageId));
}

export async function deleteImageRow(imageId: string): Promise<void> {
  await db().delete(productImages).where(eq(productImages.id, imageId));
}

/** Rewrites sort_order as 0, 1, 2 ... in the given order, in one atomic unit. */
export async function setImageOrder(productId: string, orderedIds: readonly string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await runAtomically((d) =>
    orderedIds.map((imageId, index) => d.update(productImages).set({ sortOrder: index }).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))),
  );
}
