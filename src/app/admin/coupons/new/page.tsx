import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/core/validation/money";
import { SLUG_PATTERN } from "@/core/validation/slug";
import { getLinkFormOptions } from "@/modules/affiliate/service";
import { DISCOUNT_TYPE_LABELS, DISCOUNT_TYPES } from "@/modules/deals/types";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { createCouponAction } from "../actions";
import { CouponForm } from "../coupon-form";

export const metadata = { title: "New coupon", robots: { index: false } };

export default async function NewCouponPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.dealWrite);
  const { merchants } = await getLinkFormOptions();
  const wanted = firstParam((await searchParams).deal) ?? "";
  const dealSlug = SLUG_PATTERN.test(wanted) && wanted.length <= 80 ? wanted : "";
  return (
    <>
      <p className="text-sm"><Link href="/admin/coupons" className="text-ink-600 underline">← Coupons</Link></p>
      <h1 className="mt-2 text-3xl">New coupon</h1>
      <div className="mt-6">
        <CouponForm mode="create" action={createCouponAction} initial={{ merchantId: "", dealSlug, code: "", discountType: "percent", discountValue: "", currency: DEFAULT_CURRENCY, minSpend: "", startsAt: "", endsAt: "", isActive: true }} merchants={merchants} discountTypes={DISCOUNT_TYPES.map((d) => ({ value: d, label: DISCOUNT_TYPE_LABELS[d] }))} currencies={CURRENCY_CODES} cancelHref="/admin/coupons" />
      </div>
    </>
  );
}
