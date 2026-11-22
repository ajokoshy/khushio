import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_TTL } from "@/core/config/cache";
import * as repo from "./repository";

/**
 * The redirect map for the middleware (Release 7A): one database read, kept in the data cache for an hour and cleared at
 * once by every redirect or slug change (tag `redirects`). Visitors never cause a query: the middleware asks
 * /api/redirect-map at most once a minute per running instance, and that route answers from this cache.
 */
export const getRedirectRules = unstable_cache(() => repo.selectAllRules(), ["redirect-rules"], { revalidate: CACHE_TTL.redirects, tags: [CACHE_TAGS.redirects] });
