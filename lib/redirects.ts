/** Pure redirect rules (no database). The admin UI, slug-change automation and the import all go through planRedirect. */
export type RedirectRow = { fromPath: string; toPath: string };
const RESERVED = ["/admin", "/go", "/api", "/_next"];

/** "/Products/x/?a=1#b" -> "/Products/x". Returns null when it is not a usable internal path. */
export function normalizePath(input: string): string | null {
  const s = input.trim().split(/[?#]/)[0];
  if (!s.startsWith("/") || s.startsWith("//") || /[\s\\]/.test(s) || /^\/[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  const t = s.length > 1 ? s.replace(/\/+$/, "") : s;
  return t || "/";
}
export const isReserved = (path: string) => RESERVED.some((r) => path === r || path.startsWith(`${r}/`));

export type RedirectPlan =
  | { ok: true; from: string; to: string; repoint: string[]; remove: string[] }
  | { ok: false; reason: "invalid" | "reserved" | "same" };

/**
 * Plans adding from -> to against the existing table, keeping every redirect a single hop and loop-free:
 * - the destination is a live page, so any redirect whose source is `to` is removed (this is also what makes A -> B -> A impossible);
 * - earlier redirects that pointed at `from` are re-pointed straight to `to`.
 */
export function planRedirect(existing: RedirectRow[], fromIn: string, toIn: string): RedirectPlan {
  const from = normalizePath(fromIn), to = normalizePath(toIn);
  if (!from || !to) return { ok: false, reason: "invalid" };
  if (isReserved(from) || isReserved(to)) return { ok: false, reason: "reserved" };
  if (from === to) return { ok: false, reason: "same" };
  return { ok: true, from, to, repoint: existing.filter((r) => r.toPath === from && r.fromPath !== to).map((r) => r.fromPath), remove: existing.some((r) => r.fromPath === to) ? [to] : [] };
}
