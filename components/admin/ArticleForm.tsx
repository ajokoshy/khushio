import { MediaPicker } from "@/components/admin/MediaPicker";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { ARTICLE_LIMITS } from "@/lib/journal-core";
import { saveArticle } from "../../app/admin/actions";

export const ARTICLE_ERRORS: Record<string, string> = { title: "Give the article a title.", "title-long": `Titles can be up to ${ARTICLE_LIMITS.title} characters.`, body: "The article needs some text.", "body-long": "The text is too long (the limit is about 10,000 words).", slug: "Choose an address using letters or numbers.", "slug-taken": "Another article already uses that address.", "slug-category": "A journal category already uses that address. Choose a different one.", date: "Check the publish date and time." };
type A = { id?: string; title?: string; slug?: string; excerpt?: string; body?: string; author?: string; categorySlug?: string; tags?: string[]; coverMediaId?: string | null; status?: string; publishAtInput?: string; seoTitle?: string | null; seoDescription?: string | null };

export function ArticleForm({ a = {}, categories, error }: { a?: A; categories: { slug: string; name: string }[]; error?: string }) {
  return (
    <form action={saveArticle} className="grid max-w-3xl gap-4">
      {a.id && <input type="hidden" name="id" value={a.id} />}
      {error && <Alert tone="error">{ARTICLE_ERRORS[error] ?? "Could not save the article."}</Alert>}
      <Field label="Title"><Input name="title" required defaultValue={a.title} maxLength={ARTICLE_LIMITS.title} /></Field>
      <Field label="Address (optional)" hint="Leave empty to build it from the title."><Input name="slug" defaultValue={a.slug} maxLength={120} /></Field>
      <Field label="Text" hint="Markdown. ## Heading, **bold**, *italic*, - list, [link](/products/slug). Put [[product:product-slug]] on its own line for a product card, and ![alt](media:IMAGE-ID) for an image (copy the ID from the media library)."><Textarea name="body" rows={22} required defaultValue={a.body} maxLength={ARTICLE_LIMITS.body} className="font-mono" /></Field>
      <Field label="Summary (optional)" hint="Shown on cards and in search results. Leave empty to use the first paragraph."><Textarea name="excerpt" rows={2} defaultValue={a.excerpt} maxLength={ARTICLE_LIMITS.excerpt} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category"><Select name="category" defaultValue={a.categorySlug ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
        <Field label="Author (optional)"><Input name="author" defaultValue={a.author} maxLength={ARTICLE_LIMITS.author} /></Field>
      </div>
      <Field label="Tags" hint="Comma separated, up to 8."><Input name="tags" defaultValue={a.tags?.join(", ")} /></Field>
      <MediaPicker name="cover_media_id" value={a.coverMediaId} label="Cover image" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status"><Select name="status" defaultValue={a.status ?? "draft"}><option value="draft">Draft (not shown)</option><option value="published">Published</option></Select></Field>
        <Field label="Publish at (India time, optional)" hint="Published with a future time = scheduled. Pages refresh within about 30 minutes of that time."><Input name="publish_at" type="datetime-local" defaultValue={a.publishAtInput} /></Field>
      </div>
      <details className="rounded-lg border border-sand bg-white p-3 text-sm"><summary className="cursor-pointer font-medium">Search appearance (optional)</summary>
        <div className="mt-3 grid gap-3"><Field label={`SEO title (up to ${ARTICLE_LIMITS.seoTitle})`}><Input name="seo_title" defaultValue={a.seoTitle ?? ""} maxLength={ARTICLE_LIMITS.seoTitle} /></Field>
          <Field label={`SEO description (up to ${ARTICLE_LIMITS.seoDescription})`}><Input name="seo_description" defaultValue={a.seoDescription ?? ""} maxLength={ARTICLE_LIMITS.seoDescription} /></Field></div></details>
      <div className="flex flex-wrap gap-3"><Button>Save article</Button><a className="self-center text-sm underline" href="/admin/articles">Back to articles</a></div>
    </form>
  );
}
