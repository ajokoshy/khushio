"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { area: string; label: string; href: string; isActive: boolean };
  areas: readonly { value: string; label: string }[];
  cancelHref: string;
};

export function NavForm({ mode, action, initial, areas, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: "area" | "label" | "href") => state?.values?.[name] ?? initial[name];
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      {mode === "create" ? (
        <FormField label="Where" htmlFor="area" required error={error("area")}>
          <select id="area" name="area" className={inputClass} defaultValue={value("area")}>{areas.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
        </FormField>
      ) : (
        <input type="hidden" name="area" value={initial.area} />
      )}
      <FormField label="Link text" htmlFor="label" required error={error("label")} hint="Up to 40 characters.">
        <input id="label" name="label" maxLength={40} className={inputClass} defaultValue={value("label")} aria-invalid={!!error("label")} aria-describedby={by("label")} />
      </FormField>
      <FormField label="Address" htmlFor="href" required error={error("href")} hint="A path on this site such as /deals, or a full address starting with https://.">
        <input id="href" name="href" maxLength={2048} className={inputClass} defaultValue={value("href")} autoCapitalize="none" spellCheck={false} aria-invalid={!!error("href")} aria-describedby={by("href")} />
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={state?.values ? state.values.isActive === "on" : initial.isActive} className="mt-1" />
        <span>Shown to visitors</span>
      </label>
      <div className="flex items-center gap-4">
        <SubmitButton>{mode === "create" ? "Add link" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
