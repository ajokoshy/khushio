import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime, toAdminDateTimeInput } from "@/core/validation/datetime";
import { idSchema } from "@/core/validation/fields";
import { getLinkFormOptions } from "@/modules/affiliate/service";
import { getDeal } from "@/modules/deals/service";
import { DEAL_STATE_LABELS, DEAL_STATUS_LABELS, DEAL_STATUSES, DEAL_TYPE_LABELS, DEAL_TYPES } from "@/modules/deals/types";
import { dealState } from "@/modules/deals/window";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { deleteDealAction, updateDealAction } from "../actions";
import { DealForm } from "../deal-form";

export const metadata = { title: "Edit deal", robots: { index: false } };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission(P.dealWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  let loaded: Awaited<ReturnType<typeof getDeal>>;
  try {
    loaded = await getDeal(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { deal, productSlugs, categorySlugs } = loaded;
  const { merchants } = await getLinkFormOptions();
  const state = dealState(deal);

  return (
    <>
      <p className="text-sm"><Link href="/admin/deals" className="text-ink-600 underline">← Deals</Link></p>
      <h1 className="mt-2 text-3xl">{deal.title}</h1>
      <p className="mt-2 text-sm text-ink-600">
        {DEAL_STATE_LABELS[state]} · {formatAdminDateTime(deal.startsAt)} to {deal.endsAt ? formatAdminDateTime(deal.endsAt) : "no end date"} · {deal.couponCount} coupon{deal.couponCount === 1 ? "" : "s"} ·{" "}
        <Link href={`/admin/coupons/new?deal=${deal.slug}`} className="underline">Add a coupon</Link>
      </p>
      {!deal.merchantActive && <p role="alert" className="mt-4 max-w-xl rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">The store {deal.merchantName} is archived, so this offer is hidden from visitors.</p>}
      <div className="mt-6">
        <DealForm
          mode="edit"
          action={updateDealAction.bind(null, id)}
          initial={{
            title: deal.title, slug: deal.slug, merchantId: deal.merchantId, type: deal.type, description: deal.description ?? "", affiliateLinkSlug: deal.affiliateLinkSlug ?? "",
            startsAt: toAdminDateTimeInput(deal.startsAt), endsAt: toAdminDateTimeInput(deal.endsAt), isFeatured: deal.isFeatured, sortOrder: String(deal.sortOrder), status: deal.status,
            productSlugs: productSlugs.join("\n"), categorySlugs: categorySlugs.join("\n"),
          }}
          merchants={merchants}
          types={DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] }))}
          statuses={DEAL_STATUSES.map((s) => ({ value: s, label: DEAL_STATUS_LABELS[s] }))}
          cancelHref="/admin/deals"
        />
      </div>
      <section className="mt-10 max-w-xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Delete</h2>
        <p className="mt-2 text-sm text-ink-600">Deleting removes the deal and its coupons. To keep a record, set the status to Archived instead.</p>
        <div className="mt-4"><ConfirmActionButton label="Delete" destructive title="Delete this deal?" description="The deal and its coupons are removed. This cannot be undone." action={deleteDealAction.bind(null, id)} /></div>
      </section>
    </>
  );
}
