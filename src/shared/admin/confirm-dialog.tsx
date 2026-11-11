"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Controlled modal built on the native <dialog>: focus trapping, Escape to cancel, backdrop included. */
export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive, pending, onConfirm, onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card bg-cream-50 p-6 text-forest-800 shadow-xl backdrop:bg-forest-950/50"
    >
      <h2 id="confirm-title" className="text-xl">{title}</h2>
      {description && <p className="mt-2 text-sm text-ink-600">{description}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={pending} className="rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100 disabled:opacity-60">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`rounded-xl px-4 py-2 text-sm font-medium text-cream-50 disabled:opacity-60 ${destructive ? "bg-coral-600 hover:bg-coral-500" : "bg-forest-800 hover:bg-forest-700"}`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
