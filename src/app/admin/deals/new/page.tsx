import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { getLinkFormOptions } from "@/modules/affiliate/service";
import { DEAL_STATUS_LABELS, DEAL_STATUSES, DEAL_TYPE_LABELS, DEAL_TYPES } from "@/modules/deals/types";
import { createDealAction } from "../actions";
import { DealForm } from "../deal-form";

export const metadata = { title: "New deal", robots: { index: false } };

export default async function NewDealPage() {
  await requirePagePermission(P.dealWrite);
  const { merchants } = await getLinkFormOptions();
  return (
    <>
      <p className="text-sm"><Link href="/admin/deals" className="text-ink-600 underline">← Deals</Link></p>
      <h1 className="mt-2 text-3xl">New deal</h1>
      <div className="mt-6">
        <DealForm
          mode="create"
          action={createDealAction}
          initial={{ title: "", slug: "", merchantId: "", type: "deal", description: "", affiliateLinkSlug: "", startsAt: "", endsAt: "", isFeatured: false, sortOrder: "0", status: "draft", productSlugs: "", categorySlugs: "" }}
          merchants={merchants}
          types={DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] }))}
          statuses={DEAL_STATUSES.map((s) => ({ value: s, label: DEAL_STATUS_LABELS[s] }))}
          cancelHref="/admin/deals"
        />
      </div>
    </>
  );
}
