/**
 * Release 4A against a real Postgres: affiliate admin services, the /go route handler end to end (real SQL, real
 * route file), delete rules and link verification. Only the Next.js cache and after() are stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown, pending: [] as (() => Promise<void>)[], revalidated: [] as string[] }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => void holder.revalidated.push(t), unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (work: () => Promise<void>) => void holder.pending.push(work) }));

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET, HEAD } from "@/app/go/[slug]/route";
import { affiliateClicks, affiliateConversions, affiliateLinks, auditLogs, products, users } from "@/core/database/schema";
import * as affiliate from "@/modules/affiliate/service";
import { verifyLink, verifyStaleLinks } from "@/modules/affiliate/verify";
import * as merchants from "@/modules/merchants/service";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actor: string;
let amazonId: string;
let productId: string;

const BROWSER = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const linkInput = (over = {}) => ({ merchantId: amazonId, productSlug: "sony-xm5" as string | null, destinationUrl: "https://www.amazon.in/dp/B0123", trackingParams: "tag=khushio-21&ascsubtag={subid}" as string | null, slug: undefined as string | undefined, confirmSlugChange: false, isActive: true, ...over });
const merchantInput = (name: string, allowedDomains: string[]) => ({ name, slug: undefined, websiteUrl: null, allowedDomains, logoUrl: null, confirmSlugChange: false });

async function go(slug: string, init: { method?: "GET" | "HEAD"; headers?: Record<string, string>; query?: string } = {}) {
  const request = new NextRequest(`http://localhost/go/${slug}${init.query ?? ""}`, { method: init.method ?? "GET", headers: { "user-agent": BROWSER, ...init.headers } });
  const handler = init.method === "HEAD" ? HEAD : GET;
  const response = await handler(request, { params: Promise.resolve({ slug }) });
  for (const work of holder.pending.splice(0)) await work(); // what after() would run once the response is sent
  return response;
}

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  const [u] = await t.db.insert(users).values({ email: "owner@khushio.test", passwordHash: "x" }).returning({ id: users.id });
  actor = u!.id;
  amazonId = (await merchants.createMerchant(merchantInput("Amazon India", ["amazon.in", "amzn.to"]), actor)).id;
  const [p] = await t.db.insert(products).values({ slug: "sony-xm5", name: "Sony WH-1000XM5" }).returning({ id: products.id });
  productId = p!.id;
}, 60_000);
afterAll(async () => t.client.close());

describe("creating links (real SQL)", () => {
  it("validates the destination against the merchant's domains, generates a slug, audits and clears the caches", async () => {
    for (const bad of ["https://amazon.in.evil.com/x", "http://amazon.in/x", "https://evil.com/amazon.in"]) {
      await expect(affiliate.createLink(linkInput({ destinationUrl: bad }), actor)).rejects.toMatchObject({ fields: { destinationUrl: expect.any(String) } });
    }
    holder.revalidated.length = 0;
    const link = await affiliate.createLink(linkInput(), actor);
    expect(link.slug).toBe("amazon-india-sony-wh-1000xm5");
    expect(holder.revalidated).toEqual(expect.arrayContaining(["products", "dashboard"]));
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, link.id)))[0];
    expect(log).toMatchObject({ action: "affiliate_link.created", actorId: actor });
    expect(log?.metadata).toMatchObject({ host: "www.amazon.in", product: "sony-xm5" });

    const second = await affiliate.createLink(linkInput({ destinationUrl: "https://amzn.to/3abc" }), actor);
    expect(second.slug).toBe("amazon-india-sony-wh-1000xm5-2");
  });

  it("refuses an unknown product slug, an archived merchant and a duplicate hand-typed slug", async () => {
    await expect(affiliate.createLink(linkInput({ productSlug: "nope" }), actor)).rejects.toMatchObject({ fields: { productSlug: expect.any(String) } });
    const dormant = await merchants.createMerchant(merchantInput("Dormant Shop", ["dormant.example"]), actor);
    await merchants.archiveMerchant(dormant.id, actor);
    await expect(affiliate.createLink(linkInput({ merchantId: dormant.id, destinationUrl: "https://dormant.example/x" }), actor)).rejects.toMatchObject({ fields: { merchantId: expect.any(String) } });
    await affiliate.createLink(linkInput({ slug: "my-own-slug" }), actor);
    await expect(affiliate.createLink(linkInput({ slug: "my-own-slug" }), actor)).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
  });

  it("a merchant with no domains cannot get a link", async () => {
    const bare = await merchants.createMerchant(merchantInput("Bare Shop", []), actor);
    await expect(affiliate.createLink(linkInput({ merchantId: bare.id, destinationUrl: "https://bare.example/x" }), actor)).rejects.toMatchObject({ fields: { destinationUrl: expect.stringContaining("no allowed domains") } });
  });
});

describe("/go route (real SQL, real route file)", () => {
  it("redirects with 302 and parameters, records one click after the response, and ignores the request's query string", async () => {
    const [link] = await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.slug, "amazon-india-sony-wh-1000xm5"));
    const response = await go(link!.slug, { query: "?url=https://evil.com&tag=hijack", headers: { referer: "https://www.google.com/search?q=secret", "x-vercel-ip-country": "in" } });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("www.amazon.in");
    expect(location.searchParams.get("tag")).toBe("khushio-21");
    expect(location.searchParams.get("ascsubtag")).toBe(link!.slug);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const clicks = await t.db.select().from(affiliateClicks).where(eq(affiliateClicks.linkId, link!.id));
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ subId: link!.slug, referrerHost: "www.google.com", country: "IN", isBot: false });
  });

  it("HEAD answers the same but is not counted; a bot is stored with isBot", async () => {
    const [link] = await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.slug, "amazon-india-sony-wh-1000xm5"));
    const before = (await t.db.select().from(affiliateClicks).where(eq(affiliateClicks.linkId, link!.id))).length;
    expect((await go(link!.slug, { method: "HEAD" })).status).toBe(302);
    expect((await t.db.select().from(affiliateClicks).where(eq(affiliateClicks.linkId, link!.id))).length).toBe(before);
    expect((await go(link!.slug, { headers: { "user-agent": "Googlebot/2.1" } })).status).toBe(302);
    const rows = await t.db.select().from(affiliateClicks).where(eq(affiliateClicks.linkId, link!.id));
    expect(rows.filter((r) => r.isBot)).toHaveLength(1);
  });

  it("answers 404 for an unknown slug, a bad slug and an inactive link, without writing a click", async () => {
    const before = (await t.db.select().from(affiliateClicks)).length;
    expect((await go("does-not-exist")).status).toBe(404);
    expect((await go("..%2Fadmin")).status).toBe(404);
    const [link] = await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.slug, "my-own-slug"));
    await affiliate.updateLink(link!.id, linkInput({ slug: "my-own-slug", isActive: false }), actor);
    expect((await go("my-own-slug")).status).toBe(404);
    expect((await t.db.select().from(affiliateClicks)).length).toBe(before);
  });

  it("refuses at click time when the merchant's domains no longer allow the destination, and when the merchant is archived", async () => {
    const m = await merchants.createMerchant(merchantInput("Flipkart", ["flipkart.com"]), actor);
    const link = await affiliate.createLink(linkInput({ merchantId: m.id, productSlug: null, destinationUrl: "https://www.flipkart.com/p/1", trackingParams: null }), actor);
    expect((await go(link.slug)).status).toBe(302);

    await merchants.updateMerchant(m.id, merchantInput("Flipkart", ["flipkart.in"]), actor);
    expect((await go(link.slug)).status).toBe(404);
    expect((await affiliate.listLinks({ q: link.slug, status: "all", limit: 5, offset: 0 })).rows[0]?.problem).toContain("not one of this merchant");

    await merchants.updateMerchant(m.id, merchantInput("Flipkart", ["flipkart.com"]), actor);
    expect((await go(link.slug)).status).toBe(302);
    await merchants.archiveMerchant(m.id, actor);
    expect((await go(link.slug)).status).toBe(404);
  });

  it("refuses a link whose stored destination was tampered with directly in the database", async () => {
    await t.db.update(affiliateLinks).set({ destinationUrl: "https://amazon.in.evil.com/" }).where(eq(affiliateLinks.slug, "amazon-india-sony-wh-1000xm5-2"));
    expect((await go("amazon-india-sony-wh-1000xm5-2")).status).toBe(404);
    await t.db.update(affiliateLinks).set({ destinationUrl: "https://amzn.to/3abc" }).where(eq(affiliateLinks.slug, "amazon-india-sony-wh-1000xm5-2"));
  });
});

describe("editing and deleting links", () => {
  it("a new destination resets the verification stamp; a slug changes only when confirmed", async () => {
    const link = await affiliate.createLink(linkInput({ slug: "edit-me", destinationUrl: "https://www.amazon.in/dp/ONE" }), actor);
    await t.db.update(affiliateLinks).set({ lastVerifiedAt: new Date() }).where(eq(affiliateLinks.id, link.id));
    await affiliate.updateLink(link.id, linkInput({ slug: "edit-me", destinationUrl: "https://www.amazon.in/dp/TWO" }), actor);
    expect((await affiliate.getLink(link.id)).link.lastVerifiedAt).toBeNull();

    await expect(affiliate.updateLink(link.id, linkInput({ slug: "renamed" }), actor)).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
    await affiliate.updateLink(link.id, linkInput({ slug: "renamed", confirmSlugChange: true }), actor);
    const log = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, link.id))).find((r) => r.action === "affiliate_link.updated" && (r.metadata as { slug?: unknown })?.slug);
    expect(log?.metadata).toMatchObject({ slug: { from: "edit-me", to: "renamed" } });
  });

  it("deletes a link with no history, and refuses (409) once it has clicks or conversions", async () => {
    const fresh = await affiliate.createLink(linkInput({ slug: "no-history" }), actor);
    await affiliate.deleteLink(fresh.id, actor);
    expect(await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.id, fresh.id))).toHaveLength(0);

    const [clicked] = await t.db.select().from(affiliateLinks).where(eq(affiliateLinks.slug, "amazon-india-sony-wh-1000xm5"));
    await expect(affiliate.deleteLink(clicked!.id, actor)).rejects.toMatchObject({ status: 409 });

    const withSale = await affiliate.createLink(linkInput({ slug: "has-sale" }), actor);
    await t.db.insert(affiliateConversions).values({ linkId: withSale.id, externalOrderId: "o-1", convertedAt: new Date() });
    await expect(affiliate.deleteLink(withSale.id, actor)).rejects.toMatchObject({ status: 409 });
  });

  it("lists links of a product on the product's screen", async () => {
    const rows = await affiliate.listLinksForProduct(productId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.productSlug === "sony-xm5")).toBe(true);
  });
});

describe("networks and programmes", () => {
  it("networks: unique name and key, generated key, delete blocked while programmes use it", async () => {
    const n = await affiliate.createNetwork({ name: "Cuelinks", key: undefined, isActive: true }, actor);
    expect(n.key).toBe("cuelinks");
    await expect(affiliate.createNetwork({ name: "cuelinks", key: undefined, isActive: true }, actor)).rejects.toMatchObject({ fields: { name: expect.any(String) } });
    await expect(affiliate.createNetwork({ name: "Cue 2", key: "cuelinks", isActive: true }, actor)).rejects.toMatchObject({ fields: { key: expect.any(String) } });

    const program = await affiliate.createProgram({ merchantId: amazonId, networkId: n.id, externalProgramId: "42", commissionNote: null, isActive: true }, actor);
    await expect(affiliate.createProgram({ merchantId: amazonId, networkId: n.id, externalProgramId: null, commissionNote: null, isActive: true }, actor)).rejects.toMatchObject({ fields: { networkId: expect.stringContaining("already has a programme") } });
    await expect(affiliate.deleteNetwork(n.id, actor)).rejects.toMatchObject({ status: 409 });
    await expect(merchants.deleteMerchant(amazonId, actor)).rejects.toMatchObject({ status: 409 });

    await affiliate.updateProgram(program.id, { merchantId: amazonId, networkId: n.id, externalProgramId: "43", commissionNote: "4%", isActive: true }, actor);
    expect((await affiliate.getProgram(program.id)).externalProgramId).toBe("43");
    await affiliate.deleteProgram(program.id, actor);
    await affiliate.deleteNetwork(n.id, actor);
    expect((await affiliate.listNetworks({ status: "all", limit: 10, offset: 0 })).rows.some((r) => r.id === n.id)).toBe(false);
  });
});

describe("link verification (real SQL, fake network)", () => {
  it("a working answer sets last_verified_at; a blocked HEAD does not; both are audited", async () => {
    const link = await affiliate.createLink(linkInput({ slug: "verify-me" }), actor);
    const fixed = new Date("2026-11-15T10:00:00Z");
    expect((await verifyLink(link.id, actor, async () => ({ status: 403 }), fixed)).outcome).toBe("unclear");
    expect((await affiliate.getLink(link.id)).link.lastVerifiedAt).toBeNull();
    expect((await verifyLink(link.id, actor, async () => ({ status: 200 }), fixed)).outcome).toBe("ok");
    expect((await affiliate.getLink(link.id)).link.lastVerifiedAt?.toISOString()).toBe(fixed.toISOString());
    const logs = (await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, link.id))).filter((r) => r.action === "affiliate_link.verified");
    expect(logs.map((r) => (r.metadata as { outcome: string }).outcome)).toEqual(["unclear", "ok"]);
  });

  it("the batch checks the never-checked links first, at most ten, and never calls a disallowed destination", async () => {
    const calls: string[] = [];
    const summary = await verifyStaleLinks(actor, 50, async (url) => { calls.push(url); return { status: 200 }; });
    expect(summary.checked).toBeLessThanOrEqual(10);
    expect(calls.length).toBe(summary.ok);
    expect(calls.every((u) => u.startsWith("https://"))).toBe(true);
    expect(calls.some((u) => u.includes("evil.com"))).toBe(false);
  });
});
