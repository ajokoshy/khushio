import { sql, type SQL } from "drizzle-orm";
import { articles, pages } from "@/core/database/schema";
import type { Doc } from "./document";

/**
 * The one rule for "may a visitor see this article or page" (Release 6A), the same shape as products. No cron is
 * needed for scheduled publishing: a SCHEDULED item becomes visible once its publish_at has passed.
 *
 *   PUBLISHED                          -> visible
 *   SCHEDULED and publish_at <= now    -> visible
 *   DRAFT, REVIEW, ARCHIVED            -> never visible (404 for visitors)
 */
export type VisibilityInput = { status: string; publishAt: Date | string | null };

export function isContentVisible(item: VisibilityInput, now: Date = new Date()): boolean {
  if (item.status === "PUBLISHED") return true;
  if (item.status !== "SCHEDULED" || item.publishAt === null) return false;
  const at = item.publishAt instanceof Date ? item.publishAt : new Date(item.publishAt);
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
}

/** The same rule as a SQL condition, evaluated with the database clock. Every public article query uses it. */
export function visibleArticleCondition(): SQL {
  return sql`(${articles.status} = 'PUBLISHED' OR (${articles.status} = 'SCHEDULED' AND ${articles.publishAt} IS NOT NULL AND ${articles.publishAt} <= now()))`;
}

export function visiblePageCondition(): SQL {
  return sql`(${pages.status} = 'PUBLISHED' OR (${pages.status} = 'SCHEDULED' AND ${pages.publishAt} IS NOT NULL AND ${pages.publishAt} <= now()))`;
}

export type { Doc };
