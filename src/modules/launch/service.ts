import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/core/config/cache";
import { env } from "@/core/config/env";
import { LEGAL_PAGES, runChecks, summarise, type CheckResult } from "./checks";
import * as repo from "./repository";
import robots from "@/app/robots";

/**
 * Launch readiness (Release 7B): gathers the facts for the pure checks in checks.ts. Read-only, admin only, never cached
 * (it is the page you open to see the truth right now).
 */
export async function getLaunchReport(): Promise<{ results: CheckResult[]; summary: ReturnType<typeof summarise> }> {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  const robotsBlocksAll = list.some((r) => (r.userAgent === "*" || (Array.isArray(r.userAgent) && r.userAgent.includes("*"))) && [r.disallow].flat().includes("/"));
  const [publishedPageSlugs, publishedProducts, activeAffiliateLinks, activeAdmins] = await Promise.all([
    repo.selectPublishedPageSlugs(LEGAL_PAGES.map((p) => p.slug)),
    repo.countPublishedProducts(),
    repo.countActiveAffiliateLinks(),
    repo.selectActiveAdmins(),
  ]);
  const results = runChecks({
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    hasDatabase: !!env.DATABASE_URL,
    authSecretLength: env.AUTH_SECRET?.length ?? 0,
    cronSecretLength: env.CRON_SECRET?.length ?? 0,
    cloudinaryConfigured: !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
    analytics: env.NEXT_PUBLIC_ANALYTICS,
    cspEnforced: env.CSP_ENFORCE === "true",
    publishedPageSlugs,
    publishedProducts,
    activeAffiliateLinks,
    activeAdmins,
    robotsBlocksAll,
    now: new Date(),
  });
  return { results, summary: summarise(results) };
}

/** The legal pages that are published, for the footer (cached with the content tag, so publishing a page shows its link within minutes). */
export const getPublishedLegalLinks = unstable_cache(
  async () => {
    try {
      const live = new Set(await repo.selectPublishedPageSlugs(LEGAL_PAGES.map((p) => p.slug)));
      return LEGAL_PAGES.filter((p) => live.has(p.slug)).map((p) => ({ label: p.label, href: `/p/${p.slug}` }));
    } catch (error) {
      console.error("Legal links unavailable", error);
      return [];
    }
  },
  ["legal-links"],
  { revalidate: 60 * 5, tags: [CACHE_TAGS.articles] },
);
