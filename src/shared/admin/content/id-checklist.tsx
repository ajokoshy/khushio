"use client";

import { useState } from "react";

type Props = { name: string; legend: string; options: readonly { id: string; label: string }[]; initial: string; error?: string; hint?: string };

/** Tick several items. They travel as ONE comma-separated value (the admin forms post one value per name), in the order listed. */
export function IdChecklist({ name, legend, options, initial, error, hint }: Props) {
  const [picked, setPicked] = useState<string[]>(() => initial.split(",").map((v) => v.trim()).filter(Boolean));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const value = options.filter((o) => picked.includes(o.id)).map((o) => o.id).join(",");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <input type="hidden" name={name} value={value} />
      {options.length === 0 ? (
        <p className="text-sm text-ink-600">Nothing to choose from yet.</p>
      ) : (
        <ul className="max-h-60 space-y-1 overflow-auto rounded-xl border border-cream-200 bg-cream-50 p-3">
          {options.map((o) => (
            <li key={o.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />
                <span>{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {hint && !error && <p className="text-xs text-ink-600">{hint}</p>}
      {error && <p role="alert" className="text-sm text-coral-600">{error}</p>}
    </fieldset>
  );
}
