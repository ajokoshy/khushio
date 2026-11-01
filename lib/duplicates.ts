/** Pure helpers for spotting duplicate products before they are created. */
export const normalizeName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();

/** host + path, without scheme, www, query, fragment or trailing slash: two affiliate links to the same page compare equal. */
export function urlKey(u: string): string {
  try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase(); } catch { return u.trim().toLowerCase(); }
}

export type DupCandidate = { id: string; slug: string; name: string; urls: string[] };
export type DupMatch = { id: string; slug: string; name: string; reasons: ("name" | "slug" | "link")[] };
/** Compares a new product against existing candidates. */
export function findDuplicateMatches(input: { name: string; slug: string; urls: string[]; excludeId?: string }, candidates: DupCandidate[]): DupMatch[] {
  const name = normalizeName(input.name), links = new Set(input.urls.map(urlKey));
  return candidates.filter((c) => c.id !== input.excludeId).flatMap((c) => {
    const reasons: DupMatch["reasons"] = [];
    if (name && normalizeName(c.name) === name) reasons.push("name");
    if (c.slug === input.slug) reasons.push("slug");
    if (c.urls.some((u) => links.has(urlKey(u)))) reasons.push("link");
    return reasons.length ? [{ id: c.id, slug: c.slug, name: c.name, reasons }] : [];
  });
}
