"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import { moveDirectionSchema } from "@/modules/homepage/validation";
import * as service from "@/modules/navigation/service";
import { idSchema, navItemInputSchema } from "@/modules/navigation/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createNavItemAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.homepageWrite);
    const parsed = navItemInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createItem(parsed.data, session.user.id);
    return { redirectTo: "/admin/navigation?notice=created" };
  });
}

export async function updateNavItemAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.homepageWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That link does not exist.", values: stringValues(raw) };
    const parsed = navItemInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateItem(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/navigation?notice=updated" };
  });
}

export async function deleteNavItemAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.homepageWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That link does not exist." };
    await service.deleteItem(entityId.data, session.user.id);
    return { ok: true, message: "Link deleted.", redirectTo: "/admin/navigation?notice=deleted" };
  });
}

async function listButton(work: (actorId: string) => Promise<void>, notice: string): Promise<void> {
  let target = `/admin/navigation?notice=${notice}`;
  try {
    const session = await requirePermission(P.homepageWrite);
    await work(session.user.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) target = "/admin-login";
    else {
      if (!(error instanceof ForbiddenError)) console.error("Navigation action failed", error);
      target = "/admin/navigation?notice=failed";
    }
  }
  redirect(target);
}

export async function moveNavItemAction(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("id"));
  const direction = moveDirectionSchema.safeParse(formData.get("direction"));
  if (!id.success || !direction.success) return redirect("/admin/navigation?notice=failed");
  await listButton((actor) => service.moveItem(id.data, direction.data, actor), "moved");
}

export async function toggleNavItemAction(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return redirect("/admin/navigation?notice=failed");
  const enable = formData.get("enable") === "1";
  await listButton((actor) => service.setActive(id.data, enable, actor), enable ? "enabled" : "disabled");
}
