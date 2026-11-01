import { Alert, Button, Card, EmptyState, Field, Input, PageTitle, SectionTitle } from "@/components/ui";
import { loadCategoriesAdmin } from "@/lib/data/journal-admin";
import { deleteArticleCategory, saveArticleCategory } from "../../../actions";
export const dynamic = "force-dynamic";
export default async function ArticleCategories({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const sp = await searchParams, rows = await loadCategoriesAdmin();
  const form = (c?: (typeof rows)[number]) => (<form action={saveArticleCategory} className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end">{c && <input type="hidden" name="id" value={c.id} />}
    <Field label="Name"><Input name="name" required maxLength={60} defaultValue={c?.name} /></Field><Field label="Address"><Input name="slug" defaultValue={c?.slug} maxLength={60} /></Field><Field label="Order"><Input name="position" type="number" defaultValue={c?.position ?? 0} /></Field><Button small>{c ? "Save" : "Add"}</Button>
    <div className="sm:col-span-4"><Field label="Description (optional)"><Input name="description" defaultValue={c?.description} maxLength={300} /></Field></div></form>);
  return (<div className="max-w-3xl"><PageTitle>Journal categories</PageTitle>
    {sp.e && <Alert tone="error">{sp.e === "slug" ? "An article already uses that address. Choose a different one." : "Enter a name."}</Alert>}{sp.saved && <Alert tone="success">Saved.</Alert>}
    {rows.length ? <ul className="mt-4 space-y-3">{rows.map((c) => (<li key={c.id}><Card className="!p-4">{form(c)}<form action={deleteArticleCategory} className="mt-2"><input type="hidden" name="id" value={c.id} /><Button variant="danger" small>Delete (articles stay, without a category)</Button></form></Card></li>))}</ul> : <EmptyState>No categories yet.</EmptyState>}
    <SectionTitle>Add a category</SectionTitle><Card>{form()}</Card></div>);
}
