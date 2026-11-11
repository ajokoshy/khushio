import { insertAuditRows, selectAuditLogs } from "./repository";

export type AuditEntry = {
  /** User id of whoever did it; null/undefined for system or script actions. */
  actor?: string | null;
  /** Dot-separated verb, e.g. "product.updated", "auth.login_success". */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Small, non-secret context (ids, changed field names). Never passwords, tokens or raw personal data. */
  metadata?: Record<string, unknown> | null;
};

const toRow = (e: AuditEntry) => ({
  actorId: e.actor ?? null,
  action: e.action,
  entityType: e.entityType,
  entityId: e.entityId ?? null,
  metadata: e.metadata ?? null,
});

/** Every admin write calls this once it has succeeded. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  await insertAuditRows([toRow(entry)]);
}

export async function logAuditMany(entries: AuditEntry[]): Promise<void> {
  await insertAuditRows(entries.map(toRow));
}

export type AuditListInput = { q?: string; includeAttempts?: boolean; limit: number; offset: number };

/** Reads limit+1 rows so the viewer knows whether a next page exists without a count query. */
export async function listAuditLogs(input: AuditListInput) {
  const rows = await selectAuditLogs({ ...input, limit: input.limit + 1 });
  return { rows: rows.slice(0, input.limit), hasNext: rows.length > input.limit };
}
