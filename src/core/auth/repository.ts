import { eq } from "drizzle-orm";
import { db } from "@/core/database/client";
import { users } from "@/core/database/schema";

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
