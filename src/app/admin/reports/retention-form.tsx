"use client";

import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";
import { updateRetentionAction } from "./actions";

export function RetentionForm({ current, min, max }: { current: number; min: number; max: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateRetentionAction, null);
  const error = state?.fieldErrors?.retentionDays;
  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-wrap items-end gap-3">
      {state?.error && <p role="alert" className="w-full rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      <div className="w-40">
        <FormField label="Keep raw clicks for (days)" htmlFor="retentionDays" error={error}>
          <input id="retentionDays" name="retentionDays" type="number" inputMode="numeric" min={min} max={max} className={inputClass} defaultValue={state?.values?.retentionDays ?? String(current)} aria-invalid={!!error} aria-describedby={error ? "retentionDays-error" : undefined} />
        </FormField>
      </div>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
