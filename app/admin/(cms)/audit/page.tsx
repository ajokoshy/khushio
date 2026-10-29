import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Audit() {
  const rows = db ? await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(200) : [];
  return (<><h1 className="font-display text-3xl font-semibold text-forest">Audit log</h1><p className="mt-2 text-sm text-ink/70">The last 200 admin actions.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead><tr className="border-b border-sand"><th className="p-2">When (UTC)</th><th className="p-2">Who</th><th className="p-2">Action</th><th className="p-2">Target</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-sand"><td className="p-2">{r.at?.toISOString().replace("T", " ").slice(0, 19)}</td><td className="p-2">{r.actor}</td><td className="p-2">{r.action}</td><td className="p-2">{r.target}</td></tr>)}</tbody></table>
      {!rows.length && <p className="p-2 text-sm">Nothing recorded yet.</p>}</div></>);
}
