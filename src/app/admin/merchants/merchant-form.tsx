"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { name: string; slug: string; websiteUrl: string; allowedDomains: string; logoUrl: string };
  cancelHref: string;
};

export function MerchantForm({ mode, action, initial, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: keyof Props["initial"]) => state?.values?.[name] ?? initial[name];
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Name" htmlFor="name" required error={error("name")}>
        <input id="name" name="name" required maxLength={120} className={inputClass} defaultValue={value("name")} aria-invalid={!!error("name")} aria-describedby={describedBy("name")} />
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        error={error("slug")}
        hint={mode === "create" ? "The last part of the web address of the store page. Leave empty to make one from the name." : "Part of the public web address. It never changes unless you tick the box below."}
      >
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={value("slug")} aria-invalid={!!error("slug")} aria-describedby={describedBy("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the public address of this store will change.</span>
        </label>
      )}

      <FormField label="Website" htmlFor="websiteUrl" error={error("websiteUrl")} hint="Optional. The store's home page, for example https://www.amazon.in">
        <input id="websiteUrl" name="websiteUrl" type="url" inputMode="url" maxLength={2048} className={inputClass} defaultValue={value("websiteUrl")} aria-invalid={!!error("websiteUrl")} aria-describedby={describedBy("websiteUrl")} />
      </FormField>

      <FormField
        label="Allowed domains"
        htmlFor="allowedDomains"
        error={error("allowedDomains")}
        hint="One domain per line, for example amazon.in. Affiliate links for this merchant may only send visitors to these domains and their subdomains (amazon.in also allows www.amazon.in). Leave out https:// and any path."
      >
        <textarea
          id="allowedDomains"
          name="allowedDomains"
          rows={5}
          className={`${inputClass} font-mono text-sm`}
          defaultValue={value("allowedDomains")}
          aria-invalid={!!error("allowedDomains")}
          aria-describedby={describedBy("allowedDomains")}
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormField>

      <FormField label="Logo address" htmlFor="logoUrl" error={error("logoUrl")} hint="Optional. A full https:// address.">
        <input id="logoUrl" name="logoUrl" type="url" inputMode="url" maxLength={2048} className={inputClass} defaultValue={value("logoUrl")} aria-invalid={!!error("logoUrl")} aria-describedby={describedBy("logoUrl")} />
      </FormField>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create merchant" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
