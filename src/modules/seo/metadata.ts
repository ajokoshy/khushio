import type { Metadata } from "next";
import { env } from "@/core/config/env";
import { SITE } from "@/shared/constants/site";
import type { SeoFields } from "@/modules/content/types";

/**
 * Release 7A: the ONE place that turns "what this page is" into its search and share tags. Every public page calls
 * buildMetadata(); nothing else writes a <title>, description, canonical, robots or Open Graph tag.
 *
 *  - A page can never end up without a title or a description: an empty or missing description falls back to the site
 *    description, and a missing title to the site name (tests/unit/seo-metadata.test.ts checks this).
 *  - The editor's search fields (seo_metadata: title, description, canonical, share picture, visibility) win over the defaults.
 *  - Thin, filtered, searched and later list pages are noindex,follow (see listingRobots / pagedRobots below).
 *  - The layout adds " | Khushio" to the title (template in src/app/layout.tsx), so titles here are without the site name.
 */

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 70;

/** Collapses white space and shortens at a word boundary with an ellipsis, so a long summary never gets cut mid-word by a search engine. */
export function clipText(text: string | null | undefined, max = DESCRIPTION_MAX): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

export const absoluteUrl = (path: string): string => `${env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

export type MetadataInput = {
  /** Page title without the site name. */
  title: string;
  description?: string | null;
  /** The page's own address as a path (no query), for example /products/blue-shoes. */
  path: string;
  /** Keep this page out of search results (thin, empty or filtered pages). Links on it are still followed. */
  noindex?: boolean;
  /** The editor's search fields for this item (seo_metadata), when it has any. */
  override?: SeoFields | null;
  /** A picture for sharing: an absolute https address. */
  image?: string | null;
  type?: "website" | "article";
  /** For a list page that is page N of a series: N > 1 gets its own canonical (?page=N) and is kept out of search results. */
  page?: number;
  /** Article details for Open Graph. */
  article?: { publishedTime?: Date | null; modifiedTime?: Date | null };
};

export function buildMetadata(input: MetadataInput): Metadata {
  const override = input.override ?? null;
  const title = (override?.title ?? input.title).trim() || SITE.name;
  const description = clipText(override?.description ?? input.description) || SITE.description;

  const paged = (input.page ?? 1) > 1;
  const ownCanonical = absoluteUrl(paged ? `${input.path}?page=${input.page}` : input.path);
  const canonical = override?.canonical ?? ownCanonical;

  // Visibility: the editor's setting wins, then the page's own rule (thin / filtered / later list pages).
  const robots = override?.robots
    ? { index: false, follow: override.robots === "noindex,follow" }
    : input.noindex || paged
      ? { index: false, follow: true }
      : { index: true, follow: true };

  const image = override?.ogImage ?? input.image ?? null;
  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE.name,
      type: input.type ?? "website",
      images: [image ?? absoluteUrl("/brand/banner.png")],
      ...(input.type === "article" && input.article
        ? {
            ...(input.article.publishedTime ? { publishedTime: input.article.publishedTime.toISOString() } : {}),
            ...(input.article.modifiedTime ? { modifiedTime: input.article.modifiedTime.toISOString() } : {}),
          }
        : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [image ?? absoluteUrl("/brand/banner.png")] },
  };
}

/** A page that does not exist (or is not visible): a title and noindex, so even a soft 404 can never be indexed. The route still answers 404 through notFound(). */
export function notFoundMetadata(what: string): Metadata {
  return { title: `${what} not found`, description: SITE.description, robots: { index: false, follow: false } };
}

/* ---------------------------------- checks used by the SEO admin screen ---------------------------------- */

export type SeoIssue = "title-long" | "description-short" | "description-long" | "no-own-description";
export const SEO_ISSUE_LABELS: Record<SeoIssue, string> = {
  "title-long": `Title over ${TITLE_MAX} characters (search engines cut it)`,
  "description-short": `Description under ${DESCRIPTION_MIN} characters`,
  "description-long": `Description over ${DESCRIPTION_MAX} characters (search engines cut it)`,
  "no-own-description": "No description of its own: a generated sentence is used",
};

/** What is wrong with a page's search text. `ownDescription` is the hand-written description (override, or the item's own summary text), if any. */
export function seoIssues(opts: { title: string | null; ownDescription: string | null; requiresOwnDescription: boolean }): SeoIssue[] {
  const issues: SeoIssue[] = [];
  if (opts.title && opts.title.length > TITLE_MAX) issues.push("title-long");
  const d = opts.ownDescription?.trim() ?? "";
  if (d.length === 0) {
    if (opts.requiresOwnDescription) issues.push("no-own-description");
  } else if (d.length < DESCRIPTION_MIN) issues.push("description-short");
  else if (d.length > DESCRIPTION_MAX) issues.push("description-long");
  return issues;
}
