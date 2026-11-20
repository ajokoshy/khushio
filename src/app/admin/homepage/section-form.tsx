"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CoverField } from "@/shared/admin/content/cover-field";
import { IdChecklist } from "@/shared/admin/content/id-checklist";
import type { PickerActions } from "@/shared/admin/content/image-picker";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { FormState } from "@/shared/admin/form-state";
import { SubmitButton } from "@/shared/admin/submit-button";
import { formFieldName, SECTION_HELP, SECTION_LABELS, type SectionType } from "@/modules/homepage/config";

type Option = { id: string; label: string };

type Props = PickerActions & {
  mode: "create" | "edit";
  type: SectionType;
  action: (prev: FormState, formData: FormData) => Promise<NonNullable<FormState>>;
  /** Text for every input, by input name (heading, isEnabled "on" or "", publishAt, c_*, coverPublicId, coverAlt). */
  initial: Record<string, string>;
  categories: Option[];
  collections: Option[];
  guideTypes: Option[];
  cloudName: string | null;
  uploadsEnabled: boolean;
  cancelHref: string;
};

export function SectionForm({ mode, type, action, initial, categories, collections, guideTypes, cloudName, uploadsEnabled, cancelHref, search, sign, record }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const value = (name: string) => state?.values?.[name] ?? initial[name] ?? "";
  const error = (name: string) => state?.fieldErrors?.[name];
  const by = (name: string) => (error(name) ? `${name}-error` : `${name}-hint`);
  const err = (key: string) => error(formFieldName(type, key));

  const text = (name: string, label: string, opts: { max: number; hint?: string; rows?: number }) => (
    <FormField label={label} htmlFor={name} error={error(name)} hint={opts.hint}>
      {opts.rows ? (
        <textarea id={name} name={name} rows={opts.rows} maxLength={opts.max} className={inputClass} defaultValue={value(name)} aria-invalid={!!error(name)} aria-describedby={by(name)} />
      ) : (
        <input id={name} name={name} maxLength={opts.max} className={inputClass} defaultValue={value(name)} aria-invalid={!!error(name)} aria-describedby={by(name)} />
      )}
    </FormField>
  );
  const number = (name: string, label: string, hint: string) => (
    <FormField label={label} htmlFor={name} error={error(name)} hint={hint}>
      <input id={name} name={name} type="number" inputMode="numeric" className={inputClass} defaultValue={value(name)} aria-invalid={!!error(name)} aria-describedby={by(name)} />
    </FormField>
  );
  const button = (
    <div className="grid gap-5 sm:grid-cols-2">
      {text("c_ctaLabel", "Button text", { max: 40, hint: "Optional. Needs an address too." })}
      {text("c_ctaHref", "Button address", { max: 2048, hint: "A path on this site such as /deals, or a full https:// address." })}
    </div>
  );

  return (
    <form action={formAction} noValidate className="max-w-3xl space-y-6">
      {state?.error && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}
      <input type="hidden" name="type" value={type} />
      <p className="text-sm text-ink-600">{SECTION_HELP[type]}</p>

      {type !== "hero_banner" && type !== "promo_banner" && (
        <FormField label="Heading" htmlFor="heading" error={error("heading")} hint="Optional. Shown above the section. Up to 80 characters.">
          <input id="heading" name="heading" maxLength={80} className={inputClass} defaultValue={value("heading")} aria-invalid={!!error("heading")} aria-describedby={by("heading")} />
        </FormField>
      )}
      {(type === "hero_banner" || type === "promo_banner") && <input type="hidden" name="heading" value={value("heading")} />}

      {type === "hero_banner" && (
        <>
          <CoverField initialPublicId={value("coverPublicId")} initialAlt={value("coverAlt")} cloudName={cloudName} uploadsEnabled={uploadsEnabled} error={err("imagePublicId")} search={search} sign={sign} record={record} />
          <p className="-mt-3 text-xs text-ink-600">With no picture the Khushio brand banner is shown. The description is read aloud to people who cannot see it.</p>
          {text("c_headline", "Headline", { max: 100, hint: "Optional. Becomes the page's main heading." })}
          {text("c_subheadline", "Sub-headline", { max: 200, rows: 2 })}
          {button}
        </>
      )}

      {type === "featured_categories" && <IdChecklist name="c_categoryIds" legend="Categories" options={categories} initial={value("c_categoryIds")} error={error("c_categoryIds")} hint="Up to 12, shown in this order. Tick none to show the top-level categories." />}

      {type === "trending_products" && (
        <>
          <FormField label="Which products" htmlFor="c_mode" error={error("c_mode")}>
            <select id="c_mode" name="c_mode" className={inputClass} defaultValue={value("c_mode") || "featured"}>
              <option value="featured">Featured first, then newest</option>
              <option value="newest">Newest first</option>
              <option value="popular">Most clicked in the last 30 days</option>
            </select>
          </FormField>
          {number("c_limit", "How many (4 to 12)", "Default 8.")}
        </>
      )}

      {type === "deals" && number("c_limit", "How many offers (2 to 12)", "Default 6. Ended offers disappear by themselves.")}

      {type === "collections" && <IdChecklist name="c_collectionIds" legend="Collections" options={collections} initial={value("c_collectionIds")} error={error("c_collectionIds")} hint="Choose 1 to 4. Create collections under Discover." />}

      {type === "guides" && (
        <>
          <IdChecklist name="c_types" legend="Kinds of guide" options={guideTypes} initial={value("c_types")} error={error("c_types")} hint="Tick none to show every kind." />
          {number("c_limit", "How many (3 to 9)", "Default 3.")}
        </>
      )}

      {type === "promo_banner" && (
        <>
          {text("c_text", "Text", { max: 160, hint: "One line, up to 160 characters." })}
          {button}
          <FormField label="Colour" htmlFor="c_tone" error={error("c_tone")}>
            <select id="c_tone" name="c_tone" className={inputClass} defaultValue={value("c_tone") || "forest"}>
              <option value="forest">Dark green</option>
              <option value="coral">Coral</option>
              <option value="cream">Cream with a border</option>
            </select>
          </FormField>
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Go-live time (India time)" htmlFor="publishAt" error={error("publishAt")} hint="Optional. Empty means as soon as it is switched on. A section with a future time stays hidden until then.">
          <input id="publishAt" name="publishAt" type="datetime-local" className={inputClass} defaultValue={value("publishAt")} aria-invalid={!!error("publishAt")} aria-describedby={by("publishAt")} />
        </FormField>
        <label className="flex items-start gap-2 pt-7 text-sm">
          <input type="checkbox" name="isEnabled" defaultChecked={state?.values ? state.values.isEnabled === "on" : initial.isEnabled === "on"} className="mt-1" />
          <span>Switched on (visitors can see it)</span>
        </label>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton>{mode === "create" ? `Add ${SECTION_LABELS[type].toLowerCase()}` : "Save changes"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-ink-600 underline">Cancel</Link>
      </div>
    </form>
  );
}
