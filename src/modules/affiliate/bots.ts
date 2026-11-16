/**
 * Bot filtering for affiliate clicks (Release 4A). A bot is still redirected (a link checker or a search
 * engine preview must not see an error) but its click is stored with isBot = true, so reports can leave it out
 * and a wrong guess can be corrected later. The list is deliberately conservative: it is better to count an odd
 * visitor than to throw away a real customer.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrap(?:er|y)|headless|phantomjs|lighthouse|pagespeed|facebookexternalhit|whatsapp\/|preview|monitor|validator|curl\/|wget\/|httpie|python-(?:requests|urllib)|aiohttp|go-http-client|libwww|http[_-]?client|node-fetch|axios\/|postmanruntime|java\/\d/i;

const MIN_BROWSER_AGENT_LENGTH = 12;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (ua.length < MIN_BROWSER_AGENT_LENGTH) return true; // no agent at all, or too short to be a browser
  return BOT_PATTERN.test(ua);
}

/** Hostname of the page the click came from ("www.google.com"), or null. Path and query are never stored. */
export function referrerHostOf(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    return host && host.length <= 253 ? host : null;
  } catch {
    return null;
  }
}

/** Two-letter country code from the hosting platform's header, or null. */
export function countryOf(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
}
