"use server";

import { z } from "zod";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { createUploadSignature, apiSecret, destroyAsset, type UploadSignature } from "@/infrastructure/cloudinary";
import type { UploadResult } from "@/infrastructure/cloudinary/upload-rules";
import { productFormToObject } from "@/modules/products/form";
import * as service from "@/modules/products/service";
import { altTextSchema, idSchema, productInputSchema } from "@/modules/products/validation";
import { invalidForm, runAction, runDataAction, runFormAction, stringValues, type DataResult, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

/** Every action: permission first, then validation, then the service (rules, write, audit, cache tags). */

function actorOf(session: Awaited<ReturnType<typeof requirePermission>>) {
  return { id: session.user.id, permissions: session.user.permissions };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = productFormToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.productWrite);
    const parsed = productInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    const created = await service.createProduct(parsed.data, actorOf(session));
    // A new product goes straight to its edit screen, where the images are added.
    return { redirectTo: `/admin/products/${created.id}?notice=created` };
  });
}

export async function updateProductAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = productFormToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.productWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That product does not exist.", values: stringValues(raw) };
    const parsed = productInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateProduct(entityId.data, parsed.data, actorOf(session));
    return { redirectTo: `/admin/products/${entityId.data}?notice=updated` };
  });
}

type Change = (id: string, actor: ReturnType<typeof actorOf>) => Promise<void>;

async function oneClick(id: string, change: Change, message: string, redirectTo?: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.productWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That product does not exist." };
    await change(entityId.data, actorOf(session));
    return { ok: true, message, redirectTo };
  });
}

export async function archiveProductAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.archiveProduct, "Product archived.");
}

export async function restoreProductAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.restoreProduct, "Product restored as a draft.");
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  return oneClick(id, service.deleteProduct, "Product deleted.", "/admin/products?notice=deleted");
}

/* --------------------------------- images --------------------------------- */

/** Signed parameters for one browser upload straight to Cloudinary. The API secret stays on the server. */
export async function getUploadSignatureAction(): Promise<DataResult<UploadSignature>> {
  return runDataAction(async () => {
    await requirePermission(P.productWrite);
    return createUploadSignature();
  });
}

/** What the browser reports after uploading. Anything not listed here is ignored; the service verifies the signature and the rules. */
const uploadSchema = z.object({
  public_id: z.string().min(1).max(255),
  version: z.number().int().positive(),
  signature: z.string().min(10).max(128),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  format: z.string().min(1).max(10),
  resource_type: z.string().max(20),
  etag: z.string().min(8).max(64).optional(),
});

export async function addProductImageAction(productId: string, upload: unknown, alt: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.productWrite);
    const id = idSchema.safeParse(productId);
    const parsed = uploadSchema.safeParse(upload);
    if (!id.success || !parsed.success) return { ok: false, error: "The upload result was not understood. Try again." };
    const altText = alt.trim().slice(0, 200);
    await service.addProductImage(id.data, parsed.data satisfies UploadResult, altText || null, actorOf(session), { apiSecret: apiSecret(), removeFromCloudinary: destroyAsset });
    return { ok: true, message: "Image added." };
  });
}

async function imageChange(productId: string, imageId: string, work: (p: string, i: string, actor: ReturnType<typeof actorOf>) => Promise<void>, message: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.productWrite);
    const p = idSchema.safeParse(productId);
    const i = idSchema.safeParse(imageId);
    if (!p.success || !i.success) return { ok: false, error: "That image does not exist." };
    await work(p.data, i.data, actorOf(session));
    return { ok: true, message };
  });
}

export async function updateProductImageAltAction(productId: string, imageId: string, alt: string): Promise<ActionResult> {
  const parsed = altTextSchema.safeParse(alt);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a description." };
  return imageChange(productId, imageId, (p, i, actor) => service.updateProductImageAlt(p, i, parsed.data, actor), "Description saved.");
}

export async function removeProductImageAction(productId: string, imageId: string): Promise<ActionResult> {
  return imageChange(productId, imageId, service.removeProductImage, "Image removed.");
}

export async function moveProductImageAction(productId: string, imageId: string, direction: "up" | "down"): Promise<ActionResult> {
  if (direction !== "up" && direction !== "down") return { ok: false, error: "Unknown direction." };
  return imageChange(productId, imageId, (p, i, actor) => service.moveProductImage(p, i, direction, actor), "Order saved.");
}
