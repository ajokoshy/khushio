import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { REDIRECT_STATUS_LABELS } from "@/modules/redirects/path";
import { countRules, findShadowedRules, listRules } from "@/modules/redirects/service";
import { REDIRECT_SOURCE_LABELS, type RedirectRow } from "@/modules/redirects/types";
import { DataTable, type Column } from "@/shared/admin/data-table";
import { EmptyState } from "@/shared/admin/empty-state";
import { ListToolbar } from "@/shared/admin/list-toolbar";
import { firstParam, parseListParams, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { Pagination } from "@/shared/admin/pagination";
import { createRedirectAction } from "./actions";
import { RedirectForm } from "./redirect-form";

export const metadata = { title: "Redirects", robots: { index: false } };

const columns: Column<RedirectRow>[] = [
  { key: "from", header: "Old address", cell: (r) => <code className="break-all text-xs">{r.fromPath}</code> },
  { key: "to", header: "Goes to", cell: (r) => (r.toPath ? <code className="break-all text-xs">{r.toPath}</code> : <span className="text-xs text-ink-600">Nothing: the page is gone</span>) },
  { key: "status", header: "Kind", cell: (r) => REDIRECT_STATUS_LABELS[r.statusCode] },
  { key: "source", header: "Made", cell: (r) => <span className="text-xs">{REDIRECT_SOURCE_LABELS[r.source]}<br />{r.updatedAt.toISOString().slice(0, 10)}</span> },
  { key: "actions", header: "Actions", cell: (r) => <Link href={`/admin/redirects/${r.id}`} className="rounded-lg border border-cream-200 px-2.5 py-1 text-xs hover:bg-forest-100">Edit</Link> },
];

export default async function RedirectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.seoWrite);
  const sp = await searchParams;
  const { page, pageSize, offset, q } = parseListParams(sp, { pageSize: 25 });
  const [{ rows, hasNext }, total, shadowed] = await Promise.all([listRules({ q, limit: pageSize, offset }), countRules(), findShadowedRules()]);
  return (
    <>
      <h1 className="text-3xl">Redirects</h1>
      <p className="mt-2 max-w-prose text-ink-600">When a page&apos;s address changes, visitors and search engines are sent to the new one. Changing a slug adds a 301 here by itself; deleting a page that was public adds a 410 (gone). You can also add one by hand. {total} in total. Changes reach the site within about two minutes.</p>
      <div className="mt-6"><Notice code={firstParam(sp.notice)} /></div>

      {shadowed.length > 0 && (
        <section role="alert" aria-labelledby="shadow-heading" className="mb-6 rounded-card border border-coral-100 bg-coral-100/40 p-4">
          <h2 id="shadow-heading" className="text-base font-medium">These rules hide a page that exists</h2>
          <p className="mt-1 text-sm">A page lives at each of these old addresses, so visitors never reach it while the rule is there. Open the rule and delete it.</p>
          <ul className="mt-2 text-sm">{shadowed.map((s) => <li key={s.rule.id}><Link href={`/admin/redirects/${s.rule.id}`} className="underline"><code>{s.page}</code></Link></li>)}</ul>
        </section>
      )}

      <ListToolbar action="/admin/redirects" q={q} placeholder="Search addresses" />
      <DataTable caption="Redirects" columns={columns} rows={rows} getRowKey={(r) => r.id} empty={<EmptyState title={q ? "No redirects match" : "No redirects yet"} description={q ? "Try a different search." : "They appear here when a slug changes or a page is deleted."} />} />
      <Pagination basePath="/admin/redirects" params={{ q }} page={page} hasNext={hasNext} />

      <section aria-labelledby="add-heading" className="mt-10 border-t border-cream-200 pt-6">
        <h2 id="add-heading" className="mb-4 text-xl">Add a redirect</h2>
        <RedirectForm mode="create" action={createRedirectAction} initial={{ fromPath: "", toPath: "", statusCode: "301" }} cancelHref="/admin/redirects" />
      </section>
    </>
  );
}
