/** Environment checks. Reports problems by name only; never returns or logs a secret value. */
export type EnvIssue = { key: string; problem: string };

export function envIssues(env: Record<string, string | undefined> = process.env): EnvIssue[] {
  const out: EnvIssue[] = [];
  const need = (key: string, problem: string, ok: boolean) => { if (!ok) out.push({ key, problem }); };
  need("DATABASE_URL", "not set; the public site will show no catalogue", !!env.DATABASE_URL);
  need("AUTH_SECRET", "must be at least 32 characters", (env.AUTH_SECRET ?? "").length >= 32);
  need("ADMIN_EMAIL", "not set; admin sign-in is disabled", !!(env.ADMIN_EMAIL ?? "").trim());
  const [salt, hash] = (env.ADMIN_PASSWORD_HASH ?? "").trim().split(":");
  need("ADMIN_PASSWORD_HASH", "missing or malformed; generate with npm run hash", salt?.length === 32 && hash?.length === 128);
  need("NEXT_PUBLIC_SITE_URL", "must be an https:// URL", /^https:\/\/[^/]+/.test(env.NEXT_PUBLIC_SITE_URL ?? ""));
  if (env.NODE_ENV === "production" && env.ADMIN_PASSWORD) out.push({ key: "ADMIN_PASSWORD", problem: "plain-text password is ignored in production; remove it" });
  return out;
}

export const cloudinaryConfigured = (env: Record<string, string | undefined> = process.env) => !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
export const strictDomains = (env: Record<string, string | undefined> = process.env) => env.AFFILIATE_STRICT_DOMAINS === "1";
