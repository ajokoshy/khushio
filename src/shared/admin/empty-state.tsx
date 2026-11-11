import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-cream-200 bg-cream-50 px-6 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
