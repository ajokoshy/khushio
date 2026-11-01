import { revalidateTag, unstable_cache } from "next/cache";

/** Data-cache tags. Admin changes invalidate only the tags they affect, instead of the whole site. */
export const TAGS = ["products", "categories", "brands", "deals", "coupons", "articles", "collections", "settings", "redirects", "nav", "pages", "home", "media", "comparisons", "occasions"] as const;
export type Tag = (typeof TAGS)[number];

/**
 * Default data lifetime: 6 hours. Edits do not wait for it (they invalidate by tag), so this only bounds staleness for things that change
 * without an admin action (offers expiring by date). IMPORTANT: Next.js lets the shortest data lifetime on a page override the page's own
 * `revalidate`, so a short default here would silently make every page regenerate that often. Loaders that must be fresher say so explicitly.
 */
export const DEFAULT_REVALIDATE = 21600;

// unstable_cache needs Next's runtime; unit tests call the functions directly.
const bypass = () => !!process.env.VITEST || process.env.NODE_ENV === "test";

/**
 * Caches an async loader in Next's data cache under `tags`. Arguments are part of the cache key.
 * Results must be JSON-serialisable (dates as ISO strings). Thrown errors are never cached.
 */
export function cached<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string, tags: Tag[], revalidate = DEFAULT_REVALIDATE): (...args: A) => Promise<R> {
  if (bypass()) return fn;
  return unstable_cache(fn, [key], { tags, revalidate });
}

/** Invalidates cached data for these tags (all tags when none are given). */
export function invalidate(...tags: Tag[]) { for (const t of tags.length ? tags : TAGS) revalidateTag(t); }
