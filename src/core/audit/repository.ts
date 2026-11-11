import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "@/core/database/client";
import { auditLogs, users } from "@/core/database/schema";
import { escapeLike } from "@/core/validation/like";
import { LOGIN_ATTEMPT_ENTITY } from "./constants";

export type AuditRow = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function insertAuditRows(rows: AuditRow[]) {
  if (rows.length === 0) return;
  await db().insert(auditLogs).values(
    rows.map((r) => ({
      actorId: r.actorId ?? null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId ?? null,
      metadata: r.metadata ?? null,
    })),
  );
}

export type AuditQuery = { q?: string; includeAttempts?: boolean; limit: number; offset: number };

export async function selectAuditLogs({ q, includeAttempts, limit, offset }: AuditQuery) {
  const conditions = [];
  if (!includeAttempts) conditions.push(ne(auditLogs.entityType, LOGIN_ATTEMPT_ENTITY));
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conditions.push(
      or(ilike(auditLogs.action, like), ilike(auditLogs.entityType, like), ilike(auditLogs.entityId, like), ilike(users.email, like)),
    );
  }
  return db()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);
}
