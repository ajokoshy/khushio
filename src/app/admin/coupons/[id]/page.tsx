import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { idSchema } from "@/core/validation/fields";
import { CURRENCY_CODES, minorToInput, isCurrencyCode } from "@/core/validation/money";
import { getLinkFormOptions } from "@/modules/affiliate/service";
import { discountValueToInput } from "@/modules/deals/discount";
import { getCoupon } from "@/modules/deals/service";
import { DISCOUNT_TYPE_LABELS, DISCOUNT_TYPES } from "@/modules/deals/types";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { deleteCouponAction, updateCouponAction } from "../actions";
import { CouponForm } from "../coupon-form";

export const metadata = { title: "Edit coupon", robots: { index: false } };

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.dealWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  let coupon: Awaited<ReturnType<typeof getCoupon>>;
  try {
    coupon = await getCoupon(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { merchants } = await getLinkFormOptions();
  const currency = isCurrencyCode(coupon.currency) ? coupon.currency : "INR";
  return (
    <>
      <p className="text-sm"><Link href="/admin/coupons" className="text-ink-600 underline">← Coupons</Link></p>
      <h1 className="mt-2 font-mono text-3xl">{coupon.code}</h1>
      <div className="mt-6">
        <CouponForm
          mode="edit"
          action={updateCouponAction.bind(null, id)}
          initial={{ merchantId: coupon.merchantId, dealSlug: coupon.dealSlug ?? "", code: coupon.code, discountType: coupon.discountType, discountValue: discountValueToInput(coupon.discountType, coupon.discountValue, coupon.currency), currency, minSpend: minorToInput(coupon.minSpendMinor, currency), startsAt: toAdminDateTimeInput(coupon.startsAt), endsAt: toAdminDateTimeInput(coupon.endsAt), isActive: coupon.isActive }}
          merchants={merchants}
          discountTypes={DISCOUNT_TYPES.map((d) => ({ value: d, label: DISCOUNT_TYPE_LABELS[d] }))}
          currencies={CURRENCY_CODES}
          cancelHref="/admin/coupons"
        />
      </div>
      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6">
        <h2 className="text-xl">Delete</h2>
        <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this coupon?" description="This cannot be undone. To hide it for now, untick Active instead." action={deleteCouponAction.bind(null, id)} /></div>
      </section>
    </>
  );
}
