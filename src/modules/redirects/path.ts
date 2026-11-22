/**
 * Release 7A: the pure rules for redirects. No database and no framework imports, because the middleware (which runs
 * on the edge) imports this file.
 *
 * An address is a PATH on this site: it starts with "/", is lower case, has no query, no "#" and no trailing slash
 * (except the home page "/"). Query strings are not part of a rule; the middleware carries them over to the target.
 */

export const REDIRECT_STATUSES = [301, 302, 410] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];
export const REDIRECT_STATUS_LABELS: Record<RedirectStatus, string> = {
  301: "301 Moved for good",
  302: "302 Moved for now",
  410: "410 Gone (removed on purpose)",
};
export const isRedirectStatus = (value: number): value is RedirectStatus => (REDIRECT_STATUSES as readonly number[]).includes(value);

/** Paths the site itself owns: a rule can never start or end in these, so the admin and the /go links cannot be hijacked or looped. */
export const RESERVED_PREFIXES = ["/admin", "/admin-login", "/api", "/go", "/_next", "/brand", "/preview"] as const;

const PATH_PATTERN = /^\/[a-z0-9\-._~/]*$/;
export const PATH_MAX_LENGTH = 300;

export const isReservedPath = (path: string): boolean => RESERVED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * "  /Products/Old-Name/ " -> "/products/old-name". Returns null for anything that is not a plain path on this site
 * (a full URL, "//host", a query or "#", a backslash, spaces, unusual characters).
 */
export function normalizePath(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > PATH_MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.length > 1 ? value.replace(/\/+$/, "") || "/" : value;
  if (path.includes("//") || !PATH_PATTERN.test(path)) return null;
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  return path;
}

/** The path of a request, in the same form rules are stored in (the middleware uses it). Unlike normalizePath it never rejects: an odd path just will not match. */
export function pathOfRequest(pathname: string): string {
  const lower = pathname.toLowerCase();
  return lower.length > 1 ? lower.replace(/\/+$/, "") || "/" : lower;
}

export type RuleLike = { id?: string; fromPath: string; toPath: string | null; statusCode: number };
export type RuleProblem = { field: "fromPath" | "toPath" | "statusCode"; message: string };

/**
 * Checks a new or edited rule against the rules that exist. Returns the first problem, or null.
 * The rules are: both addresses are plain paths; the old address is not the home page or a reserved path; a 410 has no
 * target and the others have one; a rule never points at itself; and there are NO CHAINS: the target is not itself
 * redirected or gone, and no other rule points at this rule's old address (that rule would need two hops).
 * `existing` should hold every other rule (the rule being edited is skipped by id).
 */
export function checkRule(rule: RuleLike, existing: readonly RuleLike[]): RuleProblem | null {
  const { fromPath, toPath, statusCode } = rule;
  if (fromPath === "/") return { field: "fromPath", message: "The home page cannot be redirected." };
  if (isReservedPath(fromPath)) return { field: "fromPath", message: "That address belongs to the admin or the system and cannot be redirected." };
  if (!isRedirectStatus(statusCode)) return { field: "statusCode", message: "Choose 301, 302 or 410." };

  const others = existing.filter((r) => r.id === undefined || r.id !== rule.id);
  const sameFrom = others.find((r) => r.fromPath === fromPath);
  if (sameFrom) return { field: "fromPath", message: "That old address already has a rule. Edit it instead." };

  const pointingHere = others.find((r) => r.toPath === fromPath);
  if (statusCode === 410) {
    if (toPath !== null) return { field: "toPath", message: "A 410 (gone) rule has no new address." };
    if (pointingHere) return { field: "fromPath", message: `${pointingHere.fromPath} redirects to this address. Make it gone too, or point it somewhere else, first.` };
    return null;
  }

  if (toPath === null) return { field: "toPath", message: "Enter the new address." };
  if (isReservedPath(toPath)) return { field: "toPath", message: "A redirect cannot lead into the admin or the system paths." };
  if (toPath === fromPath) return { field: "toPath", message: "The new address must differ from the old one." };
  const target = others.find((r) => r.fromPath === toPath);
  if (target) {
    if (target.toPath === fromPath) return { field: "toPath", message: "That would create a loop: the new address already redirects back here." };
    return {
      field: "toPath",
      message: target.statusCode === 410 ? "That address is marked gone, so it cannot be a target." : `That address already redirects to ${target.toPath}. Point this redirect there instead, so visitors only hop once.`,
    };
  }
  if (pointingHere) return { field: "fromPath", message: `${pointingHere.fromPath} already redirects to this address, so this rule would make a chain. Point ${pointingHere.fromPath} at ${toPath} first.` };
  return null;
}

/* ---------------------------------- the lookup map ---------------------------------- */

export type RedirectRule = { fromPath: string; toPath: string | null; statusCode: RedirectStatus };
export type RedirectMap = ReadonlyMap<string, { toPath: string | null; statusCode: RedirectStatus }>;
export const EMPTY_MAP: RedirectMap = new Map();

export function buildMap(rules: readonly RedirectRule[]): RedirectMap {
  const map = new Map<string, { toPath: string | null; statusCode: RedirectStatus }>();
  for (const r of rules) map.set(r.fromPath, { toPath: r.toPath, statusCode: r.statusCode });
  return map;
}

export function lookupRedirect(map: RedirectMap, pathname: string): { toPath: string | null; statusCode: RedirectStatus } | null {
  return map.get(pathOfRequest(pathname)) ?? null;
}

/** The compact form the map travels in between the server and the middleware: [from, to, status] triples. */
export type WireRule = [from: string, to: string | null, status: number];

export const toWire = (rules: readonly RedirectRule[]): WireRule[] => rules.map((r) => [r.fromPath, r.toPath, r.statusCode]);

/** Reads the wire form defensively (the middleware must never break a page because of a bad response). Unreadable entries are skipped. */
export function fromWire(data: unknown): RedirectRule[] {
  const list = data && typeof data === "object" ? (data as { rules?: unknown }).rules : null;
  if (!Array.isArray(list)) return [];
  const out: RedirectRule[] = [];
  for (const entry of list) {
    if (!Array.isArray(entry) || entry.length !== 3) continue;
    const [from, to, status] = entry as [unknown, unknown, unknown];
    if (typeof from !== "string" || typeof status !== "number" || !isRedirectStatus(status)) continue;
    if (status === 410 ? to !== null : typeof to !== "string") continue;
    out.push({ fromPath: from, toPath: to as string | null, statusCode: status });
  }
  return out;
}
