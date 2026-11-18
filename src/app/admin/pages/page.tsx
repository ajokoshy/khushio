import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { listPages } from "@/modules/content/service";
import { CONTENT_STATUS_LABELS, type PageListRow } from "@/modules/content/types";
import { CONTENT_FILTER_OPTIONS, contentFilterSchema } from "@/modules/content/validation";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";

export const metadata = { title: "Pages", robots: { index: false } };

export default async function PagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.contentWrite);
  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = contentFilterSchema.parse(firstParam(sp.status));
  const { rows, hasNext } = await listPages({ q, status, limit: pageSize, offset });
  const filtered = !!q || status !== "all";

  const columns: Column<PageListRow>[] = [
    { key: "title", header: "Page", cell: (p) => <><Link href={`/admin/pages/${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.title}</Link><span className="block text-xs text-ink-600">/p/{p.slug}</span></> },
    { key: "status", header: "Status", cell: (p) => <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">{CONTENT_STATUS_LABELS[p.status]}</span> },
    { key: "when", header: "Go-live", cell: (p) => (p.publishAt ? <span className="text-xs">{formatAdminDateTime(p.publishAt)}</span> : "—") },
    { key: "updated", header: "Updated", cell: (p) => <span className="text-xs">{formatAdminDateTime(p.updatedAt)}</span> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Pages</h1>
          <p className="mt-2 text-ink-600">Stand-alone pages such as About or How we earn money, shown at /p/&lt;slug&gt;. Same editor and statuses as articles.</p>
        </div>
        <Link href="/admin/pages/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New page</Link>
      </div>
      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/pages" q={q} placeholder="Search title or slug">
          <div>
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" name="status" defaultValue={status} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              {CONTENT_FILTER_OPTIONS.map((o) => <option key={o} value={o}>{o === "all" ? "All statuses" : CONTENT_STATUS_LABELS[o]}</option>)}
            </select>
          </div>
        </ListToolbar>
        <DataTable caption="Pages" columns={columns} rows={rows} getRowKey={(p) => p.id}
          empty={filtered ? <EmptyState title="No pages match" description="Try a different search, or reset the filters." /> : <EmptyState title="No pages yet" description="Create a page such as About, then publish it." action={<Link href="/admin/pages/new" className="font-medium text-coral-600 underline">Create the first page</Link>} />} />
        <Pagination basePath="/admin/pages" params={{ q, status: status === "all" ? undefined : status }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
