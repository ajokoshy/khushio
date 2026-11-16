"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/affiliate/service";
import { idSchema, linkInputSchema } from "@/modules/affiliate/validation";
import { describeBatch, verifyLink, verifyStaleLinks } from "@/modules/affiliate/verify";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createLinkAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const parsed = linkInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createLink(parsed.data, session.user.id);
    return { redirectTo: "/admin/links?notice=created" };
  });
}

export async function updateLinkAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That link does not exist.", values: stringValues(raw) };
    const parsed = linkInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateLink(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/links?notice=updated" };
  });
}

export async function deleteLinkAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That link does not exist." };
    await service.deleteLink(entityId.data, session.user.id);
    return { ok: true, message: "Link deleted.", redirectTo: "/admin/links?notice=deleted" };
  });
}

/** One HEAD request to the destination. A working link is a success; anything else is shown as a warning message. */
export async function verifyLinkAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That link does not exist." };
    const result = await verifyLink(entityId.data, session.user.id);
    return result.outcome === "ok" ? { ok: true, message: result.message } : { ok: false, error: result.message };
  });
}

/** The ten links checked longest ago (or never). */
export async function verifyStaleLinksAction(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.affiliateWrite);
    const summary = await verifyStaleLinks(session.user.id);
    return summary.problem + summary.unreachable + summary.refused > 0 ? { ok: false, error: describeBatch(summary) } : { ok: true, message: describeBatch(summary) };
  });
}
