import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listCategories } from "@/modules/discover/service";
import type { CategoryListItem } from "@/modules/discover/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { parseStatus, StatusBadge, StatusSelect } from "@/shared/admin/status";

export const metadata = { title: "Categories", robots: { index: false } };

const columns: Column<CategoryListItem>[] = [
  {
    key: "name",
    header: "Name",
    cell: (c) => (
      <div style={{ paddingLeft: `${c.depth * 1.25}rem` }}>
        <Link href={`/admin/categories/${c.id}`} className="font-medium underline-offset-2 hover:underline">{c.name}</Link>
        {c.depth > 0 && <span className="block text-xs text-ink-600">{c.path}</span>}
      </div>
    ),
  },
  { key: "slug", header: "Slug", cell: (c) => <code className="text-xs">{c.slug}</code> },
  { key: "sort", header: "Sort", cell: (c) => c.sortOrder, className: "tabular-nums" },
  { key: "status", header: "Status", cell: (c) => <StatusBadge active={c.isActive} /> },
  {
    key: "actions",
    header: "Actions",
    cell: (c) => (
      <span className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap">
        <Link href={`/admin/categories/${c.id}`} className="underline">Edit</Link>
        {c.isActive && <Link href={`/admin/categories/new?parent=${c.id}`} className="underline">Add subcategory</Link>}
      </span>
    ),
  },
];

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.categoryWrite);

  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = parseStatus(sp);
  const { rows, hasNext } = await listCategories({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Categories</h1>
          <p className="mt-2 text-ink-600">The category tree, shown in display order. Subcategories sit under their parent.</p>
        </div>
        <Link href="/admin/categories/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New category</Link>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/categories" q={q} placeholder="Search name or slug">
          <StatusSelect value={status} />
        </ListToolbar>
        <DataTable
          caption="Categories"
          columns={columns}
          rows={rows}
          getRowKey={(c) => c.id}
          empty={
            filtered ? (
              <EmptyState title="No categories match" description="Try a different search, or reset the filters." />
            ) : (
              <EmptyState
                title="No categories yet"
                description="Start with the top-level groups shoppers browse by (for example Fashion or Home & Kitchen), then add subcategories under them."
                action={<Link href="/admin/categories/new" className="font-medium text-coral-600 underline">Create the first category</Link>}
              />
            )
          }
        />
        <Pagination basePath="/admin/categories" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
