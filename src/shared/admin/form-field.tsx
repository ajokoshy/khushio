import type { ReactNode } from "react";

/** Shared input styling for admin forms. */
export const inputClass =
  "block w-full rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-forest-800 placeholder:text-ink-600/60 disabled:opacity-60";

type Props = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

/** Label + control + hint + error. Give the control id={htmlFor}; set aria-describedby to `${htmlFor}-hint` / `${htmlFor}-error`. */
export function FormField({ label, htmlFor, hint, error, required, children }: Props) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden="true" className="text-coral-600"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-ink-600">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-sm text-coral-600">{error}</p>}
    </div>
  );
}
