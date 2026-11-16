/**
 * Release 4B against a real Postgres: the daily roll-up and purge, the cron route, the reports and the conversion
 * import. Time is passed in, so every day boundary is exact. Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => {
  process.env.CRON_SECRET = "cron-secret-for-tests-123";
  return { db: null as unknown };
});
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));

import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as cronGet } from "@/app/api/cron/affiliate-rollup/route";
import { affiliateClickDaily, affiliateClicks, affiliateConversions, affiliateImportLogs, affiliateLinks, affiliateNetworks, auditLogs, merchants, products, siteSettings, users } from "@/core/database/schema";
import * as conversions from "@/modules/conversions/service";
import { buildClickReport } from "@/modules/reports/report-service";
import { runDailyMaintenance, setRetentionDays, getRetentionDays } from "@/modules/reports/rollup";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: string;
let linkA: string;
let linkB: string;
let networkId: string;

// "Now" is 16 Nov 2026, 02:00 IST (= 15 Nov 20:30 UTC), the time the cron job runs. "Yesterday" in India is 15 Nov.
const NOW = new Date("2026-11-15T20:30:00Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);

const click = (linkId: string, at: Date, isBot = false) => ({ linkId, clickedAt: at, isBot });
async function dailyTotal(linkId: string, day: string) {
  const [row] = await t.db.select().from(affiliateClickDaily).where(eq(affiliateClickDaily.linkId, linkId)).then((rows) => rows.filter((r) => r.day === day));
  return row?.clicks ?? 0;
}
const rawCount = async () => Number((await t.db.select({ n: sql<number>`count(*)::int` }).from(affiliateClicks))[0]?.n);

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  const [u] = await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id });
  actor = u!.id;
  const [m] = await t.db.insert(merchants).values({ slug: "amazon-india", name: "Amazon India", allowedDomains: ["amazon.in"] }).returning({ id: merchants.id });
  const [p] = await t.db.insert(products).values({ slug: "sony-xm5", name: "Sony XM5" }).returning({ id: products.id });
  const [a] = await t.db.insert(affiliateLinks).values({ slug: "link-a", merchantId: m!.id, productId: p!.id, destinationUrl: "https://amazon.in/a", createdAt: ist("2026-10-01T10:00:00") }).returning({ id: affiliateLinks.id });
  const [b] = await t.db.insert(affiliateLinks).values({ slug: "link-b", merchantId: m!.id, destinationUrl: "https://amazon.in/b", createdAt: ist("2026-10-01T10:00:00") }).returning({ id: affiliateLinks.id });
  linkA = a!.id;
  linkB = b!.id;
  const [n] = await t.db.insert(affiliateNetworks).values({ key: "cuelinks", name: "Cuelinks" }).returning({ id: affiliateNetworks.id });
  networkId = n!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("retention setting", () => {
  it("is seeded by the SQL file with 30 days and can be changed (7 to 365) with an audit row", async () => {
    expect(await getRetentionDays()).toBe(30);
    await expect(setRetentionDays(3, actor)).rejects.toMatchObject({ fields: { retentionDays: expect.any(String) } });
    await expect(setRetentionDays(400, actor)).rejects.toMatchObject({ status: 422 });
    await setRetentionDays(14, actor);
    expect(await getRetentionDays()).toBe(14);
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.action, "settings.click_retention_updated")))[0];
    expect(log?.metadata).toEqual({ from: 30, to: 14 });
    await setRetentionDays(30, actor);
  });

  it("a hand-edited bad value falls back to 30", async () => {
    await t.db.update(siteSettings).set({ value: "oops" }).where(eq(siteSettings.key, "affiliate.click_retention_days"));
    expect(await getRetentionDays()).toBe(30);
    await t.db.update(siteSettings).set({ value: 30 }).where(eq(siteSettings.key, "affiliate.click_retention_days"));
  });
});

describe("roll-up (idempotent), bots and purge", () => {
  it("counts human clicks per link and India day, leaves bots out, and leaves today alone", async () => {
    await t.db.insert(affiliateClicks).values([
      click(linkA, ist("2026-11-14T00:00:00")),   // first second of 14 Nov IST
      click(linkA, ist("2026-11-14T23:59:59")),   // last second of 14 Nov IST
      click(linkA, ist("2026-11-14T10:00:00"), true), // a bot
      click(linkA, ist("2026-11-15T09:00:00")),
      click(linkB, ist("2026-11-15T09:30:00")),
      click(linkB, ist("2026-11-16T01:00:00")),   // today (16 Nov, before the run): not complete, not rolled up
    ]);
    const result = await runDailyMaintenance(NOW, actor);
    expect(result.daysWritten).toBe(3);
    expect(await dailyTotal(linkA, "2026-11-14")).toBe(2);
    expect(await dailyTotal(linkA, "2026-11-15")).toBe(1);
    expect(await dailyTotal(linkB, "2026-11-15")).toBe(1);
    expect(await dailyTotal(linkB, "2026-11-16")).toBe(0);
  });

  it("running it twice gives the same totals and the same row count", async () => {
    const snapshot = async () => (await t.db.select().from(affiliateClickDaily)).map((r) => `${r.linkId}|${r.day}|${r.clicks}`).sort();
    const first = await snapshot();
    await runDailyMaintenance(NOW, actor);
    await runDailyMaintenance(NOW, actor);
    expect(await snapshot()).toEqual(first);
  });

  it("picks up a late click on an earlier day, and never lowers a total", async () => {
    await t.db.insert(affiliateClicks).values(click(linkA, ist("2026-11-15T12:00:00")));
    await runDailyMaintenance(NOW, actor);
    expect(await dailyTotal(linkA, "2026-11-15")).toBe(2);
    // Simulate a day whose raw clicks were partly purged: the stored total must not drop.
    await t.db.delete(affiliateClicks).where(eq(affiliateClicks.linkId, linkA));
    await runDailyMaintenance(NOW, actor);
    expect(await dailyTotal(linkA, "2026-11-15")).toBe(2);
    expect(await dailyTotal(linkA, "2026-11-14")).toBe(2);
  });

  it("deletes only raw clicks older than the retention, bots included, and keeps the totals", async () => {
    await t.db.delete(affiliateClicks);
    await t.db.insert(affiliateClicks).values([
      click(linkA, ist("2026-10-10T10:00:00")),        // 37 days old: purged
      click(linkA, ist("2026-10-10T11:00:00"), true),  // old bot: purged, never counted
      click(linkA, ist("2026-10-20T10:00:00")),        // 27 days old: kept
      click(linkA, ist("2026-11-15T10:00:00")),        // yesterday: kept
    ]);
    const result = await runDailyMaintenance(NOW, actor);
    expect(result.clicksPurged).toBe(2);
    expect(await rawCount()).toBe(2);
    expect(await dailyTotal(linkA, "2026-10-10")).toBe(1); // counted BEFORE it was deleted, the bot was not
  });

  it("a click about to be purged is rolled up first even when it is older than the usual one-week catch-up", async () => {
    await t.db.delete(affiliateClicks);
    await t.db.delete(affiliateClickDaily);
    await t.db.insert(affiliateClicks).values([click(linkB, ist("2026-10-05T10:00:00")), click(linkB, ist("2026-10-05T11:00:00")), click(linkB, ist("2026-11-12T10:00:00"))]);
    const result = await runDailyMaintenance(NOW, actor);
    expect(result.clicksPurged).toBe(2);
    expect(await dailyTotal(linkB, "2026-10-05")).toBe(2);
    expect(await dailyTotal(linkB, "2026-11-12")).toBe(1);
  });

  it("shortening the retention purges the newly old clicks, after counting them", async () => {
    await t.db.delete(affiliateClicks);
    await t.db.delete(affiliateClickDaily);
    await t.db.insert(affiliateClicks).values([click(linkA, ist("2026-11-01T10:00:00")), click(linkA, ist("2026-11-12T10:00:00"))]);
    await runDailyMaintenance(NOW, actor); // 30 days: nothing purged
    expect(await rawCount()).toBe(2);
    await setRetentionDays(7, actor);
    const result = await runDailyMaintenance(NOW, actor);
    expect(result.clicksPurged).toBe(1);
    expect(await dailyTotal(linkA, "2026-11-01")).toBe(1);
    await setRetentionDays(30, actor);
  });

  it("writes one audit row per run, with no actor for the scheduled job", async () => {
    const before = (await t.db.select().from(auditLogs).where(eq(auditLogs.action, "affiliate.rollup_run"))).length;
    await runDailyMaintenance(NOW, null);
    const rows = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "affiliate.rollup_run"));
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1)?.actorId).toBeNull();
  });
});

describe("cron route", () => {
  const call = (headers: Record<string, string> = {}) => cronGet(new NextRequest("http://localhost/api/cron/affiliate-rollup", { headers }));

  it("rejects a missing secret and a wrong secret, and does nothing", async () => {
    const before = (await t.db.select().from(auditLogs).where(eq(auditLogs.action, "affiliate.rollup_run"))).length;
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer not-the-secret-at-all" })).status).toBe(401);
    expect((await call({ authorization: "cron-secret-for-tests-123" })).status).toBe(401);
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.action, "affiliate.rollup_run"))).length).toBe(before);
  });

  it("runs the job with the right secret and reports what it did", async () => {
    const response = await call({ authorization: "Bearer cron-secret-for-tests-123" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, retentionDays: 30, daysWritten: expect.any(Number), clicksPurged: expect.any(Number) });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("click report matches the raw counts", () => {
  it("totals, per day, per link, per merchant, per product, zero-click links, bots excluded", async () => {
    await t.db.delete(affiliateClicks);
    await t.db.delete(affiliateClickDaily);
    const day = (d: string, h: number, link: string, bot = false) => click(link, ist(`${d}T${String(h).padStart(2, "0")}:00:00`), bot);
    await t.db.insert(affiliateClicks).values([
      day("2026-11-10", 9, linkA), day("2026-11-10", 10, linkA), day("2026-11-10", 11, linkA, true),
      day("2026-11-12", 9, linkA), day("2026-11-12", 9, linkB), day("2026-11-12", 10, linkB),
    ]);
    await runDailyMaintenance(NOW, actor);

    const report = await buildClickReport(7, NOW);
    expect(report.range).toEqual({ from: "2026-11-09", to: "2026-11-15", days: 7 });
    const raw = Number((await t.db.select({ n: sql<number>`count(*)::int` }).from(affiliateClicks).where(eq(affiliateClicks.isBot, false)))[0]?.n);
    expect(report.totalClicks).toBe(raw);
    expect(report.totalClicks).toBe(5);
    expect(report.byDay).toHaveLength(7);
    expect(report.byDay.find((d) => d.day === "2026-11-10")?.clicks).toBe(2);
    expect(report.byDay.find((d) => d.day === "2026-11-11")?.clicks).toBe(0);
    expect(report.topLinks.map((l) => [l.slug, l.clicks])).toEqual([["link-a", 3], ["link-b", 2]]);
    expect(report.byMerchant).toEqual([expect.objectContaining({ merchantName: "Amazon India", clicks: 5 })]);
    expect(report.byProduct).toEqual([expect.objectContaining({ productSlug: "sony-xm5", clicks: 3 })]); // link-b has no product
    expect(report.zeroClickLinks).toEqual([]);
  });

  it("lists active links with no click in the window, leaves out links created today, and counts today so far from raw clicks", async () => {
    const [m] = await t.db.select().from(merchants);
    await t.db.insert(affiliateLinks).values([
      { slug: "quiet-link", merchantId: m!.id, destinationUrl: "https://amazon.in/q", createdAt: ist("2026-10-20T10:00:00") },
      { slug: "brand-new", merchantId: m!.id, destinationUrl: "https://amazon.in/n", createdAt: ist("2026-11-16T01:00:00") },
      { slug: "switched-off", merchantId: m!.id, destinationUrl: "https://amazon.in/s", isActive: false, createdAt: ist("2026-10-20T10:00:00") },
    ]);
    await t.db.insert(affiliateClicks).values([click(linkA, ist("2026-11-16T01:30:00")), click(linkA, ist("2026-11-16T01:40:00"), true)]);
    const report = await buildClickReport(7, NOW);
    expect(report.zeroClickLinks.map((l) => l.slug)).toEqual(["quiet-link"]);
    expect(report.todaySoFar).toBe(1);
  });

  it("totals conversions by status and currency for the window", async () => {
    await t.db.insert(affiliateConversions).values([
      { networkId, externalOrderId: "r-1", commissionMinor: 10000, status: "approved", convertedAt: ist("2026-11-10T10:00:00") },
      { networkId, externalOrderId: "r-2", commissionMinor: 5050, status: "approved", convertedAt: ist("2026-11-11T10:00:00") },
      { networkId, externalOrderId: "r-3", commissionMinor: 700, status: "pending", convertedAt: ist("2026-11-12T10:00:00") },
      { networkId, externalOrderId: "r-old", commissionMinor: 9999, status: "approved", convertedAt: ist("2026-09-01T10:00:00") },
    ]);
    const report = await buildClickReport(7, NOW);
    expect(report.conversions).toEqual([
      { status: "approved", currency: "INR", orders: 2, commissionMinor: 15050 },
      { status: "pending", currency: "INR", orders: 1, commissionMinor: 700 },
    ]);
    await t.db.delete(affiliateConversions);
  });
});

describe("conversion CSV import (real SQL)", () => {
  const csv = (...lines: string[]) => ["order_id,status,commission,date,sub_id", ...lines].join("\n");
  const run = (text: string, name = "report.csv") => conversions.importConversions({ csvText: text, filename: name, networkId, currency: "INR" }, actor);
  const all = () => t.db.select().from(affiliateConversions);

  it("imports new orders, attributes them to links by sub-ID, and logs the import", async () => {
    const summary = await run(csv("A-1,approved,120.50,2026-11-01,link-a", "A-2,pending,80,2026-11-02,", "A-3,approved,10,2026-11-03,unknown-slug"));
    expect(summary).toMatchObject({ rowsInFile: 3, inserted: 3, updated: 0, unchanged: 0, failed: 0, attributed: 1 });
    const rows = await all();
    expect(rows.find((r) => r.externalOrderId === "A-1")).toMatchObject({ commissionMinor: 12050, status: "approved", linkId: linkA, networkId });
    expect(rows.find((r) => r.externalOrderId === "A-3")?.linkId).toBeNull();
    const log = (await t.db.select().from(affiliateImportLogs))[0];
    expect(log).toMatchObject({ source: "csv:cuelinks:report.csv", rowsProcessed: 3, rowsFailed: 0 });
    expect(log?.finishedAt).not.toBeNull();
  });

  it("importing the same file again changes nothing (de-duplicates)", async () => {
    const same = csv("A-1,approved,120.50,2026-11-01,link-a", "A-2,pending,80,2026-11-02,", "A-3,approved,10,2026-11-03,unknown-slug");
    const before = (await all()).map((r) => `${r.id}|${r.status}|${r.commissionMinor}`).sort();
    const summary = await run(same);
    expect(summary).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
    expect((await all()).map((r) => `${r.id}|${r.status}|${r.commissionMinor}`).sort()).toEqual(before);
    expect(await all()).toHaveLength(3);
  });

  it("a later report reconciles: status and commission update in place, the original date stays, new orders are added", async () => {
    const original = (await all()).find((r) => r.externalOrderId === "A-2")!;
    const summary = await run(csv("A-2,approved,95,2026-12-31,link-b", "A-4,paid,5,2026-11-04,"));
    expect(summary).toMatchObject({ inserted: 1, updated: 1, unchanged: 0 });
    const updated = (await all()).find((r) => r.externalOrderId === "A-2")!;
    expect(updated).toMatchObject({ id: original.id, status: "approved", commissionMinor: 9500, linkId: linkB });
    expect(updated.convertedAt.toISOString()).toBe(original.convertedAt.toISOString());
  });

  it("the same order id on a different network is a different order", async () => {
    const [other] = await t.db.insert(affiliateNetworks).values({ key: "earnkaro", name: "EarnKaro" }).returning({ id: affiliateNetworks.id });
    await conversions.importConversions({ csvText: csv("A-1,approved,1,2026-11-01,"), filename: "ek.csv", networkId: other!.id, currency: "INR" }, actor);
    expect((await all()).filter((r) => r.externalOrderId === "A-1")).toHaveLength(2);
  });

  it("skips bad lines with line numbers, imports the good ones, and handles quoted fields and a repeated order id", async () => {
    const summary = await run(csv('B-1,approved,"1,299.50",2026-11-05,', "B-2,approved,abc,2026-11-05,", "B-3,mystery,5,2026-11-05,", "B-1,paid,\"1,299.50\",2026-11-05,"));
    expect(summary).toMatchObject({ rowsInFile: 4, inserted: 1, failed: 2, duplicatesInFile: 1 });
    expect(summary.errors).toEqual([expect.stringMatching(/^Line 3:/), expect.stringMatching(/^Line 4:/)]);
    expect((await all()).find((r) => r.externalOrderId === "B-1")).toMatchObject({ status: "paid", commissionMinor: 129950 });
  });

  it("refuses an unknown network and a file without the required columns", async () => {
    await expect(conversions.importConversions({ csvText: csv("Z,approved,1,2026-11-01,"), filename: "x.csv", networkId: "99999999-9999-4999-8999-999999999999", currency: "INR" }, actor)).rejects.toMatchObject({ fields: { networkId: expect.any(String) } });
    await expect(run("name,total\nx,1")).rejects.toMatchObject({ fields: { file: expect.stringContaining("Missing") } });
  });

  it("imports a few thousand rows in chunks", async () => {
    const lines = Array.from({ length: 1200 }, (_, i) => `BULK-${i},approved,1,2026-11-06,`);
    const summary = await run(csv(...lines), "bulk.csv");
    expect(summary).toMatchObject({ rowsInFile: 1200, inserted: 1200 });
    expect((await run(csv(...lines), "bulk.csv"))).toMatchObject({ inserted: 0, updated: 0, unchanged: 1200 });
  }, 60_000);
});

describe("manual conversions (real SQL)", () => {
  const input = (over = {}) => ({ networkId, externalOrderId: "M-1", linkSlug: "link-a" as string | null, commissionMinor: 5000, currency: "INR" as const, status: "pending" as const, convertedAt: ist("2026-11-07T12:00:00"), ...over });

  it("creates, refuses a duplicate order for the network, edits and deletes, with audit rows", async () => {
    const created = await conversions.createConversion(input(), actor);
    await expect(conversions.createConversion(input(), actor)).rejects.toMatchObject({ fields: { externalOrderId: expect.stringContaining("already recorded") } });
    await expect(conversions.createConversion(input({ externalOrderId: "M-2", linkSlug: "no-such-link" }), actor)).rejects.toMatchObject({ fields: { linkSlug: expect.any(String) } });

    await conversions.updateConversion(created.id, input({ status: "approved", commissionMinor: 5500 }), actor);
    expect(await conversions.getConversion(created.id)).toMatchObject({ status: "approved", commissionMinor: 5500, linkSlug: "link-a" });
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id))).find((r) => r.action === "affiliate_conversion.updated");
    expect(log?.metadata).toMatchObject({ status: { from: "pending", to: "approved" } });

    await conversions.deleteConversion(created.id, actor);
    await expect(conversions.getConversion(created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("lists newest first with search and status filters", async () => {
    const list = await conversions.listConversions({ limit: 5, offset: 0 });
    expect(list.rows.length).toBe(5);
    expect(list.hasNext).toBe(true);
    const dates = list.rows.map((r) => r.convertedAt.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect((await conversions.listConversions({ q: "A-4", limit: 5, offset: 0 })).rows.map((r) => r.externalOrderId)).toEqual(["A-4"]);
    expect((await conversions.listConversions({ status: "paid", q: "A-", limit: 5, offset: 0 })).rows.every((r) => r.status === "paid")).toBe(true);
  });
});
