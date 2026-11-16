"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Merchant = { id: string; name: string; isActive: boolean; allowedDomains: string[] };
type Initial = { merchantId: string; productSlug: string; destinationUrl: string; trackingParams: string; slug: string; isActive: boolean };

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: Initial;
  merchants: Merchant[];
  cancelHref: string;
};

export function LinkForm({ mode, action, initial, merchants, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: Exclude<keyof Initial, "isActive">) => state?.values?.[name] ?? initial[name];
  const active = state?.values ? state.values.isActive === "on" : initial.isActive;
  const error = (name: string) => state?.fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Merchant" htmlFor="merchantId" required error={error("merchantId")} hint="The destination must be on one of this merchant's allowed domains.">
        <select id="merchantId" name="merchantId" required className={inputClass} defaultValue={text("merchantId")} aria-invalid={!!error("merchantId")} aria-describedby={describedBy("merchantId")}>
          <option value="">Choose a merchant</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>{m.isActive ? m.name : `${m.name} (archived)`}{m.allowedDomains.length > 0 ? ` - ${m.allowedDomains.join(", ")}` : " - no domains yet"}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Product slug" htmlFor="productSlug" error={error("productSlug")} hint="Optional. The slug shown on the product's edit page. The link then appears as a Buy button on that product's page.">
        <input id="productSlug" name="productSlug" maxLength={80} className={`${inputClass} font-mono text-sm`} defaultValue={text("productSlug")} aria-invalid={!!error("productSlug")} aria-describedby={describedBy("productSlug")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <FormField label="Destination address" htmlFor="destinationUrl" required error={error("destinationUrl")} hint="The store's page for this product, starting with https://. This is where visitors end up.">
        <input id="destinationUrl" name="destinationUrl" type="url" inputMode="url" required maxLength={2048} className={inputClass} defaultValue={text("destinationUrl")} aria-invalid={!!error("destinationUrl")} aria-describedby={describedBy("destinationUrl")} />
      </FormField>

      <FormField
        label="Tracking parameters"
        htmlFor="trackingParams"
        error={error("trackingParams")}
        hint="Optional. Added to the address on every visit, for example tag=khushio-21&ascsubtag={subid}. {subid} becomes this link's slug, so a network report can be matched back to the link. A parameter already in the address is replaced."
      >
        <textarea id="trackingParams" name="trackingParams" rows={3} maxLength={500} className={`${inputClass} font-mono text-sm`} defaultValue={text("trackingParams")} aria-invalid={!!error("trackingParams")} aria-describedby={describedBy("trackingParams")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <FormField
        label="Slug"
        htmlFor="slug"
        error={error("slug")}
        hint={mode === "create" ? "The last part of the link address (/go/your-slug). Leave empty to make one from the merchant and product." : "Part of the link address (/go/your-slug). It never changes unless you tick the box below."}
      >
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={text("slug")} aria-invalid={!!error("slug")} aria-describedby={describedBy("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the old /go address will stop working.</span>
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={active} className="mt-1" />
        <span>Active. An inactive link answers 404 and its Buy button disappears.</span>
      </label>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create link" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
