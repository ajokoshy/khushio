"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";
import type { ActionResult } from "./form-state";
import { useToast } from "./toast";

type Props = {
  label: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** A server action already bound to the item, for example archiveCategoryAction.bind(null, id). */
  action: () => Promise<ActionResult>;
};

/** A button that asks first, runs a server action, then shows the outcome as a toast and refreshes the page. */
export function ConfirmActionButton({ label, title, description, confirmLabel, destructive, action }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = () =>
    startTransition(async () => {
      const result = await action();
      setOpen(false);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      toast(result.message ?? "Done.", "success");
      router.refresh();
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-xl border px-4 py-2 text-sm font-medium ${destructive ? "border-coral-600 text-coral-600 hover:bg-coral-100" : "border-forest-800 hover:bg-forest-100"}`}
      >
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel ?? label}
        destructive={destructive}
        pending={pending}
        onConfirm={run}
        onCancel={() => !pending && setOpen(false)}
      />
    </>
  );
}
