import { db, schema } from "@/lib/db";
/** Records an admin action. Never throws: logging must not break the action itself. */
export async function audit(action: string, target = "") {
  if (!db) return;
  try { await db.insert(schema.auditLog).values({ actor: process.env.ADMIN_EMAIL ?? "admin", action, target: target.slice(0, 200) }); } catch {}
}
