import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listCategories, listTags } from "@/modules/content/service";
import { inputClass } from "@/shared/admin/form-field";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { createTagAction, createTopicAction, deleteTagAction, deleteTopicAction, renameTagAction, updateTopicAction } from "./actions";

export const metadata = { title: "Topics and tags", robots: { index: false } };

const btn = "rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100";

export default async function TopicsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.contentWrite);
  const sp = await searchParams;
  const [topics, tags] = await Promise.all([listCategories(), listTags()]);
  return (
    <>
      <h1 className="text-3xl">Topics and tags</h1>
      <p className="mt-2 text-ink-600">A topic groups articles (one per article) and has its own page at /articles/category/&lt;slug&gt;. Tags are free labels (several per article). The address of a topic or tag never changes once created.</p>
      <div className="mt-6 max-w-3xl space-y-10">
        <Notice code={firstParam(sp.notice)} />

        <section aria-labelledby="topics-heading" className="space-y-4">
          <h2 id="topics-heading" className="text-2xl">Topics</h2>
          <form action={createTopicAction} className="space-y-3 rounded-2xl border border-cream-200 p-4">
            <div><label htmlFor="new-topic" className="block text-sm font-medium">New topic</label><input id="new-topic" name="name" required maxLength={120} className={inputClass} /></div>
            <div><label htmlFor="new-topic-desc" className="block text-sm font-medium">Description (optional)</label><input id="new-topic-desc" name="description" maxLength={300} className={inputClass} /></div>
            <input type="hidden" name="sortOrder" value="0" />
            <button type="submit" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Add topic</button>
          </form>
          {topics.map((t) => (
            <div key={t.id} className="rounded-2xl border border-cream-200 p-4">
              <form action={updateTopicAction} className="space-y-3">
                <input type="hidden" name="id" value={t.id} />
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                  <div><label htmlFor={`tn-${t.id}`} className="block text-sm font-medium">Name</label><input id={`tn-${t.id}`} name="name" required maxLength={120} defaultValue={t.name} className={inputClass} /></div>
                  <div><label htmlFor={`to-${t.id}`} className="block text-sm font-medium">Order</label><input id={`to-${t.id}`} name="sortOrder" inputMode="numeric" defaultValue={String(t.sortOrder)} className={inputClass} /></div>
                </div>
                <div><label htmlFor={`td-${t.id}`} className="block text-sm font-medium">Description</label><input id={`td-${t.id}`} name="description" maxLength={300} defaultValue={t.description ?? ""} className={inputClass} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={t.isActive} /> Shown on the site</label>
                <p className="text-xs text-ink-600">/articles/category/{t.slug} · {t.articleCount} article{t.articleCount === 1 ? "" : "s"}</p>
                <button type="submit" className={btn}>Save</button>
              </form>
              <form action={deleteTopicAction} className="mt-2"><input type="hidden" name="id" value={t.id} /><button type="submit" className="text-sm text-coral-600 underline">Delete {t.name}</button></form>
            </div>
          ))}
        </section>

        <section aria-labelledby="tags-heading" className="space-y-4">
          <h2 id="tags-heading" className="text-2xl">Tags</h2>
          <form action={createTagAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-cream-200 p-4">
            <div className="min-w-48 flex-1"><label htmlFor="new-tag" className="block text-sm font-medium">New tag</label><input id="new-tag" name="name" required maxLength={40} className={inputClass} /></div>
            <button type="submit" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Add tag</button>
          </form>
          {tags.map((t) => (
            <div key={t.id} className="flex flex-wrap items-end gap-3 rounded-2xl border border-cream-200 p-4">
              <form action={renameTagAction} className="flex min-w-48 flex-1 items-end gap-3">
                <input type="hidden" name="id" value={t.id} />
                <div className="flex-1"><label htmlFor={`tag-${t.id}`} className="block text-sm font-medium">Name</label><input id={`tag-${t.id}`} name="name" required maxLength={40} defaultValue={t.name} className={inputClass} /></div>
                <button type="submit" className={btn}>Save</button>
              </form>
              <p className="text-xs text-ink-600">/articles/tag/{t.slug} · {t.articleCount} article{t.articleCount === 1 ? "" : "s"}</p>
              <form action={deleteTagAction}><input type="hidden" name="id" value={t.id} /><button type="submit" className="text-sm text-coral-600 underline">Delete {t.name}</button></form>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
