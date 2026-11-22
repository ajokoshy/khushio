import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { SEO_ISSUE_LABELS } from "@/modules/seo/metadata";
import { countAuditIssues, listAudit } from "@/modules/seo/service";
import { AUDIT_TYPES, AUDIT_TYPE_LABELS, isAuditType, isOverrideType, type AuditRow, type AuditType } from "@/modules/seo/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { buildHref, firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";

export const metadata = { title: "Search (SEO)", robots: { index: false } };

const editHref = (r: AuditRow) => (isOverrideType(r.type) ? `/admin/seo/${r.type}/${r.id}` : r.type === "article" ? `/admin/articles/${r.id}` : `/admin/pages/${r.id}`);

const columns: Column<AuditRow>[] = [
  { key: "name", header: "Page", cell: (r) => <><span className="font-medium">{r.name}</span><div><code className="break-all text-xs text-ink-600">{r.path}</code></div></> },
  { key: "own", header: "Search text", cell: (r) => (r.overrideTitle || r.overrideDescription ? <span className="text-xs">Edited by hand</span> : <span className="text-xs text-ink-600">Automatic</span>) },
  { key: "robots", header: "In search results", cell: (r) => (r.robots ? <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">Hidden</span> : <span className="text-xs text-ink-600">Yes</span>) },
  { key: "issues", header: "To improve", cell: (r) => (r.issues.length === 0 ? <span className="text-xs text-forest-800">Fine</span> : <ul className="space-y-1 text-xs text-coral-600">{r.issues.map((i) => <li key={i}>{SEO_ISSUE_LABELS[i]}</li>)}</ul>) },
  { key: "actions", header: "Actions", cell: (r) => <Link href={editHref(r)} className="rounded-lg border border-cream-200 px-2.5 py-1 text-xs hover:bg-forest-100">Edit</Link> },
];

export default async function SeoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.seoWrite);
  const sp = await searchParams;
  const typeParam = firstParam(sp.type);
  const type: AuditType = typeParam && isAuditType(typeParam) ? typeParam : "product";
  const onlyIssues = firstParam(sp.needs) === "1";
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const [{ rows, hasNext }, counts] = await Promise.all([listAudit(type, { q, onlyIssues, limit: pageSize, offset }), countAuditIssues()]);
  return (
    <>
      <h1 className="text-3xl">Search (SEO)</h1>
      <p className="mt-2 max-w-prose text-ink-600">Every page a visitor can reach always has a title and a description: when you write none, they are made from the page&apos;s own name and text. This list shows pages where that is not good enough, and lets you write the search title and description by hand.</p>
      <div className="mt-6"><Notice code={firstParam(sp.notice)} /></div>

      <nav aria-label="Kind of page" className="mb-4 flex flex-wrap gap-2">
        {AUDIT_TYPES.map((t) => (
          <Link key={t} href={buildHref("/admin/seo", { type: t, needs: onlyIssues ? 1 : undefined })} aria-current={t === type ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${t === type ? "border-forest-800 bg-forest-100" : "border-cream-200 hover:bg-forest-100"}`}>
            {AUDIT_TYPE_LABELS[t]}{counts[t] > 0 && <span className="ml-1.5 rounded-full bg-coral-100 px-1.5 text-xs text-coral-600">{counts[t]}</span>}
          </Link>
        ))}
      </nav>

      <ListToolbar action="/admin/seo" q={q} placeholder="Search by name">
        <input type="hidden" name="type" value={type} />
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" name="needs" value="1" defaultChecked={onlyIssues} />Only pages with something to improve</label>
      </ListToolbar>
      <DataTable caption={AUDIT_TYPE_LABELS[type]} columns={columns} rows={rows} getRowKey={(r) => r.id} empty={<EmptyState title={q || onlyIssues ? "Nothing matches" : "Nothing to show yet"} description={onlyIssues ? "Every page of this kind is fine." : "Pages appear here once they are visible to visitors."} />} />
      <Pagination basePath="/admin/seo" params={{ type, needs: onlyIssues ? 1 : undefined, q }} page={page} hasNext={hasNext} />
    </>
  );
}
