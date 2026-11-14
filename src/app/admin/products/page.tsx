import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { hasPermission } from "@/core/permissions/guard";
import { requirePagePermission } from "@/core/permissions/require";
import { listProducts } from "@/modules/products/service";
import { PRODUCT_STATUSES, STATUS_LABELS, type ProductFilter, type ProductListRow } from "@/modules/products/types";
import { productFilterSchema } from "@/modules/products/validation";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { ProductStatusBadge } from "./status-badge";

export const metadata = { title: "Products", robots: { index: false } };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.productRead);
  const canWrite = hasPermission(session.user.permissions, P.productWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status: ProductFilter = productFilterSchema.parse(firstParam(sp.status));
  const { rows, hasNext } = await listProducts({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  const columns: Column<ProductListRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (p) => (canWrite ? <Link href={`/admin/products/${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.name}</Link> : <span className="font-medium">{p.name}</span>),
    },
    { key: "status", header: "Status", cell: (p) => <ProductStatusBadge status={p.status} publishAt={p.publishAt} /> },
    { key: "brand", header: "Brand", cell: (p) => p.brandName ?? <span className="text-ink-600">None</span> },
    { key: "category", header: "Main category", cell: (p) => p.categoryName ?? <span className="text-ink-600">None</span> },
    { key: "featured", header: "Featured", cell: (p) => (p.isFeatured ? "Yes" : <span className="text-ink-600">No</span>) },
    { key: "slug", header: "Slug", cell: (p) => <code className="text-xs">{p.slug}</code> },
    ...(canWrite ? [{ key: "actions", header: "Actions", cell: (p: ProductListRow) => <Link href={`/admin/products/${p.id}`} className="underline">Edit</Link> }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Products</h1>
          <p className="mt-2 text-ink-600">Everything you list, with its variants, categories and images.</p>
        </div>
        {canWrite && <Link href="/admin/products/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New product</Link>}
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/products" q={q} placeholder="Search name or slug">
          <div>
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" name="status" defaultValue={status} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </ListToolbar>
        <DataTable
          caption="Products"
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          empty={
            filtered ? (
              <EmptyState title="No products match" description="Try a different search, or reset the filters." />
            ) : (
              <EmptyState title="No products yet" action={canWrite ? <Link href="/admin/products/new" className="font-medium text-coral-600 underline">Create the first product</Link> : undefined} />
            )
          }
        />
        <Pagination basePath="/admin/products" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
