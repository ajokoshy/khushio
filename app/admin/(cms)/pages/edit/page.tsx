import { redirect } from "next/navigation";
import { Alert, Button, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { parseMarkdown } from "@/lib/markdown";
import { Prose } from "@/components/Prose";
import { loadPageAdmin } from "@/lib/pages-admin";
import { cleanPageSlug, DEFAULT_PAGES } from "@/lib/pages-core";
import { savePage } from "../../../actions";
export const dynamic = "force-dynamic";
export default async function EditPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const raw = (await searchParams).slug ?? "", slug = cleanPageSlug(raw) ?? (raw in DEFAULT_PAGES ? raw : null); if (!slug) redirect("/admin/pages?e=slug");
  const p = await loadPageAdmin(slug);
  return (<div className="max-w-3xl"><PageTitle>{p.isNew ? "New page" : `Edit: ${p.title}`}</PageTitle>
    {p.isDefault && !p.custom && <Alert>This page is showing its built-in text. Saving stores your version; “Reset” on the pages list brings the default back.</Alert>}
    <form action={savePage} className="mt-4 grid gap-4"><input type="hidden" name="slug" value={slug} />
      <Field label="Title"><Input name="title" defaultValue={p.title} required maxLength={120} /></Field>
      <Field label="Text" hint="Markdown: ## headings, **bold**, *italic*, - lists, [links](/path). Links must start with / or https://."><Textarea name="body" rows={16} defaultValue={p.body} maxLength={20000} className="font-mono" /></Field>
      <Field label="Search description (optional, up to 170 characters)"><Input name="seo_description" defaultValue={p.description} maxLength={170} /></Field>
      <Field label="Status"><Select name="status" defaultValue={p.status}><option value="published">Published</option><option value="draft">Draft (not shown)</option></Select></Field>
      <div className="flex gap-3"><Button>Save page</Button><a className="self-center text-sm underline" href="/admin/pages">Cancel</a></div></form>
    <h2 className="mb-3 mt-10 font-display text-xl font-semibold text-forest">Preview of the saved text</h2><div className="rounded-card border border-sand bg-white p-5"><Prose blocks={parseMarkdown(p.body)} /></div></div>);
}
