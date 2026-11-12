/** Lower-case words joined by single hyphens: "home-kitchen", "p-2". */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 80;

/**
 * "Home & Kitchen" -> "home-kitchen". Accents are folded ("Café" -> "cafe"). Returns "" when nothing
 * usable is left (for example a name made only of symbols or a non-Latin script), so the caller can
 * ask for a slug by hand instead of inventing one.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

/**
 * First free slug: `base`, then `base-2`, `base-3`, ... `taken` holds the slugs that exist and start
 * with `base` (one query), so no loop of database round trips is needed. The result never exceeds
 * SLUG_MAX_LENGTH: the base is shortened to make room for the suffix.
 */
export function pickUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The name of the unique constraint or index a Postgres error refers to, or null if the error is not a
 * unique violation (code 23505). Drizzle wraps the driver error, so the cause is checked as well.
 */
export function uniqueViolationOf(error: unknown): string | null {
  for (let e: unknown = error, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const { code, constraint, cause } = e as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (code === "23505") return typeof constraint === "string" ? constraint : "unknown";
    e = cause;
  }
  return null;
}
