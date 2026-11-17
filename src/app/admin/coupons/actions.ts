"use server";

import { PERMISSIONS as P } from "@/core/permissions";
import { requirePermission } from "@/core/permissions/require";
import { formDataToObject } from "@/core/validation/fields";
import * as service from "@/modules/deals/service";
import { couponInputSchema, idSchema } from "@/modules/deals/validation";
import { invalidForm, runAction, runFormAction, stringValues, type Failure } from "@/shared/admin/action-helpers";
import type { ActionResult, FormState } from "@/shared/admin/form-state";

export async function createCouponAction(_prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.dealWrite);
    const parsed = couponInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.createCoupon(parsed.data, session.user.id);
    return { redirectTo: "/admin/coupons?notice=created" };
  });
}

export async function updateCouponAction(id: string, _prev: FormState, formData: FormData): Promise<Failure> {
  const raw = formDataToObject(formData);
  return runFormAction(raw, async () => {
    const session = await requirePermission(P.dealWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That coupon does not exist.", values: stringValues(raw) };
    const parsed = couponInputSchema.safeParse(raw);
    if (!parsed.success) return invalidForm(raw, parsed.error);
    await service.updateCoupon(entityId.data, parsed.data, session.user.id);
    return { redirectTo: "/admin/coupons?notice=updated" };
  });
}

export async function deleteCouponAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requirePermission(P.dealWrite);
    const entityId = idSchema.safeParse(id);
    if (!entityId.success) return { ok: false, error: "That coupon does not exist." };
    await service.deleteCoupon(entityId.data, session.user.id);
    return { ok: true, message: "Coupon deleted.", redirectTo: "/admin/coupons?notice=deleted" };
  });
}
