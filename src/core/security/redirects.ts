const DEFAULT_AFTER_LOGIN = "/admin/dashboard";

/**
 * Only allows same-site paths inside /admin/. Anything else (absolute URLs, //host, backslashes,
 * other sections of the site) falls back to the dashboard, so the login page can never be used
 * as an open redirect.
 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_LOGIN;
  if (!value.startsWith("/admin/")) return DEFAULT_AFTER_LOGIN;
  if (value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return DEFAULT_AFTER_LOGIN;
  return value;
}
