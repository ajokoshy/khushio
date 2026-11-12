import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  selectAllCategories: vi.fn(), selectCategoryById: vi.fn(), selectCategorySlugsLike: vi.fn(), selectCategoryByNameUnderParent: vi.fn(),
  insertCategory: vi.fn(), updateCategoryRow: vi.fn(), deleteCategoryRow: vi.fn(), countChildCategories: vi.fn(), countProductsInCategory: vi.fn(),
  selectBrands: vi.fn(), selectBrandById: vi.fn(), selectBrandSlugsLike: vi.fn(), selectBrandByName: vi.fn(), insertBrand: vi.fn(),
  updateBrandRow: vi.fn(), deleteBrandRow: vi.fn(), countProductsForBrand: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("@/modules/discover/repository", () => repo);
vi.mock("@/core/audit", () => ({ logAuditBestEffort: (...a: unknown[]) => audit(...a) }));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidate(...a), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import * as service from "@/modules/discover/service";
import type { CategoryInput, BrandInput } from "@/modules/discover/validation";

const cat = (id: string, parentId: string | null = null, extra: Record<string, unknown> = {}) => ({
  id, parentId, slug: id, name: id, description: null, sortOrder: 0, isActive: true, ...extra,
});
const catInput = (over: Partial<CategoryInput> = {}): CategoryInput => ({
  name: "Shoes", slug: undefined, parentId: null, description: null, sortOrder: 0, confirmSlugChange: false, ...over,
});
const brandInput = (over: Partial<BrandInput> = {}): BrandInput => ({
  name: "Nike", slug: undefined, description: null, logoUrl: null, isFeatured: false, confirmSlugChange: false, ...over,
});

beforeEach(() => {
  Object.values(repo).forEach((m) => m.mockReset());
  audit.mockReset();
  revalidate.mockReset();
  repo.selectCategorySlugsLike.mockResolvedValue([]);
  repo.selectCategoryByNameUnderParent.mockResolvedValue(null);
  repo.selectAllCategories.mockResolvedValue([]);
  repo.countChildCategories.mockResolvedValue(0);
  repo.countProductsInCategory.mockResolvedValue(0);
  repo.selectBrandSlugsLike.mockResolvedValue([]);
  repo.selectBrandByName.mockResolvedValue(null);
  repo.countProductsForBrand.mockResolvedValue(0);
});

describe("createCategory", () => {
  it("creates with a generated slug, then audits and revalidates the categories tag", async () => {
    repo.insertCategory.mockImplementation(async (v) => ({ id: "new", isActive: true, ...v }));
    const created = await service.createCategory(catInput({ name: "Home & Kitchen" }), "actor1");
    expect(repo.insertCategory).toHaveBeenCalledWith({ parentId: null, slug: "home-and-kitchen", name: "Home & Kitchen", description: null, sortOrder: 0 });
    expect(created.id).toBe("new");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actor: "actor1", action: "category.created", entityType: "category", entityId: "new" }));
    expect(revalidate).toHaveBeenCalledWith("categories");
  });

  it("adds -2 when the generated slug is taken", async () => {
    repo.selectCategorySlugsLike.mockResolvedValue(["shoes"]);
    repo.insertCategory.mockImplementation(async (v) => ({ id: "n", isActive: true, ...v }));
    await service.createCategory(catInput(), "a");
    expect(repo.insertCategory).toHaveBeenCalledWith(expect.objectContaining({ slug: "shoes-2" }));
  });

  it("refuses a missing or archived parent, and writes nothing", async () => {
    repo.selectAllCategories.mockResolvedValue([cat("old", null, { isActive: false })]);
    await expect(service.createCategory(catInput({ parentId: "ghost" }), "a")).rejects.toMatchObject({ fields: { parentId: expect.any(String) } });
    await expect(service.createCategory(catInput({ parentId: "old" }), "a")).rejects.toMatchObject({ fields: { parentId: expect.stringContaining("archived") } });
    expect(repo.insertCategory).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("refuses a duplicate name under the same parent", async () => {
    repo.selectCategoryByNameUnderParent.mockResolvedValue(cat("x"));
    await expect(service.createCategory(catInput(), "a")).rejects.toMatchObject({ fields: { name: expect.any(String) } });
  });

  it("turns a database unique violation (two saves at once) into a field error", async () => {
    repo.insertCategory.mockRejectedValue({ code: "23505", constraint: "categories_slug_unique" });
    await expect(service.createCategory(catInput(), "a")).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("updateCategory", () => {
  const tree = [cat("fashion"), cat("shoes", "fashion"), cat("running", "shoes"), cat("home")];
  beforeEach(() => {
    repo.selectAllCategories.mockResolvedValue(tree);
    repo.selectCategoryById.mockImplementation(async (id: string) => tree.find((c) => c.id === id) ?? null);
    repo.updateCategoryRow.mockImplementation(async (id: string, v: object) => ({ ...tree.find((c) => c.id === id), ...v }));
  });

  it("prevents a category becoming its own descendant", async () => {
    for (const parentId of ["fashion", "shoes", "running"]) {
      await expect(service.updateCategory("fashion", catInput({ name: "fashion", slug: "fashion", parentId }), "a")).rejects.toMatchObject({ fields: { parentId: expect.stringContaining("cannot be moved") } });
    }
    expect(repo.updateCategoryRow).not.toHaveBeenCalled();
  });

  it("moves a category under another branch and records the move in the audit log", async () => {
    await service.updateCategory("running", catInput({ name: "running", slug: "running", parentId: "home" }), "a");
    expect(repo.updateCategoryRow).toHaveBeenCalledWith("running", expect.objectContaining({ parentId: "home" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "category.updated", metadata: expect.objectContaining({ parentId: { from: "shoes", to: "home" } }) }));
  });

  it("does not change the slug without confirmation, and records it when confirmed", async () => {
    await expect(service.updateCategory("home", catInput({ name: "home", slug: "house" }), "a")).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
    await service.updateCategory("home", catInput({ name: "home", slug: "house", confirmSlugChange: true }), "a");
    expect(repo.updateCategoryRow).toHaveBeenCalledWith("home", expect.objectContaining({ slug: "house" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ slug: { from: "home", to: "house" } }) }));
  });

  it("does nothing (no write, no audit) when nothing changed", async () => {
    await service.updateCategory("home", catInput({ name: "home", slug: "home" }), "a");
    expect(repo.updateCategoryRow).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("answers not found for an unknown id", async () => {
    await expect(service.updateCategory("ghost", catInput(), "a")).rejects.toMatchObject({ status: 404 });
  });
});

describe("archive, restore and delete rules (category)", () => {
  beforeEach(() => repo.selectCategoryById.mockImplementation(async (id: string) => cat(id, id === "child" ? "parent" : null)));

  it("refuses to archive while active subcategories exist", async () => {
    repo.countChildCategories.mockResolvedValue(2);
    await expect(service.archiveCategory("parent", "a")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("2 active") });
    expect(repo.updateCategoryRow).not.toHaveBeenCalled();
  });

  it("archives a leaf and audits it", async () => {
    await service.archiveCategory("leaf", "a");
    expect(repo.updateCategoryRow).toHaveBeenCalledWith("leaf", { isActive: false });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "category.archived" }));
    expect(revalidate).toHaveBeenCalledWith("categories");
  });

  it("restore needs an active parent", async () => {
    repo.selectCategoryById.mockImplementation(async (id: string) => (id === "child" ? cat("child", "parent", { isActive: false }) : cat("parent", null, { isActive: false })));
    await expect(service.restoreCategory("child", "a")).rejects.toMatchObject({ status: 409 });
  });

  it("deletes only when there are no subcategories and no products", async () => {
    repo.countChildCategories.mockResolvedValue(1);
    await expect(service.deleteCategory("x", "a")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Archive it instead") });
    repo.countChildCategories.mockResolvedValue(0);
    repo.countProductsInCategory.mockResolvedValue(3);
    await expect(service.deleteCategory("x", "a")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("3 products") });
    expect(repo.deleteCategoryRow).not.toHaveBeenCalled();

    repo.countProductsInCategory.mockResolvedValue(0);
    await service.deleteCategory("x", "a");
    expect(repo.deleteCategoryRow).toHaveBeenCalledWith("x");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "category.deleted" }));
  });
});

describe("listCategories / listParentOptions", () => {
  const rows = [cat("fashion"), cat("shoes", "fashion"), cat("old", null, { isActive: false })];
  beforeEach(() => repo.selectAllCategories.mockResolvedValue(rows));

  it("returns tree order with depth, filters and pages", async () => {
    const all = await service.listCategories({ status: "all", limit: 2, offset: 0 });
    expect(all.rows.map((r) => r.id)).toEqual(["fashion", "shoes"]);
    expect(all.hasNext).toBe(true);
    expect((await service.listCategories({ status: "archived", limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual(["old"]);
    expect((await service.listCategories({ q: "SHO", status: "all", limit: 10, offset: 0 })).rows.map((r) => r.id)).toEqual(["shoes"]);
  });

  it("leaves out archived categories, and the edited category with its subtree, from the parent picker", async () => {
    expect((await service.listParentOptions()).map((o) => o.id)).toEqual(["fashion", "shoes"]);
    expect((await service.listParentOptions({ excludeId: "fashion" })).map((o) => o.id)).toEqual([]);
    const withCurrent = await service.listParentOptions({ currentParentId: "old" });
    expect(withCurrent.find((o) => o.id === "old")?.label).toContain("archived");
  });
});

describe("brands", () => {
  it("creates with a unique slug, audits, revalidates the brands tag", async () => {
    repo.insertBrand.mockImplementation(async (v) => ({ id: "b1", isActive: true, ...v }));
    await service.createBrand(brandInput({ isFeatured: true }), "a");
    expect(repo.insertBrand).toHaveBeenCalledWith({ slug: "nike", name: "Nike", description: null, logoUrl: null, isFeatured: true });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "brand.created" }));
    expect(revalidate).toHaveBeenCalledWith("brands");
  });

  it("refuses a duplicate brand name (any case)", async () => {
    repo.selectBrandByName.mockResolvedValue({ id: "other", name: "NIKE" });
    await expect(service.createBrand(brandInput(), "a")).rejects.toMatchObject({ fields: { name: expect.any(String) } });
  });

  it("will not delete a brand that products use, but archives it", async () => {
    repo.selectBrandById.mockResolvedValue({ id: "b", slug: "nike", name: "Nike", isActive: true });
    repo.countProductsForBrand.mockResolvedValue(4);
    await expect(service.deleteBrand("b", "a")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Archive it instead") });
    expect(repo.deleteBrandRow).not.toHaveBeenCalled();
    await service.archiveBrand("b", "a");
    expect(repo.updateBrandRow).toHaveBeenCalledWith("b", { isActive: false });
    repo.countProductsForBrand.mockResolvedValue(0);
    await service.deleteBrand("b", "a");
    expect(repo.deleteBrandRow).toHaveBeenCalledWith("b");
  });
});
