import { and, eq, ne } from "drizzle-orm";
import { db } from "./client";
import { redirects } from "./schema";

type Database = ReturnType<typeof db>;

/**
 * Release 7A. The statements that keep the redirects table right when a public address changes. They are returned
 * UN-AWAITED so a module's repository can put them in the same all-or-nothing write as the change itself
 * (runAtomically, see atomic.ts): either the slug and its 301 both change, or neither does.
 *
 * Addresses are the normalised paths from src/modules/redirects/path.ts (lower case, no trailing slash).
 */

/** A page moved from `fromPath` to `toPath`: the old address gets a 301, and nothing is ever left pointing through it. */
export function movedStatements(d: Database, p: { fromPath: string; toPath: string }) {
  return [
    // The new address is live now, so any old rule for it (a redirect or a "gone" row) must go. This also stops A -> B -> A loops.
    d.delete(redirects).where(eq(redirects.fromPath, p.toPath)),
    // Rules that already pointed at the old address now point at the new one: visitors hop once, never twice.
    d.update(redirects).set({ toPath: p.toPath, updatedAt: new Date() }).where(and(eq(redirects.toPath, p.fromPath), ne(redirects.statusCode, 410))),
    d
      .insert(redirects)
      .values({ fromPath: p.fromPath, toPath: p.toPath, statusCode: 301, source: "auto" })
      .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: p.toPath, statusCode: 301, source: "auto", updatedAt: new Date() } }),
  ];
}

/** A page was deleted for good: its address answers 410, and every rule that led to it does too. */
export function goneStatements(d: Database, p: { path: string }) {
  return [
    d.update(redirects).set({ statusCode: 410, toPath: null, updatedAt: new Date() }).where(eq(redirects.toPath, p.path)),
    d
      .insert(redirects)
      .values({ fromPath: p.path, toPath: null, statusCode: 410, source: "auto" })
      .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: null, statusCode: 410, source: "auto", updatedAt: new Date() } }),
  ];
}

/** A page now exists at this address (it was created, or a removed one came back): a rule for it would hide it. */
export function releaseStatements(d: Database, p: { path: string }) {
  return [d.delete(redirects).where(eq(redirects.fromPath, p.path))];
}
