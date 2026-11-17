import Link from "next/link";
import { describeDiscount, describeMinSpend } from "@/modules/deals/discount";
import { DEAL_TYPE_LABELS, type DealType, type PublicCoupon, type PublicDeal, type PublicStandaloneCoupon } from "@/modules/deals/types";
import { AffiliateLink } from "@/shared/catalog/affiliate-link";
import { CouponReveal } from "./coupon-reveal";
import { LiveWindow } from "./live-window";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function endsText(endsAt: string | null): string {
  return endsAt ? `Ends ${dateFormat.format(new Date(endsAt))}` : "";
}

function CouponLine({ coupon, linkSlug }: { coupon: PublicCoupon; linkSlug: string | null }) {
  const what = [describeDiscount(coupon.discountType, coupon.discountValue, coupon.currency), describeMinSpend(coupon.minSpendMinor, coupon.currency)].filter(Boolean).join(" · ");
  return (
    <LiveWindow startsAt={coupon.startsAt} endsAt={coupon.endsAt}>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {what && <span className="text-sm">{what}</span>}
        <CouponReveal code={coupon.code} linkSlug={linkSlug} />
        {coupon.endsAt && <span className="text-xs text-ink-600">{endsText(coupon.endsAt)}</span>}
      </div>
    </LiveWindow>
  );
}

/** One offer: title, store, what it applies to, the end date, its coupon codes and its button. */
export function DealCard({ deal, showStore = true }: { deal: PublicDeal; showStore?: boolean }) {
  return (
    <LiveWindow startsAt={deal.startsAt} endsAt={deal.endsAt}>
      <article className="rounded-card border border-cream-200 bg-cream-50 p-5">
        <p className="text-xs uppercase tracking-wide text-ink-600">
          {DEAL_TYPE_LABELS[deal.type as DealType] ?? "Deal"}
          {showStore && <> · <Link href={`/stores/${deal.merchantSlug}`} className="hover:underline">{deal.merchantName}</Link></>}
          {deal.isFeatured && <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 normal-case text-coral-600">Featured</span>}
        </p>
        <h3 className="mt-1 text-lg">{deal.title}</h3>
        {deal.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-600">{deal.description}</p>}
        {deal.scope !== "store" && <p className="mt-2 text-xs text-ink-600">{deal.scope === "products" ? "For selected products" : "For selected categories"}</p>}
        {deal.coupons.map((c) => <CouponLine key={c.id} coupon={c} linkSlug={deal.linkSlug} />)}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {deal.linkSlug && <AffiliateLink slug={deal.linkSlug}>Get this deal</AffiliateLink>}
          {deal.endsAt && <span className="text-xs text-ink-600">{endsText(deal.endsAt)}</span>}
        </div>
      </article>
    </LiveWindow>
  );
}

export function DealGrid({ deals, showStore = true }: { deals: readonly PublicDeal[]; showStore?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {deals.map((d) => <DealCard key={d.id} deal={d} showStore={showStore} />)}
    </div>
  );
}

export function StandaloneCoupons({ coupons }: { coupons: readonly PublicStandaloneCoupon[] }) {
  return (
    <ul className="divide-y divide-cream-200 rounded-card border border-cream-200 bg-cream-50">
      {coupons.map((c) => (
        <li key={c.id} className="px-5 py-4">
          <LiveWindow startsAt={c.startsAt} endsAt={c.endsAt}>
            <p className="text-sm font-medium"><Link href={`/stores/${c.merchantSlug}`} className="hover:underline">{c.merchantName}</Link></p>
            <CouponLine coupon={c} linkSlug={null} />
          </LiveWindow>
        </li>
      ))}
    </ul>
  );
}
