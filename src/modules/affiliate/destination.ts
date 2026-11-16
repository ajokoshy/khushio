import { isIP } from "node:net";

/**
 * Where an affiliate link may send a visitor (Release 4A). This file is the security boundary of the
 * /go redirect, so it is pure (no database, no environment) and tested against every known trick.
 *
 * A destination is accepted only when ALL of these hold:
 *   - it is a plain https address: no username or password, no unusual port, no spaces, tabs, line breaks or backslashes
 *     (the URL parser silently deletes tabs and line breaks, which can hide a different host)
 *   - its host is a real name, not an IP address
 *   - its host is one of the merchant's allowed domains or a subdomain of one, compared label by label:
 *     "amazon.in" allows www.amazon.in but NOT amazon.in.evil.com, evilamazon.in or amazon.in@evil.com
 * Internationalised names are compared in their punycode form, so a look-alike such as "аmazon.in" (Cyrillic а)
 * becomes xn--mazon-3ve.in and does not match "amazon.in".
 */

export type DestinationProblem = "invalid" | "scheme" | "credentials" | "port" | "host" | "no_domains" | "not_allowed";

export type DestinationCheck =
  | { ok: true; url: URL; host: string }
  | { ok: false; code: DestinationProblem; message: string };

export const MAX_DESTINATION_LENGTH = 2048;

const FORBIDDEN_CHARACTERS = /[\s\\\u0000-\u001f\u007f-\u009f]/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const fail = (code: DestinationProblem, message: string): DestinationCheck => ({ ok: false, code, message });

/** True when `host` equals an allowed domain or is a subdomain of one. Both are compared in lower case, label by label. */
export function hostMatchesAllowed(host: string, allowedDomains: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  return allowedDomains.some((entry) => {
    const d = entry.trim().toLowerCase().replace(/\.$/, "");
    // Stored entries are normalised on save; anything odd that reached the database by hand is ignored here.
    if (!d || !d.includes(".") || !/^[a-z0-9.-]+$/.test(d)) return false;
    return h === d || h.endsWith(`.${d}`);
  });
}

export function checkDestination(raw: string, allowedDomains: readonly string[]): DestinationCheck {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return fail("invalid", "Enter the destination address.");
  if (value.length > MAX_DESTINATION_LENGTH) return fail("invalid", `The address is longer than ${MAX_DESTINATION_LENGTH} characters.`);
  if (FORBIDDEN_CHARACTERS.test(value)) return fail("invalid", "The address contains spaces, line breaks, a backslash or another character that is not allowed.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("invalid", "That is not a valid web address. Include https:// at the start.");
  }

  if (url.protocol !== "https:") return fail("scheme", "The destination must start with https://");
  if (url.username || url.password) return fail("credentials", "Remove the username and password from the address.");
  if (url.port !== "") return fail("port", "Addresses with a port number are not allowed.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || isIP(host) !== 0) return fail("host", "The destination must use a domain name, not an IP address.");
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253 || !labels.every((label) => HOST_LABEL.test(label))) return fail("host", "That domain name is not valid.");

  if (allowedDomains.length === 0) return fail("no_domains", "This merchant has no allowed domains yet. Add them on the merchant's page first.");
  if (!hostMatchesAllowed(host, allowedDomains)) {
    return fail("not_allowed", `${host} is not one of this merchant's allowed domains (${allowedDomains.join(", ")}).`);
  }
  return { ok: true, url, host };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tracking parameters
// ---------------------------------------------------------------------------------------------------------------------

export const MAX_TRACKING_PARAMS = 10;
export const MAX_TRACKING_LENGTH = 500;
const PARAM_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PLACEHOLDER = /\{([^{}]*)\}/g;
const SUB_ID = /\{subid\}/gi;
const HAS_SUB_ID = /\{subid\}/i;

export type TrackingParam = { key: string; value: string };
export type TrackingResult = { ok: true; value: string | null; params: TrackingParam[] } | { ok: false; error: string };

/**
 * Admin text such as `tag=khushio-21&ascsubtag={subid}` (also one pair per line, or with a leading "?").
 * `{subid}` is replaced on every click by the link's slug, so a network report can be matched back to the link.
 * Returns the canonical one-line form that is stored (values exactly as typed) plus the decoded pairs.
 */
export function parseTrackingParams(text: string | null | undefined): TrackingResult {
  const source = (text ?? "").trim().replace(/^\?/, "");
  if (!source) return { ok: true, value: null, params: [] };
  if (source.length > MAX_TRACKING_LENGTH) return { ok: false, error: `Keep the tracking parameters under ${MAX_TRACKING_LENGTH} characters.` };

  const pairs = source.split(/[&\n\r]+/).map((p) => p.trim()).filter(Boolean);
  if (pairs.length > MAX_TRACKING_PARAMS) return { ok: false, error: `Use at most ${MAX_TRACKING_PARAMS} parameters.` };

  const params: TrackingParam[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    const key = at === -1 ? pair : pair.slice(0, at);
    const rawValue = at === -1 ? "" : pair.slice(at + 1);
    if (!PARAM_KEY.test(key)) return { ok: false, error: `"${key.slice(0, 40)}" is not a valid parameter name. Use letters, numbers, dots, hyphens and underscores.` };
    if (!rawValue) return { ok: false, error: `Parameter "${key}" needs a value, for example ${key}=abc123.` };
    if (seen.has(key.toLowerCase())) return { ok: false, error: `Parameter "${key}" appears twice.` };
    seen.add(key.toLowerCase());

    let value: string;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      return { ok: false, error: `The value of "${key}" has a broken % code. Use %20 for a space.` };
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: `The value of "${key}" contains a control character.` };
    if (value.length > 200) return { ok: false, error: `The value of "${key}" is longer than 200 characters.` };
    const unknown = [...value.matchAll(PLACEHOLDER)].map((m) => m[0]).find((p) => p.toLowerCase() !== "{subid}");
    if (unknown) return { ok: false, error: `Unknown placeholder ${unknown} in "${key}". Only {subid} is available.` };
    params.push({ key, value });
  }
  return { ok: true, value: pairs.join("&"), params };
}

export type RedirectTarget = { url: string; subId: string | null };

/**
 * The final address: the validated destination with the tracking parameters set on it. A parameter that the
 * destination already carries is REPLACED (never duplicated), so the stored tracking ID always wins.
 * `subId` is the link slug; it is reported back only when the parameters actually use `{subid}`.
 * Nothing from the visitor's own request ever reaches this function: the /go route ignores its query string.
 */
export function buildRedirectTarget(destination: URL, trackingParams: string | null, subId: string): RedirectTarget {
  const parsed = parseTrackingParams(trackingParams);
  if (!parsed.ok || parsed.params.length === 0) return { url: destination.href, subId: null };

  const url = new URL(destination.href);
  let usedSubId = false;
  for (const { key, value } of parsed.params) {
    if (HAS_SUB_ID.test(value)) usedSubId = true;
    url.searchParams.set(key, value.replace(SUB_ID, subId));
  }
  return { url: url.href, subId: usedSubId ? subId : null };
}
