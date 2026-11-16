import Link from "next/link";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { formatMinor } from "@/core/validation/money";
import { listNetworkOptions } from "@/modules/affiliate/service";
import { listConversions } from "@/modules/conversions/service";
import { CONVERSION_STATUSES, CONVERSION_STATUS_LABELS, type ConversionRow, type ConversionStatus } from "@/modules/conversions/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { idSchema } from "@/core/validation/fields";

export const metadata = { title: "Conversions", robots: { index: false } };

export default async function ConversionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.reportView);
  const granted = session.user.permissions;
  const canWrite = hasPermission(granted, P.affiliateWrite);
  const canImport = hasPermission(granted, P.importRun);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const statusParam = firstParam(sp.status);
  const status = (CONVERSION_STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as ConversionStatus) : undefined;
  const networkParam = idSchema.safeParse(firstParam(sp.network));
  const networkId = networkParam.success ? networkParam.data : undefined;

  const [{ rows, hasNext }, networks] = await Promise.all([listConversions({ q, status, networkId, limit: pageSize, offset }), listNetworkOptions()]);
  const filtered = !!q || !!status || !!networkId;

  const columns: Column<ConversionRow>[] = [
    { key: "order", header: "Order", cell: (c) => (canWrite ? <Link href={`/admin/conversions/${c.id}`} className="font-medium underline-offset-2 hover:underline">{c.externalOrderId}</Link> : <span className="font-medium">{c.externalOrderId}</span>) },
    { key: "network", header: "Network", cell: (c) => c.networkName ?? "-" },
    { key: "link", header: "Link", cell: (c) => (c.linkSlug ? <code className="text-xs">{c.linkSlug}</code> : <span className="text-ink-600">-</span>) },
    { key: "commission", header: "Commission", className: "text-right", cell: (c) => <span className="tabular-nums">{formatMinor(c.commissionMinor, c.currency)}</span> },
    { key: "status", header: "Status", cell: (c) => CONVERSION_STATUS_LABELS[c.status as ConversionStatus] ?? c.status },
    { key: "date", header: "Date", cell: (c) => formatAdminDateTime(c.convertedAt) },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Conversions</h1>
          <p className="mt-2 text-ink-600">Orders that earned commission, newest first. Enter them by hand or import the network&apos;s CSV report.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canImport && <Link href="/admin/conversions/import" className="rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100">Import CSV</Link>}
          {canWrite && <Link href="/admin/conversions/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Add conversion</Link>}
        </div>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/conversions" q={q} placeholder="Search order id or link slug">
          <div>
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {CONVERSION_STATUSES.map((s) => <option key={s} value={s}>{CONVERSION_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="network" className="sr-only">Network</label>
            <select id="network" name="network" defaultValue={networkId ?? ""} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              <option value="">All networks</option>
              {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        </ListToolbar>
        <DataTable
          caption="Conversions"
          columns={columns}
          rows={rows}
          getRowKey={(c) => c.id}
          empty={filtered ? <EmptyState title="No conversions match" description="Try a different search, or reset the filters." /> : <EmptyState title="No conversions yet" description="When your network reports a sale, add it here or import the network's CSV report." />}
        />
        <Pagination basePath="/admin/conversions" params={{ q, status, network: networkId }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
