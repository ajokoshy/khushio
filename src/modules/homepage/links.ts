import { safeHref } from "@/modules/content/document";

/**
 * Where a homepage button or navigation link may point (Release 6B): a path on this site, or a full https:// address.
 * Everything else is refused: javascript:, data:, http:, mailto:, protocol-relative //host, addresses with a username or
 * password, and addresses with spaces or control characters. Returns the cleaned address, or null.
 */
export function safeLinkTarget(value: unknown): string | null {
  const href = safeHref(value);
  if (!href) return null;
  if (href.startsWith("/")) return href;
  if (!/^https:\/\/[^/\s]/i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.username || url.password ? null : href;
  } catch {
    return null;
  }
}

export const isSafeLinkTarget = (value: string) => safeLinkTarget(value) !== null;

export const LINK_TARGET_MESSAGE = "Use a path on this site such as /deals, or a full address starting with https://";
