import type { StatusFilter } from "@/modules/discover/types";
import { statusFilterSchema } from "@/modules/discover/validation";
import { firstParam, type SearchParams } from "./list-params";

export function parseStatus(sp: SearchParams): StatusFilter {
  return statusFilterSchema.parse(firstParam(sp.status));
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs">Active</span>
  ) : (
    <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs text-coral-600">Archived</span>
  );
}

/** Filter control for ListToolbar (a plain GET form field). */
export function StatusSelect({ value }: { value: StatusFilter }) {
  return (
    <div>
      <label htmlFor="status" className="sr-only">Status</label>
      <select id="status" name="status" defaultValue={value} className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  );
}
