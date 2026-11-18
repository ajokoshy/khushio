import { FormField, inputClass } from "@/shared/admin/form-field";

type Props = {
  /** Values to show (what was typed, or what is saved). */
  value: { seoTitle: string; seoDescription: string; seoCanonical: string; seoOgImage: string; seoRobots: string };
  errors: Record<string, string | undefined>;
  /** False when the person lacks seo:write: the fields are shown but locked, and the server ignores them. */
  canEdit: boolean;
};

/** The search-engine fields shared by articles and pages. */
export function SeoFields({ value, errors, canEdit }: Props) {
  const by = (n: string) => (errors[n] ? `${n}-error` : `${n}-hint`);
  return (
    <fieldset className="space-y-5 rounded-2xl border border-cream-200 p-4" disabled={!canEdit}>
      <legend className="px-2 text-base font-medium">Search engines</legend>
      {!canEdit && <p className="text-sm text-ink-600">Your account cannot change these fields. They keep their current values.</p>}
      <FormField label="Search title" htmlFor="seoTitle" error={errors.seoTitle} hint="Optional. Up to 70 characters. Empty uses the title.">
        <input id="seoTitle" name="seoTitle" maxLength={70} className={inputClass} defaultValue={value.seoTitle} aria-invalid={!!errors.seoTitle} aria-describedby={by("seoTitle")} />
      </FormField>
      <FormField label="Search description" htmlFor="seoDescription" error={errors.seoDescription} hint="Optional. About 150 characters. Empty uses the summary.">
        <textarea id="seoDescription" name="seoDescription" rows={2} maxLength={170} className={inputClass} defaultValue={value.seoDescription} aria-invalid={!!errors.seoDescription} aria-describedby={by("seoDescription")} />
      </FormField>
      <FormField label="Canonical address" htmlFor="seoCanonical" error={errors.seoCanonical} hint="Optional. Only when this text also lives at another address (https://…). Empty uses this page's own address.">
        <input id="seoCanonical" name="seoCanonical" type="url" className={inputClass} defaultValue={value.seoCanonical} aria-invalid={!!errors.seoCanonical} aria-describedby={by("seoCanonical")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      <FormField label="Share image address" htmlFor="seoOgImage" error={errors.seoOgImage} hint="Optional. An https:// picture shown when the link is shared. Empty uses the cover picture.">
        <input id="seoOgImage" name="seoOgImage" type="url" className={inputClass} defaultValue={value.seoOgImage} aria-invalid={!!errors.seoOgImage} aria-describedby={by("seoOgImage")} autoCapitalize="none" spellCheck={false} />
      </FormField>
      <FormField label="Search visibility" htmlFor="seoRobots" error={errors.seoRobots}>
        <select id="seoRobots" name="seoRobots" className={inputClass} defaultValue={value.seoRobots}>
          <option value="">Normal (search engines may list it)</option>
          <option value="noindex,follow">Keep out of search results, follow its links</option>
          <option value="noindex,nofollow">Keep out of search results, do not follow its links</option>
        </select>
      </FormField>
    </fieldset>
  );
}
