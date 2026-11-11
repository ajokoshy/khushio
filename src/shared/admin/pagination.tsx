import Link from "next/link";
import { buildHref } from "./list-params";

type Props = {
  basePath: string;
  /** Current filters (q, etc.) so they survive paging. Do not include page. */
  params: Record<string, string | number | boolean | null | undefined>;
  page: number;
  hasNext: boolean;
};

const link = "rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100";
const off = "rounded-xl border border-cream-200 px-4 py-2 text-sm text-ink-600/60";

export function Pagination({ basePath, params, page, hasNext }: Props) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link rel="prev" href={buildHref(basePath, { ...params, page: page - 1 > 1 ? page - 1 : undefined })} className={link}>Previous</Link>
      ) : (
        <span aria-disabled="true" className={off}>Previous</span>
      )}
      <span className="text-sm text-ink-600">Page {page}</span>
      {hasNext ? (
        <Link rel="next" href={buildHref(basePath, { ...params, page: page + 1 })} className={link}>Next</Link>
      ) : (
        <span aria-disabled="true" className={off}>Next</span>
      )}
    </nav>
  );
}
