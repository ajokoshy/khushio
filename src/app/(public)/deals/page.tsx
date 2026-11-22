import { buildMetadata } from "@/modules/seo/metadata";
import { getDealsPage } from "@/modules/deals/public";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { DealGrid, StandaloneCoupons } from "@/shared/deals/deal-list";

// Same as CACHE_TTL.deals (5 minutes). The offers are also filtered with the clock at every rebuild.
export const revalidate = 300;

export const metadata = buildMetadata({
  title: "Deals and coupons",
  description: "Current offers and coupon codes from the stores on Khushio. Expired offers are removed automatically.",
  path: "/deals",
});

/** `next build` without a database (CI, forks) prerenders an empty list; the 5-minute revalidate fills it in at runtime. */
const buildingWithoutDatabase = process.env.NEXT_PHASE === "phase-production-build" && !process.env.DATABASE_URL;

export default async function DealsPage() {
  const { deals, coupons } = buildingWithoutDatabase ? { deals: [], coupons: [] } : await getDealsPage();
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Deals" }]} />
      <h1 className="mt-4 text-3xl">Deals and coupons</h1>
      <p className="mt-2 max-w-prose text-ink-600">Current offers from our stores. We may earn a commission if you buy through these links, at no extra cost to you.</p>

      <div className="mt-6">
        {deals.length > 0 ? <DealGrid deals={deals} /> : <p className="rounded-card border border-cream-200 bg-cream-50 p-6 text-ink-600">No offers right now. Check back soon.</p>}
      </div>

      {coupons.length > 0 && (
        <section aria-labelledby="coupons-heading" className="mt-10">
          <h2 id="coupons-heading" className="text-xl">Coupon codes</h2>
          <div className="mt-3"><StandaloneCoupons coupons={coupons} /></div>
        </section>
      )}
    </section>
  );
}
