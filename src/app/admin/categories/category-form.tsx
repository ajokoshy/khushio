"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";
import type { ParentOption } from "@/modules/discover/types";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { name: string; slug: string; parentId: string; description: string; sortOrder: number };
  parentOptions: ParentOption[];
  cancelHref: string;
};

export function CategoryForm({ mode, action, initial, parentOptions, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: keyof Props["initial"]) => state?.values?.[name] ?? String(initial[name]);
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Name" htmlFor="name" required error={error("name")}>
        <input id="name" name="name" required maxLength={120} className={inputClass} defaultValue={value("name")} aria-invalid={!!error("name")} aria-describedby={describedBy("name")} />
      </FormField>

      <FormField label="Parent category" htmlFor="parentId" error={error("parentId")} hint="Leave empty for a top-level category. Categories can be nested as deep as you need.">
        <select id="parentId" name="parentId" className={inputClass} defaultValue={value("parentId")} aria-invalid={!!error("parentId")} aria-describedby={describedBy("parentId")}>
          <option value="">None (top level)</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        error={error("slug")}
        hint={mode === "create" ? "The last part of the web address. Leave empty to make one from the name." : "Part of the public web address. It never changes unless you tick the box below."}
      >
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={value("slug")} aria-invalid={!!error("slug")} aria-describedby={describedBy("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the public address of this category will change.</span>
        </label>
      )}

      <FormField label="Description" htmlFor="description" error={error("description")} hint="Optional. Up to 500 characters.">
        <textarea id="description" name="description" rows={3} maxLength={500} className={inputClass} defaultValue={value("description")} aria-describedby={describedBy("description")} />
      </FormField>

      <FormField label="Sort order" htmlFor="sortOrder" error={error("sortOrder")} hint="Smaller numbers come first among categories with the same parent.">
        <input id="sortOrder" name="sortOrder" type="number" inputMode="numeric" min={0} max={9999} className={`${inputClass} max-w-[10rem]`} defaultValue={value("sortOrder")} aria-invalid={!!error("sortOrder")} aria-describedby={describedBy("sortOrder")} />
      </FormField>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create category" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
