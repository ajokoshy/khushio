"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { REDIRECT_STATUSES, REDIRECT_STATUS_LABELS } from "@/modules/redirects/path";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { fromPath: string; toPath: string; statusCode: string };
  cancelHref: string;
};

export function RedirectForm({ mode, action, initial, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: "fromPath" | "toPath" | "statusCode") => state?.values?.[name] ?? initial[name];
  const [status, setStatus] = useState(value("statusCode"));
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      <FormField label="Old address" htmlFor="fromPath" required error={error("fromPath")} hint="The address people or search engines still use, for example /products/old-name. Letters are made lower case.">
        <input id="fromPath" name="fromPath" maxLength={300} className={inputClass} defaultValue={value("fromPath")} autoCapitalize="none" spellCheck={false} aria-invalid={!!error("fromPath")} aria-describedby={by("fromPath")} />
      </FormField>
      <FormField label="What should happen" htmlFor="statusCode" required error={error("statusCode")}>
        <select id="statusCode" name="statusCode" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {REDIRECT_STATUSES.map((s) => <option key={s} value={s}>{REDIRECT_STATUS_LABELS[s]}</option>)}
        </select>
      </FormField>
      {status !== "410" && (
        <FormField label="New address" htmlFor="toPath" required error={error("toPath")} hint="A path on this site, for example /products/new-name. It must not itself be redirected (no chains).">
          <input id="toPath" name="toPath" maxLength={300} className={inputClass} defaultValue={value("toPath")} autoCapitalize="none" spellCheck={false} aria-invalid={!!error("toPath")} aria-describedby={by("toPath")} />
        </FormField>
      )}
      <div className="flex items-center gap-4">
        <SubmitButton>{mode === "create" ? "Add redirect" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
