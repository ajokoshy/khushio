/**
 * Allowed domains of a merchant (Release 3A). The /go redirect (Release 4A) refuses any destination whose
 * host is not one of these domains or a subdomain of one, so what is stored here is a security boundary:
 * entries are normalised to a bare lower-case hostname, and anything that would allow far too much
 * ("co.in", "vercel.app", an IP address) is rejected.
 *
 * "amazon.in" allows amazon.in and every subdomain such as www.amazon.in. "www.amazon.in" allows only
 * that host (and its own subdomains), NOT amazon.in itself.
 */

export const MAX_ALLOWED_DOMAINS = 20;

/**
 * Shared suffixes: allowing one of these would allow every site that lives under it. A guard against the
 * common slips, not a full public-suffix list (that arrives with the 4A redirect tests if needed).
 */
const SHARED_SUFFIXES: ReadonlySet<string> = new Set([
  // India and common country second-level suffixes
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "gov.in", "res.in", "nic.in",
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.za", "com.sg", "com.my",
  "com.br", "com.cn", "co.jp", "com.hk", "com.ph", "com.pk", "com.bd", "com.np", "com.lk", "com.mx", "com.tr", "com.sa", "co.ae",
  // Hosting platforms where anyone can create a subdomain
  "vercel.app", "netlify.app", "github.io", "gitlab.io", "pages.dev", "workers.dev", "web.app", "firebaseapp.com",
  "herokuapp.com", "blogspot.com", "wordpress.com", "myshopify.com", "wixsite.com", "weebly.com", "azurewebsites.net",
  "cloudfront.net", "amazonaws.com", "appspot.com", "onrender.com", "fly.dev", "glitch.me", "repl.co", "ngrok.io", "trycloudflare.com",
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export type DomainResult = { ok: true; domain: string } | { ok: false; error: string };

/** One line from the editor: a hostname, or a pasted address (scheme, path, query and port are dropped). */
export function normaliseDomain(entry: string): DomainResult {
  let value = entry.trim().toLowerCase();
  if (!value) return { ok: false, error: "Empty entry" };
  const shown = entry.trim().slice(0, 60);

  if (value.includes("@")) return { ok: false, error: `"${shown}": remove the username and password part` };
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(value);
  if (scheme) {
    if (scheme[1] !== "http" && scheme[1] !== "https") return { ok: false, error: `"${shown}": only web addresses are allowed` };
    value = value.slice(scheme[0].length);
  }
  value = (value.split(/[/?#]/)[0] ?? "").replace(/^\*\./, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!value) return { ok: false, error: `"${shown}": enter a domain such as amazon.in` };

  // The URL parser converts non-ASCII names to their punycode form and rejects spaces and illegal characters.
  let host: string;
  try {
    host = new URL(`http://${value}`).hostname;
  } catch {
    return { ok: false, error: `"${shown}" is not a valid domain` };
  }

  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1] as string)) {
    return { ok: false, error: `"${shown}" is not a valid domain (for example amazon.in)` };
  }
  if (SHARED_SUFFIXES.has(host)) {
    return { ok: false, error: `"${host}" is shared by many unrelated sites. Enter the shop's own domain instead, for example amazon.in` };
  }
  return { ok: true, domain: host };
}

/** Splits the editor text on new lines, commas, semicolons and spaces, normalises, removes duplicates and reports every problem. */
export function parseAllowedDomains(text: string): { domains: string[]; errors: string[] } {
  const entries = text.split(/[\s,;]+/).filter(Boolean);
  const domains: string[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const result = normaliseDomain(entry);
    if (!result.ok) errors.push(result.error);
    else if (!domains.includes(result.domain)) domains.push(result.domain);
  }
  if (domains.length > MAX_ALLOWED_DOMAINS) errors.push(`Use at most ${MAX_ALLOWED_DOMAINS} domains per merchant`);
  return { domains, errors };
}

export function formatAllowedDomains(domains: readonly string[]): string {
  return domains.join("\n");
}
