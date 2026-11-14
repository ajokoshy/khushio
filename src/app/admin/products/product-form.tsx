"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ADMIN_TIMEZONE_LABEL } from "@/core/validation/datetime";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/core/validation/money";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { PRODUCT_STATUSES, STATUS_LABELS, type ProductStatus } from "@/modules/products/types";

export type VariantValues = { id: string; label: string; sku: string; price: string; currency: string };
export type AttributeValues = { name: string; value: string };

export type ProductFormValues = {
  name: string;
  slug: string;
  summary: string;
  description: string;
  brandId: string;
  status: ProductStatus;
  /** datetime-local text in India time, or "". */
  publishAt: string;
  isFeatured: boolean;
  primaryCategoryId: string;
  categoryIds: string[];
  tags: string;
  attributes: AttributeValues[];
  variants: VariantValues[];
};

type Option = { id: string; label: string };

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  initial: ProductFormValues;
  brands: Option[];
  categories: Option[];
  /** Whether this person may publish, schedule and archive (product:publish). Decides which statuses are offered. */
  canPublish: boolean;
  cancelHref: string;
};

const emptyVariant = (): VariantValues => ({ id: "", label: "", sku: "", price: "", currency: DEFAULT_CURRENCY });
const emptyAttribute = (): AttributeValues => ({ name: "", value: "" });

let rowCounter = 0;
const rowKey = () => `row-${++rowCounter}`;

/**
 * The product form. It keeps every field in the browser while it is being saved, so a validation message never
 * wipes what was typed (the page does not reload and no field is reset).
 */
export function ProductForm({ mode, action, initial, brands, categories, canPublish, cancelHref }: Props) {
  const [state, setState] = useState<FormState>(null);
  const [pending, startTransition] = useTransition();
  const alertRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<ProductStatus>(initial.status);
  const [primary, setPrimary] = useState(initial.primaryCategoryId);
  const [extra, setExtra] = useState<Set<string>>(new Set(initial.categoryIds));
  const [variants, setVariants] = useState(() => (initial.variants.length > 0 ? initial.variants : [emptyVariant()]).map((v) => ({ key: rowKey(), ...v })));
  const [attributes, setAttributes] = useState(() => (initial.attributes.length > 0 ? initial.attributes : [emptyAttribute()]).map((a) => ({ key: rowKey(), ...a })));

  const fieldErrors = state?.fieldErrors;
  const error = (name: string) => fieldErrors?.[name];
  const describedBy = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);

  useEffect(() => {
    if (state) alertRef.current?.focus();
  }, [state]);

  // Statuses offered: someone without product:publish can only use the two draft statuses; a new product starts as one of them anyway.
  const offered = PRODUCT_STATUSES.filter((s) => {
    if (mode === "create") return s === "DRAFT" || s === "REVIEW";
    return canPublish || s === "DRAFT" || s === "REVIEW" || s === initial.status;
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(null, formData);
      setState(result);
    });
  };

  const hasFieldErrors = !!fieldErrors && Object.keys(fieldErrors).length > 0;

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-8">
      <div ref={alertRef} tabIndex={-1} className="outline-none">
        {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
        {hasFieldErrors && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">Some fields need attention. The messages are shown beside them.</p>}
      </div>

      <section className="space-y-5" aria-labelledby="basics-heading">
        <h2 id="basics-heading" className="text-xl">Basics</h2>
        <FormField label="Name" htmlFor="name" required error={error("name")}>
          <input id="name" name="name" required maxLength={120} className={inputClass} defaultValue={initial.name} aria-invalid={!!error("name")} aria-describedby={describedBy("name")} />
        </FormField>

        <FormField
          label="Slug"
          htmlFor="slug"
          error={error("slug")}
          hint={mode === "create" ? "The last part of the web address. Leave empty to make one from the name." : "Part of the public web address. It never changes unless you tick the box below."}
        >
          <input id="slug" name="slug" maxLength={80} className={inputClass} defaultValue={initial.slug} aria-invalid={!!error("slug")} aria-describedby={describedBy("slug")} autoCapitalize="none" spellCheck={false} />
        </FormField>
        {mode === "edit" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmSlugChange" className="mt-1" />
            <span>I am changing the slug and understand the public address of this product will change.</span>
          </label>
        )}

        <FormField label="Summary" htmlFor="summary" error={error("summary")} hint="One or two sentences shown on product cards. Up to 500 characters.">
          <textarea id="summary" name="summary" rows={2} maxLength={500} className={inputClass} defaultValue={initial.summary} aria-describedby={describedBy("summary")} />
        </FormField>
        <FormField label="Description" htmlFor="description" error={error("description")} hint="Shown on the product page. Plain text; a blank line starts a new paragraph.">
          <textarea id="description" name="description" rows={8} maxLength={10000} className={inputClass} defaultValue={initial.description} aria-describedby={describedBy("description")} />
        </FormField>

        <FormField label="Brand" htmlFor="brandId" error={error("brandId")}>
          <select id="brandId" name="brandId" defaultValue={initial.brandId} className={inputClass} aria-describedby={describedBy("brandId")}>
            <option value="">No brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </FormField>
      </section>

      <section className="space-y-5" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-xl">Categories</h2>
        <FormField label="Main category" htmlFor="primaryCategoryId" error={error("primaryCategoryId")} hint="Required before the product can be published. Breadcrumbs and related products use it.">
          <select
            id="primaryCategoryId"
            name="primaryCategoryId"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            className={inputClass}
            aria-invalid={!!error("primaryCategoryId")}
            aria-describedby={describedBy("primaryCategoryId")}
          >
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </FormField>

        <fieldset aria-describedby={error("categoryIds") ? "categoryIds-error" : undefined}>
          <legend className="text-sm font-medium">Also show in</legend>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-cream-200 bg-cream-50 p-3">
            {categories.length === 0 && <p className="text-sm text-ink-600">No categories yet. Create one first.</p>}
            {categories.filter((c) => c.id !== primary).map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  checked={extra.has(c.id)}
                  onChange={(e) => setExtra((prev) => { const next = new Set(prev); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })}
                />
                {c.label}
              </label>
            ))}
          </div>
          {error("categoryIds") && <p id="categoryIds-error" role="alert" className="mt-1 text-sm text-coral-600">{error("categoryIds")}</p>}
        </fieldset>
      </section>

      <section className="space-y-5" aria-labelledby="variants-heading">
        <div>
          <h2 id="variants-heading" className="text-xl">Variants and prices</h2>
          <p className="mt-1 text-sm text-ink-600">One row per size, colour or model. Type prices as you would write them, for example 1299 or 1,299.50. Leave the price empty if it is not known.</p>
        </div>
        <ul className="space-y-4">
          {variants.map((v, i) => (
            <li key={v.key} className="rounded-xl border border-cream-200 bg-cream-50 p-3">
              <input type="hidden" name={`variants.${i}.id`} value={v.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Label" htmlFor={`variants.${i}.label`} required error={error(`variants.${i}.label`)}>
                  <input
                    id={`variants.${i}.label`}
                    name={`variants.${i}.label`}
                    maxLength={120}
                    className={inputClass}
                    value={v.label}
                    onChange={(e) => setVariants((rows) => rows.map((r, n) => (n === i ? { ...r, label: e.target.value } : r)))}
                    aria-invalid={!!error(`variants.${i}.label`)}
                    aria-describedby={error(`variants.${i}.label`) ? `variants.${i}.label-error` : undefined}
                  />
                </FormField>
                <FormField label="SKU" htmlFor={`variants.${i}.sku`} error={error(`variants.${i}.sku`)}>
                  <input
                    id={`variants.${i}.sku`}
                    name={`variants.${i}.sku`}
                    maxLength={80}
                    className={inputClass}
                    value={v.sku}
                    onChange={(e) => setVariants((rows) => rows.map((r, n) => (n === i ? { ...r, sku: e.target.value } : r)))}
                    aria-invalid={!!error(`variants.${i}.sku`)}
                    aria-describedby={error(`variants.${i}.sku`) ? `variants.${i}.sku-error` : undefined}
                  />
                </FormField>
                <FormField label="Price" htmlFor={`variants.${i}.price`} error={error(`variants.${i}.price`)}>
                  <input
                    id={`variants.${i}.price`}
                    name={`variants.${i}.price`}
                    inputMode="decimal"
                    className={inputClass}
                    value={v.price}
                    onChange={(e) => setVariants((rows) => rows.map((r, n) => (n === i ? { ...r, price: e.target.value } : r)))}
                    aria-invalid={!!error(`variants.${i}.price`)}
                    aria-describedby={error(`variants.${i}.price`) ? `variants.${i}.price-error` : undefined}
                  />
                </FormField>
                <FormField label="Currency" htmlFor={`variants.${i}.currency`} error={error(`variants.${i}.currency`)}>
                  <select
                    id={`variants.${i}.currency`}
                    name={`variants.${i}.currency`}
                    className={inputClass}
                    value={v.currency}
                    onChange={(e) => setVariants((rows) => rows.map((r, n) => (n === i ? { ...r, currency: e.target.value } : r)))}
                  >
                    {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
              </div>
              <button type="button" className="mt-3 text-sm text-coral-600 underline" onClick={() => setVariants((rows) => rows.filter((_, n) => n !== i))}>
                Remove this variant
              </button>
            </li>
          ))}
        </ul>
        {error("variants") && <p role="alert" className="text-sm text-coral-600">{error("variants")}</p>}
        <button type="button" className="rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100" onClick={() => setVariants((rows) => [...rows, { key: rowKey(), ...emptyVariant() }])}>
          Add a variant
        </button>
      </section>

      <section className="space-y-5" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-xl">Details and tags</h2>
        <div>
          <p className="text-sm font-medium">Attributes</p>
          <p className="mt-1 text-xs text-ink-600">Facts shown in a table on the product page, for example Material: Leather.</p>
          <ul className="mt-3 space-y-3">
            {attributes.map((a, i) => (
              <li key={a.key} className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-40">
                  <label htmlFor={`attributes.${i}.name`} className="sr-only">Attribute name</label>
                  <input
                    id={`attributes.${i}.name`}
                    name={`attributes.${i}.name`}
                    placeholder="Name"
                    maxLength={60}
                    className={inputClass}
                    value={a.name}
                    onChange={(e) => setAttributes((rows) => rows.map((r, n) => (n === i ? { ...r, name: e.target.value } : r)))}
                    aria-invalid={!!error(`attributes.${i}.name`)}
                  />
                  {error(`attributes.${i}.name`) && <p role="alert" className="mt-1 text-sm text-coral-600">{error(`attributes.${i}.name`)}</p>}
                </div>
                <div className="min-w-0 flex-1 basis-40">
                  <label htmlFor={`attributes.${i}.value`} className="sr-only">Attribute value</label>
                  <input
                    id={`attributes.${i}.value`}
                    name={`attributes.${i}.value`}
                    placeholder="Value"
                    maxLength={200}
                    className={inputClass}
                    value={a.value}
                    onChange={(e) => setAttributes((rows) => rows.map((r, n) => (n === i ? { ...r, value: e.target.value } : r)))}
                    aria-invalid={!!error(`attributes.${i}.value`)}
                  />
                  {error(`attributes.${i}.value`) && <p role="alert" className="mt-1 text-sm text-coral-600">{error(`attributes.${i}.value`)}</p>}
                </div>
                <button type="button" className="py-2 text-sm text-coral-600 underline" onClick={() => setAttributes((rows) => rows.filter((_, n) => n !== i))}>Remove</button>
              </li>
            ))}
          </ul>
          {error("attributes") && <p role="alert" className="mt-2 text-sm text-coral-600">{error("attributes")}</p>}
          <button type="button" className="mt-3 rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100" onClick={() => setAttributes((rows) => [...rows, { key: rowKey(), ...emptyAttribute() }])}>
            Add an attribute
          </button>
        </div>

        <FormField label="Tags" htmlFor="tags" error={error("tags")} hint="Separate with commas or new lines. Lower case, up to 20. Searching for a tag finds the product.">
          <textarea id="tags" name="tags" rows={2} className={inputClass} defaultValue={initial.tags} aria-describedby={describedBy("tags")} />
        </FormField>
      </section>

      <section className="space-y-5" aria-labelledby="publishing-heading">
        <h2 id="publishing-heading" className="text-xl">Publishing</h2>
        <FormField
          label="Status"
          htmlFor="status"
          error={error("status")}
          hint={mode === "create" ? "A new product starts as a draft. Add images on the next screen, then publish." : canPublish ? "Published and scheduled products need a main category and at least one image." : "Your account can save drafts. Publishing needs the publish permission."}
        >
          <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className={inputClass} aria-invalid={!!error("status")} aria-describedby={describedBy("status")}>
            {offered.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </FormField>

        {status === "SCHEDULED" && (
          <FormField label={`Goes live at (${ADMIN_TIMEZONE_LABEL})`} htmlFor="publishAt" required error={error("publishAt")} hint="The product appears on the site automatically at this time.">
            <input id="publishAt" name="publishAt" type="datetime-local" defaultValue={initial.publishAt} className={inputClass} aria-invalid={!!error("publishAt")} aria-describedby={describedBy("publishAt")} />
          </FormField>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isFeatured" defaultChecked={initial.isFeatured} />
          Featured product (shown first in some lists)
        </label>
      </section>

      <div className="flex items-center gap-4 pt-2">
        <button type="submit" disabled={pending} className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-60">
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
