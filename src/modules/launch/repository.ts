import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/core/database/client";
import { visibleProductCondition } from "@/core/catalog/visibility";
import { affiliateLinks, pages, products, roles, userRoles, users } from "@/core/database/schema";
import { visiblePageCondition } from "@/modules/content/visibility";

/** Repository: the only code in this module that talks to the database. */

export async function selectPublishedPageSlugs(slugs: readonly string[]): Promise<string[]> {
  const rows = await db().select({ slug: pages.slug }).from(pages).where(and(inArray(pages.slug, [...slugs]), visiblePageCondition()));
  return rows.map((r) => r.slug);
}

export async function countPublishedProducts(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(products).where(visibleProductCondition());
  return Number(row?.n ?? 0);
}

export async function countActiveAffiliateLinks(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(affiliateLinks).where(eq(affiliateLinks.isActive, true));
  return Number(row?.n ?? 0);
}

export async function selectActiveAdmins(): Promise<{ email: string; roles: string[]; lastLoginAt: Date | null }[]> {
  const rows = await db()
    .select({ email: users.email, lastLoginAt: users.lastLoginAt, role: roles.key })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.isActive, true));
  const byEmail = new Map<string, { email: string; roles: string[]; lastLoginAt: Date | null }>();
  for (const r of rows) {
    const entry = byEmail.get(r.email) ?? { email: r.email, roles: [], lastLoginAt: r.lastLoginAt };
    if (r.role) entry.roles.push(r.role);
    byEmail.set(r.email, entry);
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}
