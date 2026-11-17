"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/deals/service";
import { bulkIdsSchema, dealInputSchema, idSchema } from "@/modules/deals/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createDealAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.dealWrite);
    const parsed = dealInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createDeal(parsed.data, session.user.id);
    return { redirectTo: "/admin/deals?notice=created" };
  });
}

export async function updateDealAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.dealWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That deal does not exist.", values: stringValues(raw) };
    const parsed = dealInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateDeal(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/deals?notice=updated" };
  });
}

export async function deleteDealAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.dealWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That deal does not exist." };
    await service.deleteDeal(entityId.data, session.user.id);
    return { ok: true, message: "Deal deleted.", redirectTo: "/admin/deals?notice=deleted" };
  });
}

/**
 * The list page's buttons (feature, unfeature, end now, archive, save order) are plain form buttons that post the ticked
 * rows. They always end by redirecting back to the list with a notice code, so they work without JavaScript.
 */
async function bulk(formData: FormData, work: (ids: string[], actorId: string) => Promise<number>, notice: string): Promise<void> {
  let target = `/admin/deals?notice=${notice}`;
  try {
    const session = await requirePermission(P.dealWrite);
    const ids = bulkIdsSchema.safeParse(formData.getAll("ids").filter((v): v is string => typeof v === "string"));
    if (!ids.success) target = "/admin/deals?notice=nothing";
    else if ((await work(ids.data, session.user.id)) === 0) target = "/admin/deals?notice=nothing";
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else {
      if (!(error instanceof ForbiddenError)) console.error("Deal bulk action failed", error);
      target = "/admin/deals?notice=failed";
    }
  }
  redirect(target);
}

export async function featureDealsAction(formData: FormData): Promise<void> {
  await bulk(formData, (ids, actor) => service.setFeatured(ids, true, actor), "featured");
}
export async function unfeatureDealsAction(formData: FormData): Promise<void> {
  await bulk(formData, (ids, actor) => service.setFeatured(ids, false, actor), "featured");
}
export async function expireDealsAction(formData: FormData): Promise<void> {
  await bulk(formData, (ids, actor) => service.expireNow(ids, actor), "expired");
}
export async function archiveDealsAction(formData: FormData): Promise<void> {
  await bulk(formData, (ids, actor) => service.archiveMany(ids, actor), "archived");
}

/** Reads every `order_<id>` field of the page and saves them together. */
export async function saveDealOrderAction(formData: FormData): Promise<void> {
  let target = "/admin/deals?notice=reordered";
  try {
    const session = await requirePermission(P.dealWrite);
    const pairs: { id: string; sortOrder: number }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("order_") || typeof value !== "string") continue;
      const id = idSchema.safeParse(key.slice(6));
      const n = Number(value.trim());
      if (!id.success || value.trim() === "" || !Number.isInteger(n)) { target = "/admin/deals?notice=failed"; break; }
      pairs.push({ id: id.data, sortOrder: n });
    }
    if (target.endsWith("reordered")) await service.saveOrder(pairs.slice(0, 100), session.user.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else target = "/admin/deals?notice=failed";
  }
  redirect(target);
}
