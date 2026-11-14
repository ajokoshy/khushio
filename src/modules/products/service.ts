import { revalidateTag } from "next/cache";
import { logAuditBestEffort } from "@/core/audit";
import { CACHE_TAGS } from "@/core/config/cache";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions/keys";
import { hasPermission } from "@/core/permissions/guard";
import { resolveCreateSlug, resolveUpdateSlug } from "@/core/validation/slug-rules";
import { uniqueViolationOf } from "@/core/validation/slug";
import { MAX_IMAGES_PER_PRODUCT, uploadProblem, type UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import * as discover from "@/modules/discover/service";
import * as media from "@/modules/media/service";
import * as repo from "./repository";
import { creationStatusProblem, deleteProblem, publishBlockers, statusChangeProblem } from "./rules";
import type { Actor, ProductDetail, ProductFilter, ProductGraph, ProductImageRow, ProductRow, ProductStatus, VariantWrite } from "./types";
import type { ProductInput } from "./validation";

/**
 * Products, variants, categories, attributes, tags and images. Every write follows the project rules: validated
 * input (done by the caller), permission already checked by the server action, business rules here, one
 * atomic write, then an audit row and revalidateTag for exactly the tags affected.
 */

const touch = () => revalidateTag(CACHE_TAGS.products);
const canPublish = (actor: Actor) => hasPermission(actor.permissions, P.productPublish);

/* -------------------------------- reading -------------------------------- */

export async function listProducts(opts: { q?: string; status: ProductFilter; limit: number; offset: number }) {
  const rows = await repo.selectProducts({ ...opts, limit: opts.limit + 1 });
  return { rows: rows.slice(0, opts.limit), hasNext: rows.length > opts.limit };
}

export async function getProduct(id: string): Promise<ProductDetail & { affiliateLinks: number }> {
  const product = await repo.selectProductById(id);
  if (!product) throw new NotFoundError("Product not found");
  const [links, attributes, tags, variants, images, affiliateLinks] = await Promise.all([
    repo.selectCategoryLinks(id),
    repo.selectAttributes(id),
    repo.selectTags(id),
    repo.selectVariants(id),
    repo.selectImages(id),
    repo.countAffiliateLinksForProduct(id),
  ]);
  const primary = links.find((l) => l.isPrimary)?.categoryId ?? null;
  return { product, categoryIds: links.map((l) => l.categoryId), primaryCategoryId: primary, attributes, tags, variants, images, affiliateLinks };
}

/* ------------------------------ shared checks ------------------------------ */

/**
 * The brand and categories of a product must exist and be active. A brand or category the product ALREADY has may
 * since have been archived: keeping it is fine, choosing it anew is not.
 */
async function assertReferences(input: ProductInput, current: { brandId: string | null; categoryIds: readonly string[] } | null) {
  if (input.brandId && input.brandId !== current?.brandId) {
    const brand = await discover.findBrandById(input.brandId);
    if (!brand) throw new ValidationError("Brand not found", { brandId: "That brand no longer exists." });
    if (!brand.isActive) throw new ValidationError("Brand archived", { brandId: "That brand is archived. Restore it first or choose another." });
  }

  const wanted = [...(input.primaryCategoryId ? [input.primaryCategoryId] : []), ...input.categoryIds];
  if (wanted.length === 0) return;
  const found = new Map((await discover.findCategoriesByIds(wanted)).map((c) => [c.id, c]));
  const already = new Set(current?.categoryIds ?? []);
  if (input.primaryCategoryId) {
    const c = found.get(input.primaryCategoryId);
    if (!c) throw new ValidationError("Category not found", { primaryCategoryId: "That category no longer exists." });
    if (!c.isActive && !already.has(c.id)) throw new ValidationError("Category archived", { primaryCategoryId: "That category is archived. Choose another." });
  }
  if (input.categoryIds.some((id) => !found.has(id) || (!found.get(id)?.isActive && !already.has(id)))) {
    throw new ValidationError("Category problem", { categoryIds: "Choose categories from the list. Archived categories cannot be added." });
  }
}

/** Fields of the form to the rows saved with the product. New variants get their id here, so the write can refer to them. */
function toGraph(input: ProductInput, slug: string, existingVariantIds: ReadonlySet<string>): ProductGraph {
  const variants: VariantWrite[] = input.variants.map((v, index) => ({
    // An id the form sent is only trusted when this product really has such a variant; anything else becomes a new variant.
    id: v.id && existingVariantIds.has(v.id) ? v.id : crypto.randomUUID(),
    sku: v.sku,
    label: v.label,
    priceMinor: v.priceMinor,
    currency: v.currency,
    sortOrder: index,
  }));
  return {
    product: {
      slug,
      name: input.name,
      summary: input.summary,
      description: input.description,
      brandId: input.brandId,
      status: input.status as ProductStatus,
      publishAt: input.publishAt,
      isFeatured: input.isFeatured,
    },
    categoryLinks: [
      ...(input.primaryCategoryId ? [{ categoryId: input.primaryCategoryId, isPrimary: true }] : []),
      ...input.categoryIds.map((categoryId) => ({ categoryId, isPrimary: false })),
    ],
    attributes: input.attributes,
    tags: input.tags,
    variants,
  };
}

/** A SKU belongs to one variant. Clashes inside the form are caught by validation, clashes with other products here. */
async function assertSkusFree(input: ProductInput, productId: string | null) {
  const skus = input.variants.flatMap((v, index) => (v.sku ? [{ sku: v.sku, index }] : []));
  if (skus.length === 0) return;
  const clashes = new Set((await repo.selectSkuClashes(skus.map((s) => s.sku), productId)).map((c) => c.sku));
  const fields: Record<string, string> = {};
  for (const { sku, index } of skus) if (clashes.has(sku)) fields[`variants.${index}.sku`] = "Another product already uses this SKU";
  if (Object.keys(fields).length > 0) throw new ValidationError("SKU in use", fields);
}

function rethrowDuplicate(error: unknown): never {
  const constraint = uniqueViolationOf(error);
  if (constraint?.includes("slug")) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  if (constraint?.includes("sku")) throw new ValidationError("SKU in use", { "variants.0.sku": "A SKU is already used by another variant." });
  throw error;
}

/* -------------------------------- writing -------------------------------- */

export async function createProduct(input: ProductInput, actor: Actor): Promise<ProductRow> {
  const status = input.status as ProductStatus;
  const problem = creationStatusProblem(status) ?? statusChangeProblem(null, status, canPublish(actor));
  if (problem) throw new ValidationError("Status not allowed", { status: problem });

  await assertReferences(input, null);
  await assertSkusFree(input, null);
  const slug = await resolveCreateSlug({ name: input.name, explicit: input.slug, findTaken: repo.selectProductSlugsLike });

  const id = crypto.randomUUID();
  try {
    await repo.insertProductGraph(id, toGraph(input, slug, new Set()));
  } catch (error) {
    rethrowDuplicate(error);
  }
  await logAuditBestEffort({
    actor: actor.id,
    action: "product.created",
    entityType: "product",
    entityId: id,
    metadata: { slug, name: input.name, status, variants: input.variants.length },
  });
  touch();
  const created = await repo.selectProductById(id);
  if (!created) throw new Error("Product was not found after saving");
  return created;
}

export async function updateProduct(id: string, input: ProductInput, actor: Actor): Promise<ProductRow> {
  const current = await getProduct(id);
  const before = current.product;
  const status = input.status as ProductStatus;

  const problem = statusChangeProblem(before.status, status, canPublish(actor));
  if (problem) throw new ValidationError("Status not allowed", { status: problem });

  await assertReferences(input, { brandId: before.brandId, categoryIds: current.categoryIds });
  await assertSkusFree(input, id);
  const blockers = publishBlockers({
    status,
    primaryCategoryActive: input.primaryCategoryId ? (await discover.findCategoriesByIds([input.primaryCategoryId])).some((c) => c.isActive) : false,
    imageCount: current.images.length,
  });
  if (blockers.length > 0) throw new ValidationError("Not ready to publish", { status: `Not ready to ${status === "SCHEDULED" ? "schedule" : "publish"}: ${blockers.join(" ")}` });

  const slug = await resolveUpdateSlug({ current: before.slug, requested: input.slug, confirmed: input.confirmSlugChange, findTaken: repo.selectProductSlugsLike });
  const graph = toGraph(input, slug, new Set(current.variants.map((v) => v.id)));

  try {
    await repo.updateProductGraph(id, graph, new Set(current.variants.map((v) => v.id)));
  } catch (error) {
    rethrowDuplicate(error);
  }

  const changed = (["name", "summary", "description", "brandId", "status", "isFeatured"] as const).filter((key) => graph.product[key] !== before[key]);
  await logAuditBestEffort({
    actor: actor.id,
    action: "product.updated",
    entityType: "product",
    entityId: id,
    metadata: {
      changed,
      variants: input.variants.length,
      ...(slug !== before.slug ? { slug: { from: before.slug, to: slug } } : {}),
      ...(status !== before.status ? { status: { from: before.status, to: status } } : {}),
    },
  });
  touch();
  const updated = await repo.selectProductById(id);
  if (!updated) throw new NotFoundError("Product not found");
  return updated;
}

/** Archive (hide from visitors, keep everything). Needs product:publish. */
export async function archiveProduct(id: string, actor: Actor): Promise<void> {
  const current = await repo.selectProductById(id);
  if (!current) throw new NotFoundError("Product not found");
  if (current.status === "ARCHIVED") return;
  const problem = statusChangeProblem(current.status, "ARCHIVED", canPublish(actor));
  if (problem) throw new ConflictError(problem);
  await repo.updateProductStatusRow(id, "ARCHIVED", null);
  await logAuditBestEffort({ actor: actor.id, action: "product.archived", entityType: "product", entityId: id, metadata: { slug: current.slug, status: { from: current.status, to: "ARCHIVED" } } });
  touch();
}

/** Restoring brings an archived product back as a DRAFT, so nothing goes live by accident. */
export async function restoreProduct(id: string, actor: Actor): Promise<void> {
  const current = await repo.selectProductById(id);
  if (!current) throw new NotFoundError("Product not found");
  if (current.status !== "ARCHIVED" && current.status !== "DISCONTINUED") return;
  const problem = statusChangeProblem(current.status, "DRAFT", canPublish(actor));
  if (problem) throw new ConflictError(problem);
  await repo.updateProductStatusRow(id, "DRAFT", null);
  await logAuditBestEffort({ actor: actor.id, action: "product.restored", entityType: "product", entityId: id, metadata: { slug: current.slug, status: { from: current.status, to: "DRAFT" } } });
  touch();
}

export async function deleteProduct(id: string, actor: Actor): Promise<void> {
  const current = await repo.selectProductById(id);
  if (!current) throw new NotFoundError("Product not found");
  const problem = deleteProblem({ status: current.status, affiliateLinks: await repo.countAffiliateLinksForProduct(id) });
  if (problem) throw new ConflictError(problem);
  await repo.deleteProductRow(id);
  await logAuditBestEffort({ actor: actor.id, action: "product.deleted", entityType: "product", entityId: id, metadata: { slug: current.slug, name: current.name } });
  touch();
}

/* --------------------------------- images --------------------------------- */

/**
 * Attaches an image the browser has just uploaded to Cloudinary. The upload response is verified first (signature,
 * folder, format, size); an upload that breaks a rule is removed from Cloudinary again. A file that is already in
 * the library is reused and the new copy removed, so one picture is stored once.
 */
export async function addProductImage(
  productId: string,
  upload: UploadResult,
  alt: string | null,
  actor: Actor,
  deps: { apiSecret: string; removeFromCloudinary: (publicId: string) => Promise<boolean> },
): Promise<ProductImageRow> {
  const product = await repo.selectProductById(productId);
  if (!product) throw new NotFoundError("Product not found");

  const problem = uploadProblem(upload, deps.apiSecret);
  if (problem) {
    // The signature proves Cloudinary stored the file, so a rule failure means a stray file: delete it.
    if (problem !== "The upload could not be verified. Try again.") await deps.removeFromCloudinary(upload.public_id);
    throw new ValidationError("Upload rejected", { image: problem });
  }
  if ((await repo.countImages(productId)) >= MAX_IMAGES_PER_PRODUCT) {
    await deps.removeFromCloudinary(upload.public_id);
    throw new ConflictError(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`);
  }

  const { asset, duplicate } = await media.recordUpload(
    { publicId: upload.public_id, contentHash: upload.etag ?? null, width: upload.width, height: upload.height, bytes: upload.bytes, alt },
    actor.id,
  );
  if (duplicate) await deps.removeFromCloudinary(upload.public_id);

  const existing = await repo.selectImages(productId);
  if (existing.some((i) => i.publicId === asset.publicId)) throw new ConflictError("This image is already on the product.");

  const image = await repo.insertImage({
    productId,
    publicId: asset.publicId,
    alt: (alt && alt.trim()) || asset.alt || product.name,
    sortOrder: existing.length,
  });
  await logAuditBestEffort({ actor: actor.id, action: "product.image_added", entityType: "product", entityId: productId, metadata: { publicId: asset.publicId, reused: duplicate } });
  touch();
  return image;
}

async function imageOf(productId: string, imageId: string) {
  const image = await repo.selectImageById(imageId);
  if (!image || image.productId !== productId) throw new NotFoundError("Image not found");
  return image;
}

export async function updateProductImageAlt(productId: string, imageId: string, alt: string, actor: Actor): Promise<void> {
  const image = await imageOf(productId, imageId);
  if (image.alt === alt) return;
  await repo.updateImageAltRow(imageId, alt);
  await logAuditBestEffort({ actor: actor.id, action: "product.image_alt_updated", entityType: "product", entityId: productId, metadata: { publicId: image.publicId } });
  touch();
}

/** Removes the image from the product. The file stays in the media library (see the unused-images report). */
export async function removeProductImage(productId: string, imageId: string, actor: Actor): Promise<void> {
  const image = await imageOf(productId, imageId);
  const product = await repo.selectProductById(productId);
  if (product && (product.status === "PUBLISHED" || product.status === "SCHEDULED") && (await repo.countImages(productId)) <= 1) {
    throw new ConflictError("A published or scheduled product needs at least one image. Add another first, or archive the product.");
  }
  await repo.deleteImageRow(imageId);
  const rest = (await repo.selectImages(productId)).map((i) => i.id);
  await repo.setImageOrder(productId, rest);
  await logAuditBestEffort({ actor: actor.id, action: "product.image_removed", entityType: "product", entityId: productId, metadata: { publicId: image.publicId } });
  touch();
}

/** Moves one image one place up or down. The first image is the one shown on cards and as the main picture. */
export async function moveProductImage(productId: string, imageId: string, direction: "up" | "down", actor: Actor): Promise<void> {
  await imageOf(productId, imageId);
  const ids = (await repo.selectImages(productId)).map((i) => i.id);
  const from = ids.indexOf(imageId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  await repo.setImageOrder(productId, ids);
  await logAuditBestEffort({ actor: actor.id, action: "product.image_moved", entityType: "product", entityId: productId, metadata: { direction } });
  touch();
}
