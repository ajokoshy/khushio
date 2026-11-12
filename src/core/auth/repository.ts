import { and, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/core/database/client";
import { loginAttempts, users } from "@/core/database/schema";

export async function findUserByEmail(email: string) {
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function findUserById(id: string) {
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

export async function touchLastLogin(userId: string) {
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

/* ---- Login rate limiting (Release 2C). Only hashes are stored, see throttle.ts ---- */

export type FailedAttemptRow = { emailHash: string; ipHash: string; createdAt: Date };

/** Uses login_attempts_email_idx and login_attempts_ip_idx. At most a few dozen rows by design. */
export async function selectFailuresSince(emailHash: string, ipHash: string, since: Date): Promise<FailedAttemptRow[]> {
  return db()
    .select({ emailHash: loginAttempts.emailHash, ipHash: loginAttempts.ipHash, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(gt(loginAttempts.createdAt, since), or(eq(loginAttempts.emailHash, emailHash), eq(loginAttempts.ipHash, ipHash))));
}

export async function insertFailure(emailHash: string, ipHash: string): Promise<void> {
  await db().insert(loginAttempts).values({ emailHash, ipHash });
}

export async function deleteFailuresForEmail(emailHash: string): Promise<void> {
  await db().delete(loginAttempts).where(eq(loginAttempts.emailHash, emailHash));
}

export async function deleteFailuresBefore(cutoff: Date): Promise<void> {
  await db().delete(loginAttempts).where(lt(loginAttempts.createdAt, cutoff));
}
