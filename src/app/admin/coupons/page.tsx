import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { describeDiscount } from "@/modules/deals/discount";
import { listCoupons } from "@/modules/deals/service";
import type { CouponRow } from "@/modules/deals/types";
import { isCouponLive } from "@/modules/deals/window";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";

export const metadata = { title: "Coupons", robots: { index: false } };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.dealWrite);
  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const { rows, hasNext } = await listCoupons({ q, limit: pageSize, offset });
  const now = new Date();

  const columns: Column<CouponRow>[] = [
    { key: "code", header: "Code", cell: (c) => <Link href={`/admin/coupons/${c.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{c.code}</Link> },
    { key: "store", header: "Store", cell: (c) => c.merchantName },
    { key: "deal", header: "Deal", cell: (c) => c.dealTitle ?? <span className="text-ink-600">Stand-alone</span> },
    { key: "discount", header: "Discount", cell: (c) => describeDiscount(c.discountType, c.discountValue, c.currency) || "-" },
    { key: "runs", header: "Runs", cell: (c) => <span className="text-xs">{formatAdminDateTime(c.startsAt)}<br />{c.endsAt ? `to ${formatAdminDateTime(c.endsAt)}` : "no end date"}</span> },
    { key: "state", header: "Now", cell: (c) => (isCouponLive(c, now) ? <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs">Live</span> : <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">Not showing</span>) },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Coupons</h1>
          <p className="mt-2 text-ink-600">Codes visitors reveal and copy. A code inside a deal shows only while that deal is live as well.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/deals" className="rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100">Deals</Link>
          <Link href="/admin/coupons/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New coupon</Link>
        </div>
      </div>
      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/coupons" q={q} placeholder="Search code, store or deal" />
        <DataTable caption="Coupons" columns={columns} rows={rows} getRowKey={(c) => c.id} empty={<EmptyState title="No coupons yet" description="Add a code for a store or for one of your deals." action={<Link href="/admin/coupons/new" className="font-medium text-coral-600 underline">Create the first coupon</Link>} />} />
        <Pagination basePath="/admin/coupons" params={{ q }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
