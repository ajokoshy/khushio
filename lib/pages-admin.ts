import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_PAGES } from "@/lib/pages-core";
/** Admin view of a page (includes drafts); never cached. */
export async function loadPageAdmin(slug: string) {
  const d = DEFAULT_PAGES[slug]; const [r] = db ? await db.select().from(schema.pages).where(eq(schema.pages.slug, slug)) : [];
  return { slug, isDefault: !!d, custom: !!r, isNew: !d && !r, title: r?.title ?? d?.title ?? "", body: r?.body ?? d?.body ?? "", description: r?.seoDescription ?? d?.description ?? "", status: r?.status ?? "published" };
}
