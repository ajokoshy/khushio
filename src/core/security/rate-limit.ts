/**
 * Release 7B: a small in-memory limiter for PUBLIC endpoints that must not write to the database on every request.
 * It lives in one running instance (Vercel may run several), so it is a brake against floods and loops, not an exact
 * quota. Nothing is stored beyond the window and no address is written anywhere.
 * (The admin login has its own database-backed limiter: src/modules/auth, Release 2C.)
 */
export type RateLimiter = { allow(key: string): boolean; size(): number };

export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }): RateLimiter {
  const maxKeys = opts.maxKeys ?? 5000;
  const now = opts.now ?? (() => Date.now());
  const hits = new Map<string, { count: number; resetAt: number }>();

  function prune(t: number) {
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
    // Still too many distinct keys (a spread-out flood): drop the oldest so memory stays bounded.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    allow(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        if (hits.size >= maxKeys) prune(t);
        hits.set(key, { count: 1, resetAt: t + opts.windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= opts.limit;
    },
    size: () => hits.size,
  };
}

/** The visitor's address as Vercel reports it. Used only as an in-memory key. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
