import Link from "next/link";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { listLinks } from "@/modules/affiliate/service";
import type { LinkListRow } from "@/modules/affiliate/types";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";
import { verifyStaleLinksAction } from "./actions";

export const metadata = { title: "Affiliate links", robots: { index: false } };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid address";
  }
}

export default async function LinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.affiliateRead);
  const canWrite = hasPermission(session.user.permissions, P.affiliateWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listLinks({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  const columns: Column<LinkListRow>[] = [
    { key: "slug", header: "Link", cell: (l) => (canWrite ? <Link href={`/admin/links/${l.id}`} className="font-medium underline-offset-2 hover:underline">{l.slug}</Link> : <span className="font-medium">{l.slug}</span>) },
    { key: "merchant", header: "Merchant", cell: (l) => l.merchantName },
    { key: "product", header: "Product", cell: (l) => l.productName ?? <span className="text-ink-600">-</span> },
    {
      key: "destination",
      header: "Destination",
      cell: (l) => (
        <>
          <span className="block max-w-[16rem] truncate" title={l.destinationUrl}>{hostOf(l.destinationUrl)}</span>
          {l.problem ? <span className="mt-1 inline-block rounded-full bg-coral-100 px-2 py-0.5 text-xs text-coral-600" title={l.problem}>Blocked: not an allowed domain</span> : null}
        </>
      ),
    },
    { key: "checked", header: "Last checked", cell: (l) => (l.lastVerifiedAt ? formatAdminDateTime(l.lastVerifiedAt) : <span className="text-ink-600">Never</span>) },
    { key: "status", header: "Status", cell: (l) => <StatusBadge active={l.isActive && l.merchantActive} /> },
    ...(canWrite ? [{ key: "actions", header: "Actions", cell: (l: LinkListRow) => <Link href={`/admin/links/${l.id}`} className="underline">Edit</Link> }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Affiliate links</h1>
          <p className="mt-2 text-ink-600">Every Buy button leads through one of these. Visitors go to /go/&lt;slug&gt; and are sent on to the store.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-3">
            <ConfirmActionButton label="Check oldest links" title="Check the 10 links checked longest ago?" description="Sends one request per link to the store, without tracking parameters. This can take up to a few seconds." confirmLabel="Check" action={verifyStaleLinksAction} />
            <Link href="/admin/links/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New link</Link>
          </div>
        )}
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/links" q={q} placeholder="Search slug, merchant or product">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Affiliate links"
          columns={columns}
          rows={rows}
          getRowKey={(l) => l.id}
          empty={filtered ? <EmptyState title="No links match" description="Try a different search, or reset the filters." /> : <EmptyState title="No affiliate links yet" description="Create a link for a product and a merchant. The product page then shows a Buy button." action={canWrite ? <Link href="/admin/links/new" className="font-medium text-coral-600 underline">Create the first link</Link> : undefined} />}
        />
        <Pagination basePath="/admin/links" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
