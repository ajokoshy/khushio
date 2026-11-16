"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: { name: string; key: string; isActive: boolean };
  cancelHref: string;
};

export function NetworkForm({ mode, action, initial, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: "name" | "key") => state?.values?.[name] ?? initial[name];
  const active = state?.values ? state.values.isActive === "on" : initial.isActive;
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Name" htmlFor="name" required error={error("name")} hint="For example Cuelinks, Amazon Associates, EarnKaro.">
        <input id="name" name="name" required maxLength={120} className={inputClass} defaultValue={text("name")} aria-invalid={!!error("name")} aria-describedby={describedBy("name")} />
      </FormField>

      <FormField label="Key" htmlFor="key" error={error("key")} hint={mode === "create" ? "A short lower-case label, for example cuelinks. Leave empty to make one from the name." : "A short lower-case label. It is only used inside the admin."}>
        <input id="key" name="key" maxLength={80} className={inputClass} defaultValue={text("key")} aria-invalid={!!error("key")} aria-describedby={describedBy("key")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={active} className="mt-1" />
        <span>Active. Untick when you stop using this network.</span>
      </label>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create network" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
