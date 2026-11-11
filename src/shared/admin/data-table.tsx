import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";
import { EmptyState } from "./empty-state";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
};

/**
 * Server-rendered table. Paging, search and filters are plain URL parameters handled by the page
 * (see list-params.ts, ListToolbar and Pagination), so there is no client JavaScript here.
 */
export function DataTable<T>({ columns, rows, getRowKey, caption, empty }: Props<T>) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto rounded-card border border-cream-200 bg-cream-50">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-cream-200 bg-cream-100 text-xs uppercase tracking-wide text-ink-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium", c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-200">
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-top", c.className)}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
