import Link from "next/link";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listPrograms } from "@/modules/affiliate/service";
import type { ProgramRow } from "@/modules/affiliate/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";

export const metadata = { title: "Merchant programmes", robots: { index: false } };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.affiliateRead);
  const canWrite = hasPermission(session.user.permissions, P.affiliateWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listPrograms({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  const columns: Column<ProgramRow>[] = [
    { key: "merchant", header: "Merchant", cell: (p) => (canWrite ? <Link href={`/admin/programs/${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.merchantName}</Link> : <span className="font-medium">{p.merchantName}</span>) },
    { key: "network", header: "Network", cell: (p) => p.networkName },
    { key: "external", header: "Programme ID", cell: (p) => (p.externalProgramId ? <code className="text-xs">{p.externalProgramId}</code> : <span className="text-ink-600">-</span>) },
    { key: "note", header: "Commission", cell: (p) => <span className="block max-w-[18rem] truncate" title={p.commissionNote ?? ""}>{p.commissionNote ?? "-"}</span> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge active={p.isActive} /> },
    ...(canWrite ? [{ key: "actions", header: "Actions", cell: (p: ProgramRow) => <Link href={`/admin/programs/${p.id}`} className="underline">Edit</Link> }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Merchant programmes</h1>
          <p className="mt-2 text-ink-600">Which merchant pays you through which network, and on what terms.</p>
        </div>
        {canWrite && <Link href="/admin/programs/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New programme</Link>}
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/programs" q={q} placeholder="Search merchant, network or programme ID">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Merchant programmes"
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          empty={filtered ? <EmptyState title="No programmes match" description="Try a different search, or reset the filters." /> : <EmptyState title="No programmes yet" description="Record which network each merchant pays through. Create the merchant and the network first." />}
        />
        <Pagination basePath="/admin/programs" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
