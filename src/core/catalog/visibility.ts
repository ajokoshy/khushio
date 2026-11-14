import { sql, type SQL } from "drizzle-orm";
import { products } from "@/core/database/schema";

/**
 * The one rule for "may a visitor see this product" (Release 3B/3C). No cron is needed for scheduled
 * publishing: a SCHEDULED product simply becomes visible once its publish_at has passed.
 *
 *   PUBLISHED                              -> visible
 *   SCHEDULED and publish_at <= now        -> visible
 *   DRAFT, REVIEW, ARCHIVED, DISCONTINUED  -> never visible (404 for visitors)
 */
export type VisibilityInput = { status: string; publishAt: Date | string | null };

export function isProductVisible(product: VisibilityInput, now: Date = new Date()): boolean {
  if (product.status === "PUBLISHED") return true;
  if (product.status !== "SCHEDULED" || product.publishAt === null) return false;
  const at = product.publishAt instanceof Date ? product.publishAt : new Date(product.publishAt);
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
}

/** The same rule as a SQL condition, evaluated with the database clock. Every public product query uses it. */
export function visibleProductCondition(): SQL {
  return sql`(${products.status} = 'PUBLISHED' OR (${products.status} = 'SCHEDULED' AND ${products.publishAt} IS NOT NULL AND ${products.publishAt} <= now()))`;
}
