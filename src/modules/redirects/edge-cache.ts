import { buildMap, EMPTY_MAP, type RedirectMap, type RedirectRule } from "./path";

/**
 * Release 7A: the small in-memory copy of the redirect map that the middleware keeps in each running instance.
 * No framework or database imports (it runs on the edge).
 *
 *   fresh (younger than freshMs)  -> used as it is, no work at all
 *   stale                         -> still used for this request, and a refresh starts in the background
 *   none yet                      -> the first request waits for the load, but never longer than firstLoadTimeoutMs
 *   a load failed                 -> keep the old map (or an empty one) and do not try again for retryMs
 *
 * So a visitor never waits on the database, and a database or network problem can never take a page down: the worst
 * case is that redirects pause until the next successful load.
 */
export type RedirectCache = {
  get(load: () => Promise<RedirectRule[]>): Promise<{ map: RedirectMap; refresh: Promise<void> | null }>;
};

export function createRedirectCache(opts: { freshMs?: number; retryMs?: number; firstLoadTimeoutMs?: number; now?: () => number } = {}): RedirectCache {
  const freshMs = opts.freshMs ?? 60_000;
  const retryMs = opts.retryMs ?? 15_000;
  const firstLoadTimeoutMs = opts.firstLoadTimeoutMs ?? 1_000;
  const now = opts.now ?? (() => Date.now());

  let map: RedirectMap | null = null;
  let loadedAt = 0;
  let retryAfter = 0;
  let inflight: Promise<void> | null = null;

  function refresh(load: () => Promise<RedirectRule[]>): Promise<void> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        map = buildMap(await load());
        loadedAt = now();
      } catch {
        retryAfter = now() + retryMs;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async get(load) {
      const t = now();
      if (map && t - loadedAt < freshMs) return { map, refresh: null };
      if (t < retryAfter) return { map: map ?? EMPTY_MAP, refresh: null };
      const loading = refresh(load);
      if (map) return { map, refresh: loading };
      await Promise.race([loading, new Promise<void>((resolve) => setTimeout(resolve, firstLoadTimeoutMs))]);
      return { map: map ?? EMPTY_MAP, refresh: loading };
    },
  };
}
