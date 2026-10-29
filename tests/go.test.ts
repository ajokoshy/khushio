import { beforeEach, describe, expect, it, vi } from "vitest";
const resolve = vi.fn(); const insert = vi.fn();
vi.mock("../lib/data/catalog", () => ({ resolveOffer: (id: string) => resolve(id) }));
vi.mock("../lib/db", () => ({ db: { insert: () => ({ values: insert }) }, schema: { clicks: {} } }));
import { GET } from "../app/go/[id]/route";
const ID = "11111111-1111-1111-1111-111111111111";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const go = (headers: Record<string, string> = { "user-agent": BROWSER }, id = ID) => GET(new Request(`https://khushio.com/go/${id}`, { headers }), { params: Promise.resolve({ id }) });
const offer = (o: object = {}) => ({ id: ID, merchant: "Shop", merchantId: "m1", url: "https://shop.example/p/1", approvedDomains: [], ...o });
beforeEach(() => { resolve.mockReset(); insert.mockReset(); insert.mockResolvedValue(undefined); });

describe("/go/[id] with a database", () => {
  it("redirects to the stored destination with no-store and noindex", async () => {
    resolve.mockResolvedValue(offer()); const r = await go();
    expect(r.status).toBe(302); expect(r.headers.get("location")).toBe("https://shop.example/p/1");
    expect(r.headers.get("cache-control")).toContain("no-store"); expect(r.headers.get("x-robots-tag")).toContain("noindex");
  });
  it("ignores any destination supplied in the request", async () => {
    resolve.mockResolvedValue(offer()); const r = await GET(new Request(`https://khushio.com/go/${ID}?url=https://evil.example&to=//evil.example`, { headers: { "user-agent": BROWSER } }), { params: Promise.resolve({ id: ID }) });
    expect(r.headers.get("location")).toBe("https://shop.example/p/1");
  });
  it("returns 404 for an unknown, inactive or expired offer", async () => { resolve.mockResolvedValue(undefined); const r = await go(); expect(r.status).toBe(404); expect(r.headers.get("location")).toBeNull(); });
  it.each([["a non-https destination", { url: "http://shop.example/p" }], ["a host outside the approved domains", { approvedDomains: ["other.example"] }], ["a destination with credentials", { url: "https://u:p@shop.example/" }], ["a javascript: destination", { url: "javascript:alert(1)" }]])("refuses %s", async (_n, o) => {
    resolve.mockResolvedValue(offer(o)); const r = await go(); expect(r.status).toBe(404); expect(r.headers.get("location")).toBeNull(); expect(insert).not.toHaveBeenCalled();
  });
  it("records a click for a normal visitor, with a privacy-safe referrer", async () => {
    resolve.mockResolvedValue(offer()); await go({ "user-agent": BROWSER, referer: "https://khushio.com/products/x?utm_source=a&email=me@x.com" });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledWith({ offerId: ID, merchantId: "m1", referrer: "/products/x" }));
  });
  it("does not record clicks from bots or link previewers, but still redirects", async () => {
    resolve.mockResolvedValue(offer()); for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.0"]) expect((await go({ "user-agent": ua })).status).toBe(302);
    await new Promise((r) => setTimeout(r, 20)); expect(insert).not.toHaveBeenCalled();
  });
  it("still redirects when click logging fails", async () => { resolve.mockResolvedValue(offer()); insert.mockRejectedValue(new Error("db down")); const r = await go(); expect(r.status).toBe(302); });
  it("answers 503 (not a redirect) when the database cannot be reached", async () => { resolve.mockRejectedValue(new Error("db down")); const r = await go(); expect(r.status).toBe(503); expect(r.headers.get("location")).toBeNull(); });
});
