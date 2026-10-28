import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
type Counts = { published: number; drafts: number; deals: number; coupons: number; articles: number; c7: number; c30: number };
type Top = { label: string; n: number };
const run = async <T,>(q: ReturnType<typeof sql>): Promise<T[]> => ((await db!.execute(q)) as unknown as { rows: T[] }).rows;
export default async function Dashboard() {
  if (!db) return <p>DATABASE_URL is not set.</p>;
  const [c] = await run<Counts>(sql`SELECT
    (SELECT count(*)::int FROM products WHERE status='published') AS published, (SELECT count(*)::int FROM products WHERE status<>'published') AS drafts,
    (SELECT count(*)::int FROM deals) AS deals, (SELECT count(*)::int FROM coupons) AS coupons, (SELECT count(*)::int FROM articles) AS articles,
    (SELECT count(*)::int FROM clicks WHERE at > now() - interval '7 days') AS c7, (SELECT count(*)::int FROM clicks WHERE at > now() - interval '30 days') AS c30`);
  const top = await run<Top>(sql`SELECT COALESCE(p.name, d.title, 'Coupon ' || cp.code, 'Unknown link') AS label, count(*)::int AS n
    FROM clicks c LEFT JOIN offers o ON o.id = c.offer_id LEFT JOIN products p ON p.id = o.product_id LEFT JOIN deals d ON d.id = c.offer_id LEFT JOIN coupons cp ON cp.id = c.offer_id
    WHERE c.at > now() - interval '30 days' GROUP BY c.offer_id, p.name, d.title, cp.code ORDER BY n DESC LIMIT 10`);
  const stat = (l: string, v: number) => (<div key={l} className="rounded-card border border-sand bg-white p-4"><p className="text-xs text-ink/60">{l}</p><p className="font-display text-3xl font-semibold text-forest">{v}</p></div>);
  return (<>
    <h1 className="font-display text-3xl font-semibold text-forest">Dashboard</h1>
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{[stat("Published products", c.published), stat("Drafts", c.drafts), stat("Clicks, 7 days", c.c7), stat("Clicks, 30 days", c.c30), stat("Deals", c.deals), stat("Coupons", c.coupons), stat("Articles", c.articles)]}</div>
    <h2 className="mb-3 mt-10 font-display text-2xl font-semibold text-forest">Top links, last 30 days</h2>
    <ul className="rounded-card border border-sand bg-white">{top.length ? top.map((t, i) => <li key={i} className="flex justify-between border-b border-sand p-3 text-sm"><span>{t.label}</span><span className="font-medium">{t.n}</span></li>) : <li className="p-3 text-sm">No clicks yet.</li>}</ul>
    <p className="mt-8 text-sm">Export: <a className="underline" href="/admin/export/products">products CSV</a> · <a className="underline" href="/admin/export/clicks">clicks CSV</a></p></>);
}
