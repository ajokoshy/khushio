import Link from "next/link";
import type { ReactNode } from "react";

/** A plain GET form: works without JavaScript and always resets to page 1. Put filter inputs in children. */
export function ListToolbar({ action, q, placeholder = "Search", children }: { action: string; q?: string; placeholder?: string; children?: ReactNode }) {
  return (
    <form action={action} method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          className="block w-full rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm"
        />
      </div>
      {children}
      <button type="submit" className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700">Apply</button>
      <Link href={action} className="py-2 text-sm text-ink-600 underline">Reset</Link>
    </form>
  );
}
