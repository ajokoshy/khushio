/**
 * Pure affiliate-link rules (no database, no framework). Used by /go/[id] and by admin save-time validation,
 * so the same checks apply when a link is saved and when it is followed.
 */

/** rel value for every outbound affiliate link. */
export const AFFILIATE_REL = "sponsored nofollow noopener noreferrer";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|curl|wget|python-requests|axios|go-http|java\//i;
/** True for user agents that should not produce a click row (crawlers, link previewers, scripts). */
export const isBot = (ua: string | null | undefined) => !ua || BOT.test(ua);

/** Parses a comma/space/newline separated list of domains into clean lowercase hostnames. */
export function parseDomains(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
}

/** Hostname of a URL without a leading www., or "" if it cannot be parsed. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

/** True when `host` equals an approved domain or is a subdomain of one. */
export const hostAllowed = (host: string, approved: string[]) => !!host && approved.some((d) => host === d || host.endsWith(`.${d}`));

export type DestinationCheck = { ok: true } | { ok: false; reason: "invalid" | "not-https" | "credentials" | "domain" };

/**
 * Checks an affiliate destination. https only, no embedded credentials, and (when `approved` is non-empty or `strict`)
 * the host must belong to an approved domain. With no approved domains and not strict, the link is accepted (legacy data).
 */
export function checkDestination(url: string, approved: string[], strict = false): DestinationCheck {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "invalid" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  if (approved.length || strict) { if (!hostAllowed(hostOf(url), approved)) return { ok: false, reason: "domain" }; }
  return { ok: true };
}

/** Privacy-conscious referrer: same-site referrers keep only the path (no query); external ones keep only the host. */
export function safeReferrer(ref: string | null | undefined, siteUrl: string): string | null {
  if (!ref) return null;
  try {
    const r = new URL(ref), s = new URL(siteUrl);
    return (r.hostname === s.hostname ? r.pathname : r.hostname).slice(0, 200);
  } catch { return null; }
}

/** Approved destination hosts for a merchant: its approved-domains list plus the host of its website. */
export const approvedFor = (approvedDomains: string, website: string): string[] => [...new Set([...parseDomains(approvedDomains), hostOf(website)].filter(Boolean))];
