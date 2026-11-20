"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CoverField } from "@/shared/admin/content/cover-field";
import type { PickerActions } from "@/shared/admin/content/image-picker";
import type { ProductSearch } from "@/shared/admin/content/product-picker";
import { RichTextEditor } from "@/shared/admin/content/rich-text-editor";
import { SeoFields } from "@/shared/admin/content/seo-fields";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

export type ArticleFormInitial = {
  title: string; type: string; slug: string; excerpt: string; status: string; publishAt: string; authorId: string; categoryId: string; tags: string;
  coverPublicId: string; coverAlt: string; content: unknown;
  seoTitle: string; seoDescription: string; seoCanonical: string; seoOgImage: string; seoRobots: string;
};
type TextKey = Exclude<keyof ArticleFormInitial, "content">;

type Props = PickerActions & {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: ArticleFormInitial;
  statuses: readonly { value: string; label: string; publishControlled: boolean }[];
  types: readonly { value: string; label: string }[];
  searchProducts: ProductSearch;
  productLabels: Record<string, string>;
  authors: { id: string; name: string }[];
  categories: { id: string; name: string; isActive: boolean }[];
  canPublish: boolean;
  canEditSeo: boolean;
  cloudName: string | null;
  uploadsEnabled: boolean;
  cancelHref: string;
};

export function ArticleForm({ mode, action, initial, statuses, types, searchProducts, productLabels, authors, categories, canPublish, canEditSeo, cloudName, uploadsEnabled, cancelHref, search, sign, record }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: TextKey) => state?.values?.[name] ?? initial[name];
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  // After a failed save the editor starts from what was typed, not from the saved version.
  const content = (() => {
    const typed = state?.values?.content;
    if (!typed) return initial.content;
    try { return JSON.parse(typed) as unknown; } catch { return initial.content; }
  })();
  const currentStatus = text("status");

  return (
    <form action={formAction} noValidate className="max-w-3xl space-y-6">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Title" htmlFor="title" required error={error("title")}>
        <input id="title" name="title" required maxLength={120} className={inputClass} defaultValue={text("title")} aria-invalid={!!error("title")} aria-describedby={by("title")} />
      </FormField>

      <FormField label="Type" htmlFor="type" required error={error("type")} hint="Guides, reviews, comparisons and how-tos also appear under /guides. Every type keeps its address under /articles.">
        <select id="type" name="type" required className={inputClass} defaultValue={text("type")} aria-describedby={by("type")}>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </FormField>

      <FormField label="Summary" htmlFor="excerpt" error={error("excerpt")} hint="Optional. One or two sentences shown in lists and used by search engines. Up to 300 characters.">
        <textarea id="excerpt" name="excerpt" rows={2} maxLength={300} className={inputClass} defaultValue={text("excerpt")} aria-invalid={!!error("excerpt")} aria-describedby={by("excerpt")} />
      </FormField>

      <div>
        <p className="mb-1 text-sm font-medium">Text</p>
        {error("content") && <p id="content-error" role="alert" className="mb-1 text-sm text-coral-600">{error("content")}</p>}
        <RichTextEditor name="content" initial={content} cloudName={cloudName} uploadsEnabled={uploadsEnabled} invalid={!!error("content")} describedBy={error("content") ? "content-error" : undefined} search={search} sign={sign} record={record} searchProducts={searchProducts} productLabels={productLabels} />
      </div>

      <CoverField initialPublicId={text("coverPublicId")} initialAlt={text("coverAlt")} cloudName={cloudName} uploadsEnabled={uploadsEnabled} error={error("coverPublicId")} search={search} sign={sign} record={record} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Author" htmlFor="authorId" error={error("authorId")} hint="Add authors on the Authors screen.">
          <select id="authorId" name="authorId" className={inputClass} defaultValue={text("authorId")}>
            <option value="">No author shown</option>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FormField>
        <FormField label="Topic" htmlFor="categoryId" error={error("categoryId")} hint="Manage topics on the Topics and tags screen.">
          <select id="categoryId" name="categoryId" className={inputClass} defaultValue={text("categoryId")}>
            <option value="">No topic</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.isActive ? c.name : `${c.name} (hidden)`}</option>)}
          </select>
        </FormField>
      </div>

      <FormField label="Tags" htmlFor="tags" error={error("tags")} hint="Separated by commas, up to 15. A new tag is created when it does not exist yet.">
        <input id="tags" name="tags" className={inputClass} defaultValue={text("tags")} aria-invalid={!!error("tags")} aria-describedby={by("tags")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Status" htmlFor="status" required error={error("status")} hint={canPublish ? "Only Published articles, and Scheduled ones whose time has come, can be seen by visitors." : "Your account can save drafts and send them for review. Someone with publish permission publishes them."}>
          <select id="status" name="status" required className={inputClass} defaultValue={currentStatus}>
            {statuses.map((s) => <option key={s.value} value={s.value} disabled={!canPublish && s.publishControlled && s.value !== initial.status}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Go-live time (India time)" htmlFor="publishAt" error={error("publishAt")} hint="Needed for Scheduled: the article appears by itself within a few minutes after this time. Empty for Published means now.">
          <input id="publishAt" name="publishAt" type="datetime-local" className={inputClass} defaultValue={text("publishAt")} aria-invalid={!!error("publishAt")} aria-describedby={by("publishAt")} />
        </FormField>
      </div>

      <FormField label="Slug" htmlFor="slug" error={error("slug")} hint={mode === "create" ? "Optional. Made from the title when empty." : "It never changes unless you tick the box below."}>
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={text("slug")} aria-invalid={!!error("slug")} aria-describedby={by("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the old address will stop working.</span>
        </label>
      )}

      <SeoFields canEdit={canEditSeo} errors={{ seoTitle: error("seoTitle"), seoDescription: error("seoDescription"), seoCanonical: error("seoCanonical"), seoOgImage: error("seoOgImage"), seoRobots: error("seoRobots") }}
        value={{ seoTitle: text("seoTitle"), seoDescription: text("seoDescription"), seoCanonical: text("seoCanonical"), seoOgImage: text("seoOgImage"), seoRobots: text("seoRobots") }} />

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
