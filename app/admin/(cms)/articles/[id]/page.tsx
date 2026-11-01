import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { Alert, Button, ButtonLink, Card, PageTitle, SectionTitle } from "@/components/ui";
import { loadArticleAdmin, loadCategoriesAdmin } from "@/lib/data/journal-admin";
import { MAX_REVISIONS } from "@/lib/journal-core";
import { deleteArticle, restoreRevision } from "../../../actions";
export const dynamic = "force-dynamic";
export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; saved?: string; restored?: string }> }) {
  const { id } = await params, sp = await searchParams, a = await loadArticleAdmin(id); if (!a) notFound();
  return (<div><PageTitle actions={<ButtonLink href={`/admin/preview/article/${a.id}`} variant="secondary" small>Preview</ButtonLink>}>Edit article</PageTitle>
    {sp.saved && <Alert tone="success">Saved.</Alert>}{sp.restored && <Alert tone="success">Earlier version restored. The text you replaced is in the history below.</Alert>}
    <div className="mt-4"><ArticleForm a={{ ...a, coverMediaId: a.coverMediaId, tags: a.tags }} categories={await loadCategoriesAdmin()} error={sp.e} /></div>
    <SectionTitle>Earlier versions</SectionTitle><p className="mb-3 text-sm text-ink/70">The last {MAX_REVISIONS} versions are kept; older ones are removed automatically.</p>
    {a.revisions.length ? <ul className="max-w-3xl space-y-2">{a.revisions.map((r) => (<li key={r.id}><Card className="!p-3"><form action={restoreRevision} className="flex flex-wrap items-center justify-between gap-3 text-sm"><input type="hidden" name="revision" value={r.id} /><span>{r.title} <span className="text-ink/60">· {r.createdAt?.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span></span><Button variant="secondary" small>Restore this version</Button></form></Card></li>))}</ul> : <p className="text-sm text-ink/60">No earlier versions yet.</p>}
    <SectionTitle>Delete</SectionTitle><form action={deleteArticle}><input type="hidden" name="id" value={a.id} /><Button variant="danger" small>Delete this article permanently</Button></form></div>);
}
