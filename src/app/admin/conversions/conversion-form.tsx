"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Option = { id: string; name: string };
type Initial = { networkId: string; externalOrderId: string; linkSlug: string; commission: string; currency: string; status: string; convertedAt: string };

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: Initial;
  networks: Option[];
  currencies: readonly string[];
  statuses: readonly { value: string; label: string }[];
  cancelHref: string;
};

export function ConversionForm({ mode, action, initial, networks, currencies, statuses, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: keyof Initial) => state?.values?.[name] ?? initial[name];
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Network" htmlFor="networkId" required error={error("networkId")}>
        <select id="networkId" name="networkId" required className={inputClass} defaultValue={value("networkId")} aria-invalid={!!error("networkId")} aria-describedby={describedBy("networkId")}>
          <option value="">Choose a network</option>
          {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </FormField>

      <FormField label="Order id" htmlFor="externalOrderId" required error={error("externalOrderId")} hint="The network's order or transaction id. An order is recognised by network and order id, so it can only be entered once.">
        <input id="externalOrderId" name="externalOrderId" required maxLength={120} className={inputClass} defaultValue={value("externalOrderId")} aria-invalid={!!error("externalOrderId")} aria-describedby={describedBy("externalOrderId")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <FormField label="Link slug" htmlFor="linkSlug" error={error("linkSlug")} hint="Optional. The affiliate link that earned it (the sub-ID in the network's report).">
        <input id="linkSlug" name="linkSlug" maxLength={80} className={`${inputClass} font-mono text-sm`} defaultValue={value("linkSlug")} aria-invalid={!!error("linkSlug")} aria-describedby={describedBy("linkSlug")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Commission" htmlFor="commission" required error={error("commission")} hint="The normal amount, for example 120.50. Write 0 if there is none.">
          <input id="commission" name="commission" required inputMode="decimal" className={inputClass} defaultValue={value("commission")} aria-invalid={!!error("commission")} aria-describedby={describedBy("commission")} />
        </FormField>
        <FormField label="Currency" htmlFor="currency" error={error("currency")}>
          <select id="currency" name="currency" className={inputClass} defaultValue={value("currency")} aria-invalid={!!error("currency")}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Status" htmlFor="status" required error={error("status")}>
          <select id="status" name="status" required className={inputClass} defaultValue={value("status")} aria-invalid={!!error("status")}>
            {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Date and time" htmlFor="convertedAt" required error={error("convertedAt")} hint="India time (IST).">
          <input id="convertedAt" name="convertedAt" type="datetime-local" required className={inputClass} defaultValue={value("convertedAt")} aria-invalid={!!error("convertedAt")} aria-describedby={describedBy("convertedAt")} />
        </FormField>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Add conversion" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
