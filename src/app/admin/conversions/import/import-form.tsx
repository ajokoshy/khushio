"use client";

import { useActionState } from "react";
import { FormField, inputClass } from "@/shared/admin/form-field";
import type { DataResult } from "@/shared/admin/action-helpers";
import { SubmitButton } from "@/shared/admin/submit-button";
import type { ImportSummary } from "@/modules/conversions/types";
import { importConversionsAction } from "../actions";

type Props = { networks: { id: string; name: string }[]; currencies: readonly string[]; defaultCurrency: string };

export function ImportForm({ networks, currencies, defaultCurrency }: Props) {
  const [state, formAction] = useActionState<DataResult<ImportSummary> | null, FormData>(importConversionsAction, null);
  const fields = state && !state.ok ? state.fieldErrors : undefined;
  const error = (name: string) => fields?.[name];
  const summary = state?.ok ? state.data : null;

  return (
    <>
      <form action={formAction} noValidate className="max-w-xl space-y-5">
        {state && !state.ok && !fields && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{state.error}</p>}

        <FormField label="Network" htmlFor="networkId" required error={error("networkId")} hint="Orders are matched by this network and the order id.">
          <select id="networkId" name="networkId" required className={inputClass} defaultValue="" aria-invalid={!!error("networkId")}>
            <option value="">Choose a network</option>
            {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </FormField>

        <FormField label="Currency when the file has none" htmlFor="currency" error={error("currency")}>
          <select id="currency" name="currency" className={inputClass} defaultValue={defaultCurrency}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>

        <FormField label="CSV file" htmlFor="file" required error={error("file")} hint="Up to 1 MB and 5,000 rows.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} aria-invalid={!!error("file")} />
        </FormField>

        <SubmitButton pendingLabel="Importing…">Import</SubmitButton>
      </form>

      {summary && (
        <section aria-labelledby="result-heading" className="mt-8 max-w-xl rounded-card border border-cream-200 bg-cream-50 p-5">
          <h2 id="result-heading" className="text-xl">Imported {summary.filename}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>{summary.rowsInFile} row{summary.rowsInFile === 1 ? "" : "s"} in the file</li>
            <li><strong>{summary.inserted}</strong> new</li>
            <li><strong>{summary.updated}</strong> updated (status or commission changed)</li>
            <li><strong>{summary.unchanged}</strong> unchanged (already recorded)</li>
            {summary.duplicatesInFile > 0 && <li>{summary.duplicatesInFile} repeated order id{summary.duplicatesInFile === 1 ? "" : "s"} in the file (the last line was used)</li>}
            <li>{summary.attributed} matched to an affiliate link by sub-ID</li>
            <li className={summary.failed > 0 ? "text-coral-600" : undefined}><strong>{summary.failed}</strong> skipped because of a problem</li>
          </ul>
          {summary.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">Problems{summary.failed > summary.errors.length ? ` (first ${summary.errors.length} of ${summary.failed})` : ""}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-coral-600">{summary.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
