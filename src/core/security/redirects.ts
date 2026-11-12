const DEFAULT_AFTER_LOGIN = "/admin/dashboard";
const PLACEHOLDER_ORIGIN = "http://khushio.invalid";

/**
 * Returns a same-site path inside /admin/ to send the user to after sign-in. Auth.js middleware
 * supplies the callbackUrl as an absolute URL (for example https://khushio.com/admin/audit), so
 * only its path and query are kept and the host is ignored: the result is always a relative path
 * on this site. Anything else (other sections of the site, //host, backslashes, control
 * characters, dot-segments that leave /admin/) falls back to the dashboard, so the login page can
 * never be used as an open redirect.
 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_LOGIN;
  if (value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return DEFAULT_AFTER_LOGIN;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (!url.pathname.startsWith("/admin/")) return DEFAULT_AFTER_LOGIN;
  return `${url.pathname}${url.search}`;
}
