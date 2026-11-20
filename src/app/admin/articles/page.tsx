import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { listArticles } from "@/modules/content/service";
import { ARTICLE_TYPE_LABELS, CONTENT_STATUS_LABELS, type ArticleListRow } from "@/modules/content/types";
import { CONTENT_FILTER_OPTIONS, TYPE_FILTER_OPTIONS, contentFilterSchema, typeFilterSchema } from "@/modules/content/validation";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";

export const metadata = { title: "Articles", robots: { index: false } };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.contentWrite);
  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const status = contentFilterSchema.parse(firstParam(sp.status));
  const type = typeFilterSchema.parse(firstParam(sp.type));
  const { rows, hasNext } = await listArticles({ q, status, type, limit: pageSize, offset });
  const filtered = !!q || status !== "all" || type !== "all";

  const columns: Column<ArticleListRow>[] = [
    { key: "title", header: "Article", cell: (a) => <><Link href={`/admin/articles/${a.id}`} className="font-medium underline-offset-2 hover:underline">{a.title}</Link><span className="block text-xs text-ink-600">/articles/{a.slug}</span></> },
    { key: "type", header: "Type", cell: (a) => <span className="text-xs">{ARTICLE_TYPE_LABELS[a.type]}</span> },
    { key: "status", header: "Status", cell: (a) => <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">{CONTENT_STATUS_LABELS[a.status]}</span> },
    { key: "when", header: "Go-live", cell: (a) => (a.publishAt ? <span className="text-xs">{formatAdminDateTime(a.publishAt)}</span> : "—") },
    { key: "meta", header: "Author and topic", cell: (a) => <span className="text-xs">{a.authorName ?? "No author"}<br />{a.categoryName ?? "No topic"}</span> },
    { key: "updated", header: "Updated", cell: (a) => <span className="text-xs">{formatAdminDateTime(a.updatedAt)}</span> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Articles and guides</h1>
          <p className="mt-2 text-ink-600">Articles, buying guides, reviews, comparisons and how-tos. All are shown on /articles; everything except the plain article is also listed under /guides. Visitors see an item while it is Published, or Scheduled and its time has come.</p>
        </div>
        <Link href="/admin/articles/new" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">New article or guide</Link>
      </div>
      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ListToolbar action="/admin/articles" q={q} placeholder="Search title or slug">
          <div>
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" name="status" defaultValue={status} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              {CONTENT_FILTER_OPTIONS.map((o) => <option key={o} value={o}>{o === "all" ? "All statuses" : CONTENT_STATUS_LABELS[o]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="sr-only">Type</label>
            <select id="type" name="type" defaultValue={type} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
              {TYPE_FILTER_OPTIONS.map((o) => <option key={o} value={o}>{o === "all" ? "All types" : ARTICLE_TYPE_LABELS[o]}</option>)}
            </select>
          </div>
        </ListToolbar>
        <DataTable caption="Articles" columns={columns} rows={rows} getRowKey={(a) => a.id}
          empty={filtered ? <EmptyState title="No articles match" description="Try a different search, or reset the filters." /> : <EmptyState title="No articles yet" description="Write the first article, then publish it. It appears on /articles by itself." action={<Link href="/admin/articles/new" className="font-medium text-coral-600 underline">Write the first article</Link>} />} />
        <Pagination basePath="/admin/articles" params={{ q, status: status === "all" ? undefined : status, type: type === "all" ? undefined : type }} page={page} hasNext={hasNext} />
      </div>
    </>
  );
}
