import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listMerchants } from "@/modules/merchants/service";
import type { MerchantRow } from "@/modules/merchants/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";

export const metadata = { title: "Merchants", robots: { index: false } };

const columns: Column<MerchantRow>[] = [
  { key: "name", header: "Name", cell: (m) => <Link href={`/admin/merchants/${m.id}`} className="font-medium underline-offset-2 hover:underline">{m.name}</Link> },
  { key: "slug", header: "Slug", cell: (m) => <code className="text-xs">{m.slug}</code> },
  {
    key: "domains",
    header: "Allowed domains",
    cell: (m) =>
      m.allowedDomains.length === 0 ? (
        <span className="text-coral-600">None yet: links cannot be sent anywhere</span>
      ) : (
        <span className="block max-w-[22rem] truncate" title={m.allowedDomains.join(", ")}>{m.allowedDomains.join(", ")}</span>
      ),
  },
  { key: "status", header: "Status", cell: (m) => <StatusBadge active={m.isActive} /> },
  { key: "actions", header: "Actions", cell: (m) => <Link href={`/admin/merchants/${m.id}`} className="underline">Edit</Link> },
];

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.merchantWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listMerchants({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Merchants</h1>
          <p className="mt-2 text-ink-600">The stores your affiliate links lead to, and the domains each one is allowed to use.</p>
        </div>
        <Link href="/admin/merchants/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New merchant</Link>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/merchants" q={q} placeholder="Search name or slug">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Merchants"
          columns={columns}
          rows={rows}
          getRowKey={(m) => m.id}
          empty={
            filtered ? (
              <EmptyState title="No merchants match" description="Try a different search, or reset the filters." />
            ) : (
              <EmptyState
                title="No merchants yet"
                description="Add the stores you earn commission from, for example Amazon India, with the domains their links may use."
                action={<Link href="/admin/merchants/new" className="font-medium text-coral-600 underline">Create the first merchant</Link>}
              />
            )
          }
        />
        <Pagination basePath="/admin/merchants" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
