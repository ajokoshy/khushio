"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Initial = { merchantId: string; dealSlug: string; code: string; discountType: string; discountValue: string; currency: string; minSpend: string; startsAt: string; endsAt: string; isActive: boolean };
type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: Initial;
  merchants: { id: string; name: string; isActive: boolean }[];
  discountTypes: readonly { value: string; label: string }[];
  currencies: readonly string[];
  cancelHref: string;
};

export function CouponForm({ mode, action, initial, merchants, discountTypes, currencies, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: Exclude<keyof Initial, "isActive">) => state?.values?.[name] ?? initial[name];
  const active = state?.values ? state.values.isActive === "on" : initial.isActive;
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Store" htmlFor="merchantId" required error={error("merchantId")}>
        <select id="merchantId" name="merchantId" required className={inputClass} defaultValue={text("merchantId")} aria-invalid={!!error("merchantId")}>
          <option value="">Choose a store</option>
          {merchants.map((m) => <option key={m.id} value={m.id}>{m.isActive ? m.name : `${m.name} (archived)`}</option>)}
        </select>
      </FormField>

      <FormField label="Deal slug" htmlFor="dealSlug" error={error("dealSlug")} hint="Optional. The deal this code belongs to (same store). Revealing the code then also counts as a click on the deal's link. Empty makes a stand-alone coupon.">
        <input id="dealSlug" name="dealSlug" maxLength={80} className={`${inputClass} font-mono text-sm`} defaultValue={text("dealSlug")} aria-invalid={!!error("dealSlug")} aria-describedby={by("dealSlug")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <FormField label="Coupon code" htmlFor="code" required error={error("code")} hint="Exactly as the store wants it. A store can have each code once; to run it again, change the dates.">
        <input id="code" name="code" required maxLength={60} className={`${inputClass} font-mono`} defaultValue={text("code")} aria-invalid={!!error("code")} aria-describedby={by("code")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Discount" htmlFor="discountType" required error={error("discountType")}>
          <select id="discountType" name="discountType" required className={inputClass} defaultValue={text("discountType")}>
            {discountTypes.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </FormField>
        <FormField label="Value" htmlFor="discountValue" error={error("discountValue")} hint="15 for 15%, or the amount off. Ignored for free shipping.">
          <input id="discountValue" name="discountValue" inputMode="decimal" className={inputClass} defaultValue={text("discountValue")} aria-invalid={!!error("discountValue")} aria-describedby={by("discountValue")} />
        </FormField>
        <FormField label="Currency" htmlFor="currency" error={error("currency")}>
          <select id="currency" name="currency" className={inputClass} defaultValue={text("currency")}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
      </div>

      <FormField label="Minimum spend" htmlFor="minSpend" error={error("minSpend")} hint="Optional, in the currency above.">
        <input id="minSpend" name="minSpend" inputMode="decimal" className={inputClass} defaultValue={text("minSpend")} aria-invalid={!!error("minSpend")} aria-describedby={by("minSpend")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Starts (India time)" htmlFor="startsAt" error={error("startsAt")} hint={mode === "create" ? "Empty means now." : "Empty keeps the current start."}>
          <input id="startsAt" name="startsAt" type="datetime-local" className={inputClass} defaultValue={text("startsAt")} aria-invalid={!!error("startsAt")} aria-describedby={by("startsAt")} />
        </FormField>
        <FormField label="Ends (India time)" htmlFor="endsAt" error={error("endsAt")} hint="Empty means no end date.">
          <input id="endsAt" name="endsAt" type="datetime-local" className={inputClass} defaultValue={text("endsAt")} aria-invalid={!!error("endsAt")} aria-describedby={by("endsAt")} />
        </FormField>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={active} className="mt-1" />
        <span>Active. An inactive coupon is never shown.</span>
      </label>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create coupon" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
