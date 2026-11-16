import Link from "next/link";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listNetworks } from "@/modules/affiliate/service";
import type { NetworkRow } from "@/modules/affiliate/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";

export const metadata = { title: "Affiliate networks", robots: { index: false } };

export default async function NetworksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.affiliateRead);
  const canWrite = hasPermission(session.user.permissions, P.affiliateWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listNetworks({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  const columns: Column<NetworkRow>[] = [
    { key: "name", header: "Name", cell: (n) => (canWrite ? <Link href={`/admin/networks/${n.id}`} className="font-medium underline-offset-2 hover:underline">{n.name}</Link> : <span className="font-medium">{n.name}</span>) },
    { key: "key", header: "Key", cell: (n) => <code className="text-xs">{n.key}</code> },
    { key: "status", header: "Status", cell: (n) => <StatusBadge active={n.isActive} /> },
    ...(canWrite ? [{ key: "actions", header: "Actions", cell: (n: NetworkRow) => <Link href={`/admin/networks/${n.id}`} className="underline">Edit</Link> }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Affiliate networks</h1>
          <p className="mt-2 text-ink-600">The programmes that pay you commission, for example Cuelinks or Amazon Associates.</p>
        </div>
        {canWrite && <Link href="/admin/networks/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New network</Link>}
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/networks" q={q} placeholder="Search name or key">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Affiliate networks"
          columns={columns}
          rows={rows}
          getRowKey={(n) => n.id}
          empty={filtered ? <EmptyState title="No networks match" description="Try a different search, or reset the filters." /> : <EmptyState title="No networks yet" description="Add the affiliate networks you have joined. Conversions you record later belong to one of them." />}
        />
        <Pagination basePath="/admin/networks" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
