import { revalidateTag, unstable_cache } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import { uniqueViolationOf } from "@/core/validation/slug";
import * as repo from "./repository";
import { descendantIds, flattenTree, indentedLabel, wouldCreateCycle } from "./tree";
import type { BrandRow, CategoryListItem, CategoryRow, CategoryUsage, ParentOption, StatusFilter } from "./types";
import type { BrandInput, CategoryInput } from "./validation";

/**
 * Categories and brands. Every write follows the project rules: validated input (done by the caller),
 * permission already checked by the server action, business rules here, then an audit row and
 * revalidateTag for exactly the tags affected.
 */

const nameClash = "A category with this name already exists under the same parent.";

/** A duplicate that slipped past the checks (two admins saving at once) is reported like the check would. */
function rethrowDuplicate(error: unknown, nameMessage: string): never {
  const constraint = uniqueViolationOf(error);
  if (constraint?.includes("slug")) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  if (constraint) throw new ValidationError("Duplicate name", { name: nameMessage });
  throw error;
}

/* ------------------------------ categories ------------------------------ */

/** Cached 24 hours, tag `categories`; every category write revalidates the tag. */
const loadCategories = unstable_cache(() => repo.selectAllCategories(), ["categories-all"], {
  revalidate: CACHE_TTL.categories,
  tags: [CACHE_TAGS.categories],
});

export async function listCategories(opts: { q?: string; status: StatusFilter; limit: number; offset: number }) {
  const flat: CategoryListItem[] = flattenTree(await loadCategories());
  const needle = opts.q?.toLowerCase();
  const filtered = flat.filter((c) => {
    if (opts.status === "active" && !c.isActive) return false;
    if (opts.status === "archived" && c.isActive) return false;
    return !needle || c.name.toLowerCase().includes(needle) || c.slug.includes(needle);
  });
  return { rows: filtered.slice(opts.offset, opts.offset + opts.limit), hasNext: filtered.length > opts.offset + opts.limit, total: filtered.length };
}

/**
 * Options for the "Parent" picker: active categories in tree order, indented. When editing, the category
 * itself and everything below it are left out (a category cannot sit under its own subcategory).
 * The current parent is always listed, even if it has since been archived, so saving does not move it.
 */
export async function listParentOptions(opts: { excludeId?: string; currentParentId?: string | null } = {}): Promise<ParentOption[]> {
  const all = await loadCategories();
  const excluded = opts.excludeId ? new Set([opts.excludeId, ...descendantIds(all, opts.excludeId)]) : new Set<string>();
  return flattenTree(all)
    .filter((c) => !excluded.has(c.id) && (c.isActive || c.id === opts.currentParentId))
    .map((c) => ({ id: c.id, label: indentedLabel(c.name, c.depth) + (c.isActive ? "" : " (archived)") }));
}

export async function getCategory(id: string): Promise<{ category: CategoryRow; usage: CategoryUsage }> {
  const category = await repo.selectCategoryById(id);
  if (!category) throw new NotFoundError("Category not found");
  const [children, activeChildren, products] = await Promise.all([
    repo.countChildCategories(id),
    repo.countChildCategories(id, { activeOnly: true }),
    repo.countProductsInCategory(id),
  ]);
  return { category, usage: { children, activeChildren, products } };
}

async function assertUsableParent(parentId: string | null, all: readonly CategoryRow[]) {
  if (parentId === null) return;
  const parent = all.find((c) => c.id === parentId);
  if (!parent) throw new ValidationError("Parent not found", { parentId: "That parent category no longer exists." });
  if (!parent.isActive) throw new ValidationError("Parent archived", { parentId: "That parent category is archived. Restore it first or choose another." });
}

async function assertNameFree(name: string, parentId: string | null, exceptId?: string) {
  const clash = await repo.selectCategoryByNameUnderParent(name, parentId);
  if (clash && clash.id !== exceptId) throw new ValidationError("Duplicate name", { name: nameClash });
}

export async function createCategory(input: CategoryInput, actorId: string): Promise<CategoryRow> {
  const parentId = input.parentId;
  await assertUsableParent(parentId, await repo.selectAllCategories());
  await assertNameFree(input.name, parentId);
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectCategorySlugsLike });

  let created: CategoryRow;
  try {
    created = await repo.insertCategory({ parentId, slug, name: input.name, description: input.description, sortOrder: input.sortOrder });
  } catch (error) {
    rethrowDuplicate(error, nameClash);
  }

  await logAuditBestEffort({ actor: actorId, action: "category.created", entityType: "category", entityId: created.id, metadata: { slug, name: created.name, parentId } });
  revalidateTag(CACHE_TAGS.categories);
  return created;
}

export async function updateCategory(id: string, input: CategoryInput, actorId: string): Promise<CategoryRow> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Category not found");

  const all = await repo.selectAllCategories();
  const parentId = input.parentId;
  if (parentId !== current.parentId) {
    if (wouldCreateCycle(all, id, parentId)) {
      throw new ValidationError("Cycle", { parentId: "A category cannot be moved under itself or one of its own subcategories." });
    }
    await assertUsableParent(parentId, all);
  }
  if (parentId !== current.parentId || input.name.toLowerCase() !== current.name.toLowerCase()) await assertNameFree(input.name, parentId, id);

  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectCategorySlugsLike });

  const next = { parentId, slug, name: input.name, description: input.description, sortOrder: input.sortOrder };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  if (changed.length === 0) return current;

  let updated: CategoryRow | null;
  try {
    updated = await repo.updateCategoryRow(id, next);
  } catch (error) {
    rethrowDuplicate(error, nameClash);
  }
  if (!updated) throw new NotFoundError("Category not found");

  await logAuditBestEffort({
    actor: actorId,
    action: "category.updated",
    entityType: "category",
    entityId: id,
    metadata: {
      changed,
      ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}),
      ...(parentId !== current.parentId ? { parentId: { from: current.parentId, to: parentId } } : {}),
    },
  });
  revalidateTag(CACHE_TAGS.categories);
  return updated;
}

export async function archiveCategory(id: string, actorId: string): Promise<void> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Category not found");
  if (!current.isActive) return;
  const activeChildren = await repo.countChildCategories(id, { activeOnly: true });
  if (activeChildren > 0) {
    throw new ConflictError(`This category still has ${activeChildren} active subcategor${activeChildren === 1 ? "y" : "ies"}. Archive or move ${activeChildren === 1 ? "it" : "them"} first.`);
  }
  await repo.updateCategoryRow(id, { isActive: false });
  await logAuditBestEffort({ actor: actorId, action: "category.archived", entityType: "category", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.categories);
}

export async function restoreCategory(id: string, actorId: string): Promise<void> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Category not found");
  if (current.isActive) return;
  if (current.parentId) {
    const parent = await repo.selectCategoryById(current.parentId);
    if (parent && !parent.isActive) throw new ConflictError("Its parent category is archived. Restore the parent first.");
  }
  await repo.updateCategoryRow(id, { isActive: true });
  await logAuditBestEffort({ actor: actorId, action: "category.restored", entityType: "category", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.categories);
}

/** Delete is only for categories nothing depends on. Anything else is archived instead. */
export async function deleteCategory(id: string, actorId: string): Promise<void> {
  const current = await repo.selectCategoryById(id);
  if (!current) throw new NotFoundError("Category not found");
  const [children, products] = await Promise.all([repo.countChildCategories(id), repo.countProductsInCategory(id)]);
  if (children > 0) throw new ConflictError(`This category has ${children} subcategor${children === 1 ? "y" : "ies"}, so it cannot be deleted. Archive it instead, or move or delete the subcategories first.`);
  if (products > 0) throw new ConflictError(`${products} product${products === 1 ? " uses" : "s use"} this category, so it cannot be deleted. Archive it instead.`);
  await repo.deleteCategoryRow(id);
  await logAuditBestEffort({ actor: actorId, action: "category.deleted", entityType: "category", entityId: id, metadata: { slug: current.slug, name: current.name } });
  revalidateTag(CACHE_TAGS.categories);
}

/* -------------------------------- brands -------------------------------- */

const brandNameClash = "A brand with this name already exists.";

export async function listBrands(opts: { q?: string; status: StatusFilter; limit: number; offset: number }) {
  const rows = await repo.selectBrands({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export async function getBrand(id: string): Promise<{ brand: BrandRow; products: number }> {
  const brand = await repo.selectBrandById(id);
  if (!brand) throw new NotFoundError("Brand not found");
  return { brand, products: await repo.countProductsForBrand(id) };
}

export async function createBrand(input: BrandInput, actorId: string): Promise<BrandRow> {
  if (await repo.selectBrandByName(input.name)) throw new ValidationError("Duplicate name", { name: brandNameClash });
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectBrandSlugsLike });

  let created: BrandRow;
  try {
    created = await repo.insertBrand({ slug, name: input.name, description: input.description, logoUrl: input.logoUrl, isFeatured: input.isFeatured });
  } catch (error) {
    rethrowDuplicate(error, brandNameClash);
  }
  await logAuditBestEffort({ actor: actorId, action: "brand.created", entityType: "brand", entityId: created.id, metadata: { slug, name: created.name } });
  revalidateTag(CACHE_TAGS.brands);
  return created;
}

export async function updateBrand(id: string, input: BrandInput, actorId: string): Promise<BrandRow> {
  const current = await repo.selectBrandById(id);
  if (!current) throw new NotFoundError("Brand not found");

  if (input.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await repo.selectBrandByName(input.name);
    if (clash && clash.id !== id) throw new ValidationError("Duplicate name", { name: brandNameClash });
  }
  const slug = await resolveUpdateSlug({ current: current.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectBrandSlugsLike });

  const next = { slug, name: input.name, description: input.description, logoUrl: input.logoUrl, isFeatured: input.isFeatured };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  if (changed.length === 0) return current;

  let updated: BrandRow | null;
  try {
    updated = await repo.updateBrandRow(id, next);
  } catch (error) {
    rethrowDuplicate(error, brandNameClash);
  }
  if (!updated) throw new NotFoundError("Brand not found");

  await logAuditBestEffort({
    actor: actorId,
    action: "brand.updated",
    entityType: "brand",
    entityId: id,
    metadata: { changed, ...(slug !== current.slug ? { slug: { from: current.slug, to: slug } } : {}) },
  });
  revalidateTag(CACHE_TAGS.brands);
  return updated;
}

export async function archiveBrand(id: string, actorId: string): Promise<void> {
  const current = await repo.selectBrandById(id);
  if (!current) throw new NotFoundError("Brand not found");
  if (!current.isActive) return;
  await repo.updateBrandRow(id, { isActive: false });
  await logAuditBestEffort({ actor: actorId, action: "brand.archived", entityType: "brand", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.brands);
}

export async function restoreBrand(id: string, actorId: string): Promise<void> {
  const current = await repo.selectBrandById(id);
  if (!current) throw new NotFoundError("Brand not found");
  if (current.isActive) return;
  await repo.updateBrandRow(id, { isActive: true });
  await logAuditBestEffort({ actor: actorId, action: "brand.restored", entityType: "brand", entityId: id, metadata: { slug: current.slug } });
  revalidateTag(CACHE_TAGS.brands);
}

export async function deleteBrand(id: string, actorId: string): Promise<void> {
  const current = await repo.selectBrandById(id);
  if (!current) throw new NotFoundError("Brand not found");
  const products = await repo.countProductsForBrand(id);
  if (products > 0) throw new ConflictError(`${products} product${products === 1 ? " uses" : "s use"} this brand, so it cannot be deleted. Archive it instead.`);
  await repo.deleteBrandRow(id);
  await logAuditBestEffort({ actor: actorId, action: "brand.deleted", entityType: "brand", entityId: id, metadata: { slug: current.slug, name: current.name } });
  revalidateTag(CACHE_TAGS.brands);
}
