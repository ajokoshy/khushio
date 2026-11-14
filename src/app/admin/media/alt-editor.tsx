"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/shared/admin/form-field";
import { useToast } from "@/shared/admin/toast";
import { updateMediaAltAction } from "./actions";

/** Edits the default description of one library image. Product images keep their own description. */
export function AltEditor({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <label htmlFor={`media-alt-${id}`} className="sr-only">Default description</label>
      <input id={`media-alt-${id}`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} className={inputClass} placeholder="Describe the image" />
      <button
        type="button"
        disabled={pending || value === initial || value.trim() === ""}
        onClick={() =>
          start(async () => {
            const result = await updateMediaAltAction(id, value);
            if (!result.ok) return toast(result.error, "error");
            toast(result.message ?? "Saved.", "success");
            router.refresh();
          })
        }
        className="rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
