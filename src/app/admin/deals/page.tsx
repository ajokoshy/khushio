import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { listDeals } from "@/modules/deals/service";
import { DEAL_STATE_LABELS, DEAL_TYPE_LABELS, type DealRow, type DealType } from "@/modules/deals/types";
import { DEAL_STATE_FILTER_OPTIONS, dealStateFilterSchema } from "@/modules/deals/validation";
import { dealState } from "@/modules/deals/window";
import { idSchema } from "@/core/validation/fields";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { archiveDealsAction, expireDealsAction, featureDealsAction, saveDealOrderAction, unfeatureDealsAction } from "./actions";

export const metadata = { title: "Deals", robots: { index: false } };

const stateClass: Record<string, string> = { live: "bg-forest-100", scheduled: "bg-cream-200", expired: "bg-coral-100 text-coral-600", draft: "bg-cream-200", archived: "bg-coral-100 text-coral-600" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.dealWrite);
  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const state = dealStateFilterSchema.parse(firstParam(sp.state));
  const merchantParam = idSchema.safeParse(firstParam(sp.store));
  const merchantId = merchantParam.success ? merchantParam.data : undefined;
  const { rows, hasNext } = await listDeals({ q, state, merchantId, limit: pageSize, offset });
  const filtered = !!q || state !== "all" || !!merchantId;
  const now = new Date();

  const columns: Column<DealRow>[] = [
    { key: "pick", header: "Tick", cell: (d) => <input type="checkbox" name="ids" value={d.id} form="bulk" aria-label={`Select ${d.title}`} /> },
    { key: "title", header: "Deal", cell: (d) => <><Link href={`/admin/deals/${d.id}`} className="font-medium underline-offset-2 hover:underline">{d.title}</Link>{d.isFeatured && <span className="ml-2 rounded-full bg-forest-100 px-2 py-0.5 text-xs">Featured</span>}<span className="block text-xs text-ink-600">{DEAL_TYPE_LABELS[d.type as DealType] ?? d.type} · {d.productCount > 0 ? `${d.productCount} product${d.productCount === 1 ? "" : "s"}` : d.categoryCount > 0 ? `${d.categoryCount} categor${d.categoryCount === 1 ? "y" : "ies"}` : "whole store"}{d.couponCount > 0 ? ` · ${d.couponCount} coupon${d.couponCount === 1 ? "" : "s"}` : ""}</span></> },
    { key: "store", header: "Store", cell: (d) => d.merchantName },
    { key: "state", header: "State", cell: (d) => { const s = dealState(d, now); return <span className={`rounded-full px-2 py-0.5 text-xs ${stateClass[s] ?? ""}`}>{DEAL_STATE_LABELS[s]}</span>; } },
    { key: "dates", header: "Runs", cell: (d) => <span className="text-xs">{formatAdminDateTime(d.startsAt)}<br />{d.endsAt ? `to ${formatAdminDateTime(d.endsAt)}` : "no end date"}</span> },
    { key: "order", header: "Order", cell: (d) => <input type="text" inputMode="numeric" name={`order_${d.id}`} form="order" defaultValue={String(d.sortOrder)} aria-label={`Order of ${d.title}`} className="w-16 rounded-lg border border-cream-200 bg-cream-50 px-2 py-1 text-sm" /> },
  ];
  const btn = "rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Deals</h1>
          <p className="mt-2 text-ink-600">Offers shown on /deals, product pages and store pages. An offer shows only while it is Published and inside its dates.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/coupons" className="rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100">Coupons</Link>
          <Link href="/admin/deals/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New deal</Link>
        </div>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/deals" q={q} placeholder="Search title or slug">
          <div>
            <label htmlFor="state" className="sr-only">State</label>
            <select id="state" name="state" defaultValue={state} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              {DEAL_STATE_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </ListToolbar>

        {rows.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Actions for the ticked deals">
            <form id="bulk" className="contents">
              <button type="submit" formAction={featureDealsAction} formMethod="post" className={btn}>Feature</button>
              <button type="submit" formAction={unfeatureDealsAction} formMethod="post" className={btn}>Unfeature</button>
              <button type="submit" formAction={expireDealsAction} formMethod="post" className={btn}>End now</button>
              <button type="submit" formAction={archiveDealsAction} formMethod="post" className={btn}>Archive</button>
            </form>
            <form id="order" action={saveDealOrderAction} className="contents">
              <button type="submit" className="rounded-xl bg-forest-800 px-3 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700">Save order</button>
            </form>
          </div>
        )}

        <DataTable
          caption="Deals"
          columns={columns}
          rows={rows}
          getRowKey={(d) => d.id}
          empty={filtered ? <EmptyState title="No deals match" description="Try a different search, or reset the filters." /> : <EmptyState title="No deals yet" description="Create a deal, give it dates and publish it. It then appears on /deals by itself." action={<Link href="/admin/deals/new" className="font-medium text-coral-600 underline">Create the first deal</Link>} />}
        />
        <Pagination basePath="/admin/deals" params={{ q, state: state === "all" ? undefined : state }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
