"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { name: string; slug: string; description: string; logoUrl: string; isFeatured: boolean };
  cancelHref: string;
};

export function BrandForm({ mode, action, initial, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: "name" | "slug" | "description" | "logoUrl") => state?.values?.[name] ?? initial[name];
  const featured = state?.values ? state.values.isFeatured === "on" : initial.isFeatured;
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Name" htmlFor="name" required error={error("name")}>
        <input id="name" name="name" required maxLength={120} className={inputClass} defaultValue={text("name")} aria-invalid={!!error("name")} aria-describedby={describedBy("name")} />
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        error={error("slug")}
        hint={mode === "create" ? "The last part of the web address. Leave empty to make one from the name." : "Part of the public web address. It never changes unless you tick the box below."}
      >
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={text("slug")} aria-invalid={!!error("slug")} aria-describedby={describedBy("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the public address of this brand will change.</span>
        </label>
      )}

      <FormField label="Description" htmlFor="description" error={error("description")} hint="Optional. Up to 1000 characters.">
        <textarea id="description" name="description" rows={4} maxLength={1000} className={inputClass} defaultValue={text("description")} aria-describedby={describedBy("description")} />
      </FormField>

      <FormField label="Logo address" htmlFor="logoUrl" error={error("logoUrl")} hint="Optional. A full https:// address. Image uploads arrive with the products release.">
        <input id="logoUrl" name="logoUrl" type="url" inputMode="url" maxLength={2048} className={inputClass} defaultValue={text("logoUrl")} aria-invalid={!!error("logoUrl")} aria-describedby={describedBy("logoUrl")} />
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isFeatured" defaultChecked={featured} />
        Featured brand (can be highlighted on the site)
      </label>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create brand" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
