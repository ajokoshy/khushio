import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** How long each kind of row is kept. Everything older is summarised or removed, so the database never grows without bound. */
export const RETENTION = { clickDays: 30, auditDays: 180, loginDays: 1, stagingDays: 1 } as const;
export type MaintenanceResult = { clicksRolledUp: number; auditDeleted: number; loginDeleted: number; stagingDeleted: number };

const count = async (q: ReturnType<typeof sql>) => Number(((await db!.execute(q)).rows as { n: number }[])[0]?.n ?? 0);

/**
 * Housekeeping, safe to run at any time and any number of times:
 * - raw click rows older than RETENTION.clickDays become one small row per offer per day (click_daily), in ONE statement so nothing is lost or double counted;
 * - old audit entries, login attempts and import uploads are deleted.
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
  if (!db) return { clicksRolledUp: 0, auditDeleted: 0, loginDeleted: 0, stagingDeleted: 0 };
  const clicksRolledUp = await count(sql`
    with old as (delete from clicks where at < now() - make_interval(days => ${RETENTION.clickDays}) returning offer_id, merchant_id, at),
    agg as (select (at at time zone 'Asia/Kolkata')::date as day, offer_id, (array_agg(merchant_id))[1] as merchant_id, count(*)::int as clicks from old group by 1, 2),
    ins as (insert into click_daily (day, offer_id, merchant_id, clicks) select day, offer_id, merchant_id, clicks from agg
            on conflict (day, offer_id) do update set clicks = click_daily.clicks + excluded.clicks returning 1)
    select count(*)::int as n from old`);
  const auditDeleted = await count(sql`with d as (delete from audit_log where at < now() - make_interval(days => ${RETENTION.auditDays}) returning 1) select count(*)::int as n from d`);
  const loginDeleted = await count(sql`with d as (delete from login_attempts where at < now() - make_interval(days => ${RETENTION.loginDays}) returning 1) select count(*)::int as n from d`);
  const stagingDeleted = await count(sql`with d as (delete from import_staging where created_at < now() - make_interval(days => ${RETENTION.stagingDays}) returning 1) select count(*)::int as n from d`);
  return { clicksRolledUp, auditDeleted, loginDeleted, stagingDeleted };
}

/** Runs housekeeping on about one in five hundred affiliate clicks: no cron job or extra function needed to keep storage flat. */
export async function maintainSometimes(chance = 0.002): Promise<void> {
  if (Math.random() >= chance) return;
  try { await runMaintenance(); } catch { /* housekeeping must never affect visitors */ }
}

export type DbUsage = { totalBytes: number; tables: { name: string; bytes: number; rows: number }[]; clickRows: number; clickDays: number };
export async function dbUsage(): Promise<DbUsage> {
  if (!db) return { totalBytes: 0, tables: [], clickRows: 0, clickDays: 0 };
  const total = Number(((await db.execute(sql`select pg_database_size(current_database())::bigint as b`)).rows as { b: string }[])[0]?.b ?? 0);
  const tables = ((await db.execute(sql`select c.relname as name, pg_total_relation_size(c.oid)::bigint as b, greatest(c.reltuples, 0)::bigint as r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by b desc limit 10`)).rows as { name: string; b: string; r: string }[]).map((t) => ({ name: t.name, bytes: Number(t.b), rows: Number(t.r) }));
  return { totalBytes: total, tables, clickRows: await count(sql`select count(*)::int as n from clicks`), clickDays: await count(sql`select count(*)::int as n from click_daily`) };
}
