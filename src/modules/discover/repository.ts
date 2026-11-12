import { and, asc, count, eq, ilike, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/core/database/client";
import { brands, categories, productCategories, products } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import type { BrandRow, BrandWrite, CategoryRow, CategoryWrite, StatusFilter } from "./types";

/** Repository: the only code in this module that talks to the database. */

const categoryColumns = {
  id: categories.id,
  parentId: categories.parentId,
  slug: categories.slug,
  name: categories.name,
  description: categories.description,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
};

const brandColumns = {
  id: brands.id,
  slug: brands.slug,
  name: brands.name,
  description: brands.description,
  logoUrl: brands.logoUrl,
  isFeatured: brands.isFeatured,
  isActive: brands.isActive,
};

/** A shop will not have thousands of categories; the cap keeps a bad import from loading the whole table. */
const MAX_CATEGORIES = 5000;

/* ----------------------------- categories ----------------------------- */

export async function selectAllCategories(): Promise<CategoryRow[]> {
  return db().select(categoryColumns).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)).limit(MAX_CATEGORIES);
}

export async function selectCategoryById(id: string): Promise<CategoryRow | null> {
  const [row] = await db().select(categoryColumns).from(categories).where(eq(categories.id, id)).limit(1);
  return row ?? null;
}

/** Slugs equal to `base` or starting with `base-` (uses the unique index on slug). */
export async function selectCategorySlugsLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ slug: categories.slug })
    .from(categories)
    .where(or(eq(categories.slug, base), like(categories.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

/** Same name (ignoring case) under the same parent. Matches the unique index categories_parent_name_uq. */
export async function selectCategoryByNameUnderParent(name: string, parentId: string | null): Promise<CategoryRow | null> {
  const [row] = await db()
    .select(categoryColumns)
    .from(categories)
    .where(and(sql`lower(${categories.name}) = lower(${name})`, parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId)))
    .limit(1);
  return row ?? null;
}

export async function insertCategory(values: CategoryWrite): Promise<CategoryRow> {
  const [row] = await db().insert(categories).values(values).returning(categoryColumns);
  if (!row) throw new Error("Category insert returned no row");
  return row;
}

export async function updateCategoryRow(id: string, values: Partial<CategoryWrite> & { isActive?: boolean }): Promise<CategoryRow | null> {
  const [row] = await db().update(categories).set(values).where(eq(categories.id, id)).returning(categoryColumns);
  return row ?? null;
}

export async function deleteCategoryRow(id: string): Promise<void> {
  await db().delete(categories).where(eq(categories.id, id));
}

export async function countChildCategories(id: string, options: { activeOnly?: boolean } = {}): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(categories)
    .where(and(eq(categories.parentId, id), options.activeOnly ? eq(categories.isActive, true) : undefined));
  return Number(row?.n ?? 0);
}

/** Uses pc_category_idx. */
export async function countProductsInCategory(id: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(productCategories).where(eq(productCategories.categoryId, id));
  return Number(row?.n ?? 0);
}

/* ------------------------------- brands ------------------------------- */

function brandFilters(q: string | undefined, status: StatusFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(brands.name, pattern), ilike(brands.slug, pattern)));
  }
  if (status === "active") conditions.push(eq(brands.isActive, true));
  if (status === "archived") conditions.push(eq(brands.isActive, false));
  return and(...conditions);
}

export async function selectBrands(opts: { q?: string; status: StatusFilter; limit: number; offset: number }): Promise<BrandRow[]> {
  return db()
    .select(brandColumns)
    .from(brands)
    .where(brandFilters(opts.q, opts.status))
    .orderBy(asc(sql`lower(${brands.name})`), asc(brands.id))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function selectBrandById(id: string): Promise<BrandRow | null> {
  const [row] = await db().select(brandColumns).from(brands).where(eq(brands.id, id)).limit(1);
  return row ?? null;
}

export async function selectBrandSlugsLike(base: string): Promise<string[]> {
  const rows = await db()
    .select({ slug: brands.slug })
    .from(brands)
    .where(or(eq(brands.slug, base), like(brands.slug, `${escapeLike(base)}-%`)));
  return rows.map((r) => r.slug);
}

export async function selectBrandByName(name: string): Promise<BrandRow | null> {
  const [row] = await db().select(brandColumns).from(brands).where(sql`lower(${brands.name}) = lower(${name})`).limit(1);
  return row ?? null;
}

export async function insertBrand(values: BrandWrite): Promise<BrandRow> {
  const [row] = await db().insert(brands).values(values).returning(brandColumns);
  if (!row) throw new Error("Brand insert returned no row");
  return row;
}

export async function updateBrandRow(id: string, values: Partial<BrandWrite> & { isActive?: boolean }): Promise<BrandRow | null> {
  const [row] = await db().update(brands).set(values).where(eq(brands.id, id)).returning(brandColumns);
  return row ?? null;
}

export async function deleteBrandRow(id: string): Promise<void> {
  await db().delete(brands).where(eq(brands.id, id));
}

/** Uses products_brand_idx. */
export async function countProductsForBrand(id: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(products).where(eq(products.brandId, id));
  return Number(row?.n ?? 0);
}
