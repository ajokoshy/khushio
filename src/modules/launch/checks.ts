/**
 * Release 7B: the launch checklist as a pure function. It takes facts (gathered by service.ts) and returns one result per
 * item, so every rule can be tested without a database. "manual" items cannot be seen from inside the app (domain, spend
 * alerts, backups): they are listed so nothing is forgotten, and are ticked off on paper or in docs/LAUNCH.md.
 */

export const LEGAL_PAGES = [
  { slug: "privacy-policy", label: "Privacy policy" },
  { slug: "terms", label: "Terms of use" },
  { slug: "affiliate-disclosure", label: "Affiliate disclosure" },
  { slug: "contact", label: "Contact" },
] as const;

export type CheckStatus = "ok" | "warn" | "fail" | "manual";
export type CheckResult = { id: string; group: string; label: string; status: CheckStatus; detail: string };

export type LaunchFacts = {
  siteUrl: string;
  hasDatabase: boolean;
  authSecretLength: number;
  cronSecretLength: number;
  cloudinaryConfigured: boolean;
  analytics: "off" | "vercel";
  cspEnforced: boolean;
  /** Slugs of the legal pages that are published. */
  publishedPageSlugs: readonly string[];
  publishedProducts: number;
  activeAffiliateLinks: number;
  activeAdmins: readonly { email: string; roles: string[]; lastLoginAt: Date | null }[];
  /** Whether robots.txt tells every crawler to stay out of the whole site. */
  robotsBlocksAll: boolean;
  now: Date;
};

const NEVER_USED_DAYS = 90;

export function runChecks(f: LaunchFacts): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (group: string, id: string, label: string, status: CheckStatus, detail: string) => out.push({ id, group, label, status, detail });

  // ---- Domain and settings
  let host = "";
  try { host = new URL(f.siteUrl).hostname; } catch { /* handled below */ }
  const local = host === "localhost" || host === "127.0.0.1" || host === "";
  add("Domain and settings", "site-url", "Site address is the real domain", local ? "fail" : f.siteUrl.startsWith("https://") ? "ok" : "fail", local ? "NEXT_PUBLIC_SITE_URL still points at localhost. Set it to https://your-domain in Vercel." : f.siteUrl.startsWith("https://") ? f.siteUrl : "NEXT_PUBLIC_SITE_URL must start with https://.");
  add("Domain and settings", "database", "Database connected", f.hasDatabase ? "ok" : "fail", f.hasDatabase ? "DATABASE_URL is set." : "DATABASE_URL is missing.");
  add("Domain and settings", "auth-secret", "Login secret is long enough", f.authSecretLength >= 32 ? "ok" : "fail", f.authSecretLength >= 32 ? "AUTH_SECRET is set." : "AUTH_SECRET must be at least 32 characters.");
  add("Domain and settings", "cron-secret", "Daily job secret is set", f.cronSecretLength >= 16 ? "ok" : "fail", f.cronSecretLength >= 16 ? "CRON_SECRET is set, so the daily click roll-up can run." : "CRON_SECRET is missing or shorter than 16 characters: the daily roll-up would be refused.");
  add("Domain and settings", "cloudinary", "Picture storage connected", f.cloudinaryConfigured ? "ok" : "warn", f.cloudinaryConfigured ? "Cloudinary is configured." : "Cloudinary variables are missing: product pictures cannot be uploaded.");
  add("Domain and settings", "robots", "robots.txt lets search engines in", f.robotsBlocksAll ? "fail" : "ok", f.robotsBlocksAll ? "robots.txt blocks the whole site." : "Public pages are allowed; /admin, /api and /go are blocked.");

  // ---- Legal and trust
  for (const page of LEGAL_PAGES) {
    const live = f.publishedPageSlugs.includes(page.slug);
    add("Legal and trust", `page-${page.slug}`, `${page.label} page published`, live ? "ok" : "fail", live ? `/p/${page.slug} is live and linked in the footer.` : `Create a page with the address "${page.slug}" under Pages and publish it (templates are in docs/LAUNCH.md).`);
  }
  add("Legal and trust", "disclosure-footer", "Affiliate notice on every page", "ok", "The footer carries the affiliate notice on every public page.");
  add("Legal and trust", "cookies", "Cookie notice", "ok", "Not needed: visitors get no cookies (analytics is cookie-free; only the admin login sets one). Add a notice if you ever add advertising or tracking tools.");

  // ---- Content
  add("Content", "products", "Products are published", f.publishedProducts > 0 ? "ok" : "warn", f.publishedProducts > 0 ? `${f.publishedProducts} published.` : "No product is published yet.");
  add("Content", "links", "Affiliate links are active", f.activeAffiliateLinks > 0 ? "ok" : "warn", f.activeAffiliateLinks > 0 ? `${f.activeAffiliateLinks} active.` : "No active affiliate link: visitors cannot reach a store.");

  // ---- Security and monitoring
  add("Security and monitoring", "csp", "Content-Security-Policy enforced", f.cspEnforced ? "ok" : "warn", f.cspEnforced ? "CSP_ENFORCE is true." : "The policy is in report-only mode. Check the Vercel logs for khushio.csp lines for a week, then set CSP_ENFORCE=true and redeploy.");
  add("Security and monitoring", "analytics", "Analytics on", f.analytics === "vercel" ? "ok" : "warn", f.analytics === "vercel" ? "Vercel Web Analytics and Speed Insights are on (also switch them on in the Vercel dashboard)." : "NEXT_PUBLIC_ANALYTICS is off.");
  const admins = f.activeAdmins;
  add("Security and monitoring", "admins", "Admin accounts reviewed", admins.length === 0 ? "fail" : "manual", admins.length === 0 ? "There is no active admin." : `${admins.length} active: ${admins.map((a) => a.email).join(", ")}. Confirm each person still needs access, and that nobody shares a login.`);
  const owners = admins.filter((a) => a.roles.includes("super_admin") || a.roles.includes("owner"));
  add("Security and monitoring", "owners", "At least one owner", owners.length > 0 ? "ok" : "warn", owners.length > 0 ? `${owners.length} owner account${owners.length === 1 ? "" : "s"}.` : "No active account has the owner role.");
  const stale = admins.filter((a) => !a.lastLoginAt || f.now.getTime() - a.lastLoginAt.getTime() > NEVER_USED_DAYS * 86_400_000);
  add("Security and monitoring", "stale-admins", "No unused admin accounts", stale.length === 0 ? "ok" : "warn", stale.length === 0 ? "Every active admin has signed in within 90 days." : `Not signed in for ${NEVER_USED_DAYS}+ days (or never): ${stale.map((a) => a.email).join(", ")}. Deactivate accounts nobody uses.`);

  // ---- Manual
  const manual: [string, string, string][] = [
    ["domain-https", "Domain added in Vercel and HTTPS padlock showing", "Vercel > Domains. Open the site in a private window and check the padlock; the www and bare address should both reach it."],
    ["spend-alerts", "Spend alerts set", "Vercel (Settings > Billing > Spend management), Neon (Billing > Usage alerts) and Cloudinary (Settings > Account > Usage alerts)."],
    ["backup", "Backup procedure tested", "Follow docs/BACKUP.md: note the Neon restore window and take the first logical dump."],
    ["search-console", "Sitemap submitted to Google Search Console", "Add /sitemap.xml and check the Pages report after a few days."],
    ["rollback", "Previous deployment ready to promote", "Vercel > Deployments: know which deployment to promote if the launch goes wrong (docs/DEPLOYMENT.md)."],
  ];
  for (const [id, label, detail] of manual) add("Do by hand", id, label, "manual", detail);
  return out;
}

export function summarise(results: readonly CheckResult[]) {
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return { ok: count("ok"), warn: count("warn"), fail: count("fail"), manual: count("manual"), ready: count("fail") === 0 };
}
