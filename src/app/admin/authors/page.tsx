import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listAuthors } from "@/modules/content/service";
import { EmptyState } from "@/shared/admin/empty-state";
import { inputClass } from "@/shared/admin/form-field";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { createAuthorAction, deleteAuthorAction, updateAuthorAction } from "./actions";

export const metadata = { title: "Authors", robots: { index: false } };

const btn = "rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100";

export default async function AuthorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.contentWrite);
  const sp = await searchParams;
  const authors = await listAuthors();
  return (
    <>
      <h1 className="text-3xl">Authors</h1>
      <p className="mt-2 text-ink-600">The names shown on articles. Deleting an author keeps their articles (they just show no author).</p>
      <div className="mt-6 max-w-3xl">
        <Notice code={firstParam(sp.notice)} />
        <form action={createAuthorAction} className="space-y-3 rounded-2xl border border-cream-200 p-4">
          <h2 className="text-lg">Add an author</h2>
          <div><label htmlFor="new-name" className="block text-sm font-medium">Name</label><input id="new-name" name="displayName" required maxLength={120} className={inputClass} /></div>
          <div><label htmlFor="new-bio" className="block text-sm font-medium">Short bio (optional)</label><textarea id="new-bio" name="bio" rows={2} maxLength={1000} className={inputClass} /></div>
          <button type="submit" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Add author</button>
        </form>
        <div className="mt-8 space-y-4">
          {authors.length === 0 && <EmptyState title="No authors yet" description="Add the first author above. Articles can then name them." />}
          {authors.map((a) => (
            <div key={a.id} className="rounded-2xl border border-cream-200 p-4">
              <form action={updateAuthorAction} className="space-y-3">
                <input type="hidden" name="id" value={a.id} />
                <div><label htmlFor={`name-${a.id}`} className="block text-sm font-medium">Name</label><input id={`name-${a.id}`} name="displayName" required maxLength={120} defaultValue={a.displayName} className={inputClass} /></div>
                <div><label htmlFor={`bio-${a.id}`} className="block text-sm font-medium">Short bio</label><textarea id={`bio-${a.id}`} name="bio" rows={2} maxLength={1000} defaultValue={a.bio ?? ""} className={inputClass} /></div>
                <p className="text-xs text-ink-600">{a.articleCount} article{a.articleCount === 1 ? "" : "s"}</p>
                <button type="submit" className={btn}>Save</button>
              </form>
              <form action={deleteAuthorAction} className="mt-2"><input type="hidden" name="id" value={a.id} /><button type="submit" className="text-sm text-coral-600 underline">Delete {a.displayName}</button></form>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
