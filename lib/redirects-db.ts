import { eq, or } from "drizzle-orm";
import { permanentRedirect, redirect } from "next/navigation";
import { cached } from "@/lib/cache";
import { db, schema } from "@/lib/db";
import { normalizePath, planRedirect, type RedirectPlan } from "@/lib/redirects";

const lookup = cached(async (path: string): Promise<{ to: string; status: number } | null> => {
  if (!db) return null;
  const [r] = await db.select().from(schema.redirects).where(eq(schema.redirects.fromPath, path));
  return r ? { to: r.toPath, status: r.status } : null;
}, "redirect", ["redirects"], 600);

/** Call just before notFound(): if an admin (or a slug change) registered a redirect for this path, follow it. */
export async function followRedirect(path: string) {
  const p = normalizePath(path); if (!p || p.length > 200) return;
  const r = await lookup(p); if (!r) return;
  if (r.status === 301 || r.status === 308) permanentRedirect(r.to); else redirect(r.to);
}

/** Adds from -> to, keeping redirects single-hop (see planRedirect). Returns the plan so callers can show why it was refused. */
export async function addRedirect(from: string, to: string, note = "", status = 301): Promise<RedirectPlan> {
  const f = normalizePath(from), t = normalizePath(to);
  const rows = db && f && t ? await db.select().from(schema.redirects).where(or(eq(schema.redirects.toPath, f), eq(schema.redirects.fromPath, t))) : [];
  const plan = planRedirect(rows.map((r) => ({ fromPath: r.fromPath, toPath: r.toPath })), from, to);
  if (!plan.ok || !db) return plan;
  const stmts: unknown[] = [];
  for (const p of plan.remove) stmts.push(db.delete(schema.redirects).where(eq(schema.redirects.fromPath, p)));
  for (const p of plan.repoint) stmts.push(db.update(schema.redirects).set({ toPath: plan.to }).where(eq(schema.redirects.fromPath, p)));
  stmts.push(db.insert(schema.redirects).values({ fromPath: plan.from, toPath: plan.to, note, status: status === 302 ? 302 : 301 }).onConflictDoUpdate({ target: schema.redirects.fromPath, set: { toPath: plan.to, note, status: status === 302 ? 302 : 301 } }));
  await db.batch(stmts as unknown as [never, ...never[]]);
  return plan;
}
