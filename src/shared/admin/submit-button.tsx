"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself and changes its label while the form is being saved. */
export function SubmitButton({ children, pendingLabel = "Saving…" }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
