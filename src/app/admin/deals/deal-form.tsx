"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";

type Initial = {
  title: string; slug: string; merchantId: string; type: string; description: string; affiliateLinkSlug: string;
  startsAt: string; endsAt: string; isFeatured: boolean; sortOrder: string; status: string; productSlugs: string; categorySlugs: string;
};
type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: Initial;
  merchants: { id: string; name: string; isActive: boolean }[];
  types: readonly { value: string; label: string }[];
  statuses: readonly { value: string; label: string }[];
  cancelHref: string;
};

export function DealForm({ mode, action, initial, merchants, types, statuses, cancelHref }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const text = (name: Exclude<keyof Initial, "isFeatured">) => state?.values?.[name] ?? initial[name];
  const featured = state?.values ? state.values.isFeatured === "on" : initial.isFeatured;
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

      <FormField label="Title" htmlFor="title" required error={error("title")} hint="Shown on the site, for example “20% off headphones at Amazon India”.">
        <input id="title" name="title" required maxLength={120} className={inputClass} defaultValue={text("title")} aria-invalid={!!error("title")} aria-describedby={by("title")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Store" htmlFor="merchantId" required error={error("merchantId")}>
          <select id="merchantId" name="merchantId" required className={inputClass} defaultValue={text("merchantId")} aria-invalid={!!error("merchantId")}>
            <option value="">Choose a store</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.isActive ? m.name : `${m.name} (archived)`}</option>)}
          </select>
        </FormField>
        <FormField label="Type" htmlFor="type" required error={error("type")}>
          <select id="type" name="type" required className={inputClass} defaultValue={text("type")}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FormField>
      </div>

      <FormField label="Description" htmlFor="description" error={error("description")} hint="Optional. Terms, what is included, how to claim it.">
        <textarea id="description" name="description" rows={3} maxLength={2000} className={inputClass} defaultValue={text("description")} aria-invalid={!!error("description")} aria-describedby={by("description")} />
      </FormField>

      <FormField label="Affiliate link slug" htmlFor="affiliateLinkSlug" error={error("affiliateLinkSlug")} hint="Optional. The link behind the button (from Affiliate links). It must belong to the same store. Without it the offer has no button.">
        <input id="affiliateLinkSlug" name="affiliateLinkSlug" maxLength={80} className={`${inputClass} font-mono text-sm`} defaultValue={text("affiliateLinkSlug")} aria-invalid={!!error("affiliateLinkSlug")} aria-describedby={by("affiliateLinkSlug")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Starts (India time)" htmlFor="startsAt" error={error("startsAt")} hint={mode === "create" ? "Empty means now. A later time keeps the offer hidden until then." : "Empty keeps the current start."}>
          <input id="startsAt" name="startsAt" type="datetime-local" className={inputClass} defaultValue={text("startsAt")} aria-invalid={!!error("startsAt")} aria-describedby={by("startsAt")} />
        </FormField>
        <FormField label="Ends (India time)" htmlFor="endsAt" error={error("endsAt")} hint="Empty means no end date. The offer disappears by itself at this time.">
          <input id="endsAt" name="endsAt" type="datetime-local" className={inputClass} defaultValue={text("endsAt")} aria-invalid={!!error("endsAt")} aria-describedby={by("endsAt")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Status" htmlFor="status" required error={error("status")} hint="Only Published offers can be seen, and only inside their dates.">
          <select id="status" name="status" required className={inputClass} defaultValue={text("status")}>
            {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FormField>
        <FormField label="Order" htmlFor="sortOrder" error={error("sortOrder")} hint="Lower numbers come first (0 to 9999).">
          <input id="sortOrder" name="sortOrder" inputMode="numeric" className={inputClass} defaultValue={text("sortOrder")} aria-invalid={!!error("sortOrder")} aria-describedby={by("sortOrder")} />
        </FormField>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isFeatured" defaultChecked={featured} className="mt-1" />
        <span>Featured. Featured offers are listed first.</span>
      </label>

      <FormField label="Only for these products" htmlFor="productSlugs" error={error("productSlugs")} hint="Optional. Product slugs, one per line or separated by commas. Leave this and the categories empty for a store-wide offer.">
        <textarea id="productSlugs" name="productSlugs" rows={3} className={`${inputClass} font-mono text-sm`} defaultValue={text("productSlugs")} aria-invalid={!!error("productSlugs")} aria-describedby={by("productSlugs")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      <FormField label="Only for these categories" htmlFor="categorySlugs" error={error("categorySlugs")} hint="Optional. Category slugs. An offer on a category also applies to the products of its subcategories.">
        <textarea id="categorySlugs" name="categorySlugs" rows={2} className={`${inputClass} font-mono text-sm`} defaultValue={text("categorySlugs")} aria-invalid={!!error("categorySlugs")} aria-describedby={by("categorySlugs")} autoCapitalize="none" spellCheck={false} />
      </FormField>

      <FormField label="Slug" htmlFor="slug" error={error("slug")} hint={mode === "create" ? "Optional. Made from the title when empty." : "It never changes unless you tick the box below."}>
        <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={text("slug")} aria-invalid={!!error("slug")} aria-describedby={by("slug")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      {mode === "edit" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSlugChange" defaultChecked={state?.values?.confirmSlugChange === "on"} className="mt-1" />
          <span>I am changing the slug and understand the old one will stop working.</span>
        </label>
      )}

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? "Create deal" : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
