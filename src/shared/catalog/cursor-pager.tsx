import Link from "next/link";
import { buildHref } from "@/shared/admin/list-params";

/** Next page by cursor. There is no "page 7" jump: results are stable and cheap to read one page at a time. */
export function CursorPager({ basePath, params, nextCursor, isFirstPage }: { basePath: string; params: Record<string, string | undefined>; nextCursor: string | null; isFirstPage: boolean }) {
  if (!nextCursor && isFirstPage) return null;
  const link = "rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100";
  return (
    <nav aria-label="More products" className="mt-6 flex items-center justify-between gap-3">
      {!isFirstPage ? <Link href={buildHref(basePath, { ...params, cursor: undefined })} className={link}>Back to the first page</Link> : <span />}
      {nextCursor && <Link href={buildHref(basePath, { ...params, cursor: nextCursor })} rel="next" className={link}>Show more</Link>}
    </nav>
  );
}
