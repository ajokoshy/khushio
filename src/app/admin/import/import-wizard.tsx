"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { DataResult } from "@/shared/admin/action-helpers";
import { SubmitButton } from "@/shared/admin/submit-button";
import type { ImportPreview } from "@/modules/imports/types";
import { importWizardAction, type WizardState } from "./actions";

type Entity = { value: string; label: string };

/**
 * Three steps in one form: choose what and which file, check the preview (and change the column mapping if the file's
 * headers were not recognised), then import. The file stays in the form between steps; each step sends it again.
 */
export function ImportWizard({ entities }: { entities: readonly Entity[] }) {
  const [state, formAction] = useActionState<DataResult<WizardState> | null, FormData>(importWizardAction, null);
  const [entity, setEntity] = useState(entities[0]?.value ?? "products");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const preview: ImportPreview | null = state?.ok && state.data.kind === "preview" ? state.data.preview : null;
  const result = state?.ok && state.data.kind === "done" ? state.data.result : null;
  const fieldError = state && !state.ok ? state.fieldErrors?.file : undefined;

  useEffect(() => {
    if (preview) setMapping(preview.mapping);
  }, [preview]);

  const blobUrl = useMemo(() => (result?.errorCsv ? URL.createObjectURL(new Blob([result.errorCsv], { type: "text/csv;charset=utf-8" })) : null), [result]);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const canImport = !!preview && preview.missingRequired.length === 0 && preview.counts.create + preview.counts.update > 0;

  return (
    <>
      <form action={formAction} noValidate className="max-w-2xl space-y-5">
        {state && !state.ok && !fieldError && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

        <FormField label="What are you importing?" htmlFor="entity" required>
          <select id="entity" name="entity" className={inputClass} value={entity} onChange={(e) => { setEntity(e.target.value); setMapping({}); }}>
            {entities.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </FormField>

        <p className="text-sm text-ink-600"><a className="underline" href={`/admin/import/template/${entity}`}>Download the template for this</a>. Start with one row to try it, then upload the full file.</p>

        <FormField label="CSV file" htmlFor="file" required error={fieldError} hint="Up to 2 MB and 2,000 rows. The first line must name the columns.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} aria-invalid={!!fieldError} />
        </FormField>

        <input type="hidden" name="mapping" value={Object.keys(mapping).length > 0 ? JSON.stringify(mapping) : ""} />

        {preview && (
          <section aria-labelledby="map-heading" className="rounded-card border border-cream-200 bg-cream-50 p-5">
            <h2 id="map-heading" className="text-xl">Columns</h2>
            <p className="mt-1 text-sm text-ink-600">Each field is matched to a column of your file. Change a match if it is wrong, then press Check again.</p>
            <ul className="mt-3 space-y-2">
              {preview.columns.map((c) => (
                <li key={c.name} className="grid items-center gap-2 sm:grid-cols-[12rem_1fr]">
                  <label htmlFor={`map-${c.name}`} className="text-sm font-medium">{c.name}{c.required && <span className="text-coral-600"> *</span>}</label>
                  <select id={`map-${c.name}`} className={inputClass} value={mapping[c.name] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [c.name]: e.target.value }))} aria-describedby={`map-help-${c.name}`}>
                    <option value="">{c.required ? "Choose a column" : "Not in my file"}</option>
                    {preview.headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h}</option>)}
                  </select>
                  <span id={`map-help-${c.name}`} className="text-xs text-ink-600 sm:col-start-2">{c.help}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {preview && (
          <section aria-labelledby="preview-heading" className="rounded-card border border-cream-200 bg-cream-50 p-5" aria-live="polite">
            <h2 id="preview-heading" className="text-xl">Check of {preview.filename}</h2>
            {preview.missingRequired.length > 0 ? (
              <p className="mt-2 text-sm text-coral-600">Choose a column for: {preview.missingRequired.join(", ")}.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                <li>{preview.rowsInFile} row{preview.rowsInFile === 1 ? "" : "s"} in the file</li>
                <li><strong>{preview.counts.create}</strong> would be added</li>
                <li><strong>{preview.counts.update}</strong> would be updated</li>
                <li><strong>{preview.counts.unchanged}</strong> are already up to date</li>
                <li className={preview.counts.failed > 0 ? "text-coral-600" : undefined}><strong>{preview.counts.failed}</strong> have a problem and would be skipped</li>
              </ul>
            )}
            {preview.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium">Problems{preview.errorTotal > preview.errors.length ? ` (first ${preview.errors.length} of ${preview.errorTotal} rows)` : ""}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-coral-600">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Checking…" name="intent" value="preview">{preview ? "Check again" : "Check the file"}</SubmitButton>
          {canImport && <SubmitButton pendingLabel="Importing…" name="intent" value="run">{`Import ${preview.counts.create + preview.counts.update} row${preview.counts.create + preview.counts.update === 1 ? "" : "s"}`}</SubmitButton>}
        </div>
      </form>

      {result && (
        <section aria-labelledby="result-heading" aria-live="polite" className="mt-8 max-w-2xl rounded-card border border-cream-200 bg-cream-50 p-5">
          <h2 id="result-heading" className="text-xl">Imported {result.filename}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>{result.rowsInFile} row{result.rowsInFile === 1 ? "" : "s"} in the file</li>
            <li><strong>{result.created}</strong> added</li>
            <li><strong>{result.updated}</strong> updated</li>
            <li><strong>{result.unchanged}</strong> already up to date</li>
            <li className={result.failed > 0 ? "text-coral-600" : undefined}><strong>{result.failed}</strong> not saved because of a problem</li>
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">Problems{result.errorTotal > result.errors.length ? ` (first ${result.errors.length} of ${result.errorTotal} rows)` : ""}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-coral-600">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {blobUrl && <p className="mt-4"><a href={blobUrl} download={`errors-${result.filename}`} className="font-medium underline">Download the problem rows as CSV</a> <span className="text-xs text-ink-600">(fix them and import that file again)</span></p>}
        </section>
      )}
    </>
  );
}
