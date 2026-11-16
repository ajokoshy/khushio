"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Option = { id: string; name: string; isActive: boolean };
type Initial = { merchantId: string; networkId: string; externalProgramId: string; commissionNote: string; isActive: boolean };

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: Initial;
  merchants: Option[];
  networks: Option[];
  cancelHref: string;
};

export function ProgramForm({ mode, action, initial, merchants, networks, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: Exclude<keyof Initial, "isActive">) => state?.values?.[name] ?? initial[name];
  const active = state?.values ? state.values.isActive === "on" : initial.isActive;
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  const label = (o: Option) => (o.isActive ? o.name : `${o.name} (archived)`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Merchant" htmlFor="merchantId" required error={error("merchantId")}>
        <select id="merchantId" name="merchantId" required className={inputClass} defaultValue={text("merchantId")} aria-invalid={!!error("merchantId")} aria-describedby={describedBy("merchantId")}>
          <option value="">Choose a merchant</option>
          {merchants.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        </select>
      </FormField>

      <FormField label="Network" htmlFor="networkId" required error={error("networkId")}>
        <select id="networkId" name="networkId" required className={inputClass} defaultValue={text("networkId")} aria-invalid={!!error("networkId")} aria-describedby={describedBy("networkId")}>
          <option value="">Choose a network</option>
          {networks.map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
        </select>
      </FormField>

      <FormField label="Programme ID" htmlFor="externalProgramId" error={error("externalProgramId")} hint="Optional. The merchant's ID inside the network, if it gave you one.">
        <input id="externalProgramId" name="externalProgramId" maxLength={120} className={inputClass} defaultValue={text("externalProgramId")} aria-invalid={!!error("externalProgramId")} aria-describedby={describedBy("externalProgramId")} />
      </FormField>

      <FormField label="Commission note" htmlFor="commissionNote" error={error("commissionNote")} hint="Optional. For example: 4% on electronics, 24-hour cookie.">
        <textarea id="commissionNote" name="commissionNote" rows={3} maxLength={500} className={inputClass} defaultValue={text("commissionNote")} aria-invalid={!!error("commissionNote")} aria-describedby={describedBy("commissionNote")} />
      </FormField>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={active} className="mt-1" />
        <span>Active</span>
      </label>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create programme" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
