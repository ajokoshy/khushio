import { desc, sql } from "drizzle-orm";
import { approvedFor, checkDestination, hostOf } from "@/lib/affiliate/rules";
import { strictDomains } from "@/lib/config/env";
import { db, schema } from "@/lib/db";
import { markVerified } from "../../actions";
export const dynamic = "force-dynamic";
const PAGE = 50, STALE_DAYS = 30;
const FILTERS = { all: sql`true`, live: sql`(o.is_active and (o.expires_at is null or o.expires_at > now()) and p.status = 'published' and (m.id is null or m.is_active))`,
  expired: sql`(o.expires_at is not null and o.expires_at <= now())`, inactive: sql`(not o.is_active or (m.id is not null and not m.is_active))`,
  stale: sql`(o.is_active and (o.last_verified_at is null or o.last_verified_at < now() - interval '30 days'))`, unchecked: sql`(m.id is null or (m.approved_domains = '' and m.website = ''))` } as const;
type Filter = keyof typeof FILTERS;
type Row = { id: string; merchant: string; url: string; price: number | null; price_checked_at: Date | null; last_verified_at: Date | null; is_active: boolean; expires_at: Date | null; pid: string; pname: string; pstatus: string; approved_domains: string | null; website: string | null; m_active: boolean | null; clicks: number };
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "never");
function state(r: Row, now: number) {
  if (r.pstatus !== "published") return { t: `Product ${r.pstatus}`, c: "text-ink/60" };
  if (!r.is_active || r.m_active === false) return { t: "Inactive", c: "text-ink/60" };
  if (r.expires_at && new Date(r.expires_at).getTime() <= now) return { t: "Expired", c: "text-terracotta-600" };
  return { t: "Live", c: "text-forest" };
}
export default async function Links({ searchParams }: { searchParams: Promise<{ f?: string; page?: string }> }) {
  const sp = await searchParams, f: Filter = sp.f && sp.f in FILTERS ? (sp.f as Filter) : "all", page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  if (!db) return <p>DATABASE_URL is not set.</p>;
  const from = sql`from offers o join products p on p.id = o.product_id left join merchants m on m.id = o.merchant_id where ${FILTERS[f]}`;
  const total = Number(((await db.execute(sql`select count(*)::int as n ${from}`)).rows as { n: number }[])[0]?.n ?? 0);
  const rows = (await db.execute(sql`select o.id, o.merchant, o.url, o.price, o.price_checked_at, o.last_verified_at, o.is_active, o.expires_at, p.id as pid, p.name as pname, p.status as pstatus, m.approved_domains, m.website, m.is_active as m_active,
      (select count(*)::int from clicks c where c.offer_id = o.id and c.at > now() - interval '30 days') as clicks ${from} order by (o.last_verified_at is null) desc, o.last_verified_at asc, o.id limit ${PAGE} offset ${(page - 1) * PAGE}`)).rows as Row[];
  const deals = await db.select().from(schema.deals).orderBy(desc(schema.deals.createdAt)).limit(30), coupons = await db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt)).limit(30);
  const pages = Math.max(1, Math.ceil(total / PAGE)), now = Date.now(), back = `/admin/links?f=${f}&page=${page}`;
  const tab = (k: Filter, label: string) => <a key={k} href={`/admin/links?f=${k}`} className={`rounded-full border px-4 py-1.5 ${f === k ? "bg-forest text-ivory" : "border-sand bg-white"}`}>{label}</a>;
  return (<div><h1 className="font-display text-3xl font-semibold text-forest">Affiliate links ({total})</h1>
    <p className="mt-2 max-w-2xl text-sm text-ink/70">Every retailer link on the site. Links are re-checked against the merchant’s approved domains each time they are followed. “Stale” means not checked in {STALE_DAYS} days.</p>
    <nav aria-label="Filter" className="my-5 flex flex-wrap gap-2 text-sm">{tab("all", "All")}{tab("live", "Live")}{tab("stale", "Needs a check")}{tab("expired", "Expired")}{tab("inactive", "Inactive")}{tab("unchecked", "No approved domains")}</nav>
    <div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-left text-sm"><thead><tr className="border-b border-sand"><th className="p-2">Product</th><th className="p-2">Retailer</th><th className="p-2">Link</th><th className="p-2">Status</th><th className="p-2">Price</th><th className="p-2">Link checked</th><th className="p-2">Clicks (30d)</th><th className="p-2" /></tr></thead>
      <tbody>{rows.map((r) => { const s = state(r, now); const chk = checkDestination(r.url, approvedFor(r.approved_domains ?? "", r.website ?? ""), strictDomains());
        return (<tr key={r.id} className="border-b border-sand align-top"><td className="p-2"><a className="underline" href={`/admin/products/${r.pid}`}>{r.pname}</a></td><td className="p-2">{r.merchant}</td>
          <td className="p-2"><code className="text-xs">{hostOf(r.url) || r.url}</code>{!chk.ok && <span className="block text-xs text-terracotta-600">Blocked: {chk.reason === "domain" ? "domain not approved" : chk.reason}</span>}</td>
          <td className={`p-2 ${s.c}`}>{s.t}{r.expires_at ? <span className="block text-xs text-ink/60">ends {day(r.expires_at)}</span> : null}</td>
          <td className="p-2">{r.price ? `₹${r.price}` : "-"}<span className="block text-xs text-ink/60">{r.price ? (r.price_checked_at ? `checked ${day(r.price_checked_at)}` : "unverified") : ""}</span></td>
          <td className="p-2">{day(r.last_verified_at)}</td><td className="p-2">{r.clicks}</td>
          <td className="p-2"><form action={markVerified}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="kind" value="offer" /><input type="hidden" name="back" value={back} /><button className="underline">Mark checked</button></form></td></tr>); })}
        {!rows.length && <tr><td className="p-3" colSpan={8}>Nothing matches this filter.</td></tr>}</tbody></table></div>
    {pages > 1 && <nav aria-label="Pages" className="mt-4 flex items-center gap-4 text-sm">{page > 1 && <a className="underline" href={`/admin/links?f=${f}&page=${page - 1}`}>Previous</a>}<span>Page {page} of {pages}</span>{page < pages && <a className="underline" href={`/admin/links?f=${f}&page=${page + 1}`}>Next</a>}</nav>}
    <h2 className="mb-2 mt-10 font-display text-2xl font-semibold text-forest">Deals and coupons</h2>
    <ul className="divide-y divide-sand rounded-card border border-sand bg-white text-sm">{deals.map((d) => (<li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><span>Deal: {d.title} <span className="text-ink/60">({d.merchant}{d.expiresAt ? `, ends ${day(d.expiresAt)}` : ""})</span></span><span className={!d.isActive || (d.expiresAt && d.expiresAt.getTime() <= now) ? "text-terracotta-600" : "text-forest"}>{!d.isActive ? "Inactive" : d.expiresAt && d.expiresAt.getTime() <= now ? "Expired" : "Live"}</span></li>))}
      {coupons.map((c) => (<li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><span>Coupon <code>{c.code}</code> <span className="text-ink/60">({c.merchant}; checked {day(c.verifiedAt)})</span></span>
        <form action={markVerified}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="kind" value="coupon" /><input type="hidden" name="back" value={back} /><button className="underline">I tested it today</button></form></li>))}
      {!deals.length && !coupons.length && <li className="p-3">No deals or coupons yet.</li>}</ul></div>);
}
