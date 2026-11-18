"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PickerActions } from "@/shared/admin/content/image-picker";
import { RichTextEditor } from "@/shared/admin/content/rich-text-editor";
import { SeoFields } from "@/shared/admin/content/seo-fields";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

export type PageFormInitial = {
  title: string; slug: string; status: string; publishAt: string; content: unknown;
  seoTitle: string; seoDescription: string; seoCanonical: string; seoOgImage: string; seoRobots: string;
};
type TextKey = Exclude<keyof PageFormInitial, "content">;

type Props = PickerActions & {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: PageFormInitial;
  statuses: readonly { value: string; label: string; publishControlled: boolean }[];
  canPublish: boolean;
  canEditSeo: boolean;
  cloudName: string | null;
  uploadsEnabled: boolean;
  cancelHref: string;
};

export function PageForm({ mode, action, initial, statuses, canPublish, canEditSeo, cloudName, uploadsEnabled, cancelHref, search, sign, record }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: TextKey) => state?.values?.[name] ?? initial[name];
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  const content = (() => {
    const typed = state?.values?.content;
    if (!typed) return initial.content;
    try { return JSON.parse(typed) as unknown; } catch { return initial.content; }
  })();

  return (
    <form action={formAction} noValidate className="max-w-3xl space-y-6">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      <FormField label="Title" htmlFor="title" required error={error("title")}>
        <input id="title" name="title" required maxLength={120} className={inputClass} defaultValue={text("title")} aria-invalid={!!error("title")} aria-describedby={by("title")} />
      </FormField>
      <div>
        <p className="mb-1 text-sm font-medium">Text</p>
        {error("content") && <p id="content-error" role="alert" className="mb-1 text-sm text-coral-600">{error("content")}</p>}
        <RichTextEditor name="content" initial={content} cloudName={cloudName} uploadsEnabled={uploadsEnabled} invalid={!!error("content")} describedBy={error("content") ? "content-error" : undefined} search={search} sign={sign} record={record} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Status" htmlFor="status" required error={error("status")} hint={canPublish ? "Visitors see a page at /p/<slug> while it is Published (or Scheduled and due)." : "Your account can save drafts and send them for review."}>
          <select id="status" name="status" required className={inputClass} defaultValue={text("status")}>
            {statuses.map((s) => <option key={s.value} value={s.value} disabled={!canPublish && s.publishControlled && s.value !== initial.status}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Go-live time (India time)" htmlFor="publishAt" error={error("publishAt")} hint="Needed for Scheduled. Empty for Published means now.">
          <input id="publishAt" name="publishAt" type="datetime-local" className={inputClass} defaultValue={text("publishAt")} aria-invalid={!!error("publishAt")} aria-describedby={by("publishAt")} />
        </FormField>
      </div>
      <FormField label="Slug" htmlFor="slug" error={error("slug")} hint={mode === "create" ? "Optional. Made from the title when empty. The page is at /p/<slug>." : "It never changes unless you tick the box below."}>
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
        <SubmitButton>{mode === "create" ? "Create page" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
