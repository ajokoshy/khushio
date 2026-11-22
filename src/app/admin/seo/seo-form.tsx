"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/shared/admin/form-state";
import { SeoFields } from "@/shared/admin/content/seo-fields";
import { SubmitButton } from "@/shared/admin/submit-button";

type Value = { seoTitle: string; seoDescription: string; seoCanonical: string; seoOgImage: string; seoRobots: string };

export function SeoForm({ action, initial }: { action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>; initial: Value }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = { ...initial, ...(state?.values ?? {}) } as Value;
  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      <SeoFields value={value} errors={state?.fieldErrors ?? {}} canEdit />
      <div className="flex items-center gap-4">
        <SubmitButton>Save</SubmitButton>
        <Link href="/admin/seo" className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
