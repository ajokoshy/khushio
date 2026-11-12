import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listBrands } from "@/modules/discover/service";
import type { BrandRow } from "@/modules/discover/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";

export const metadata = { title: "Brands", robots: { index: false } };

const columns: Column<BrandRow>[] = [
  { key: "name", header: "Name", cell: (b) => <Link href={`/admin/brands/${b.id}`} className="font-medium underline-offset-2 hover:underline">{b.name}</Link> },
  { key: "slug", header: "Slug", cell: (b) => <code className="text-xs">{b.slug}</code> },
  { key: "featured", header: "Featured", cell: (b) => (b.isFeatured ? "Yes" : <span className="text-ink-600">No</span>) },
  { key: "status", header: "Status", cell: (b) => <StatusBadge active={b.isActive} /> },
  { key: "actions", header: "Actions", cell: (b) => <Link href={`/admin/brands/${b.id}`} className="underline">Edit</Link> },
];

export default async function BrandsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.brandWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listBrands({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Brands</h1>
          <p className="mt-2 text-ink-600">The makers of the products you list.</p>
        </div>
        <Link href="/admin/brands/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New brand</Link>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/brands" q={q} placeholder="Search name or slug">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Brands"
          columns={columns}
          rows={rows}
          getRowKey={(b) => b.id}
          empty={
            filtered ? (
              <EmptyState title="No brands match" description="Try a different search, or reset the filters." />
            ) : (
              <EmptyState title="No brands yet" action={<Link href="/admin/brands/new" className="font-medium text-coral-600 underline">Create the first brand</Link>} />
            )
          }
        />
        <Pagination basePath="/admin/brands" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
