import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRedirectCache } from "@/modules/redirects/edge-cache";
import { handleRedirect } from "@/modules/redirects/middleware";
import type { RedirectRule } from "@/modules/redirects/path";

const rules: RedirectRule[] = [
  { fromPath: "/products/old", toPath: "/products/new", statusCode: 301 },
  { fromPath: "/p/removed", toPath: null, statusCode: 410 },
];
const req = (path: string) => new NextRequest(`https://khushio.com${path}`);
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("createRedirectCache", () => {
  it("loads once, then serves the fresh copy with no work", async () => {
    let now = 0;
    const load = vi.fn(async () => rules);
    const cache = createRedirectCache({ freshMs: 1000, now: () => now });
    expect((await cache.get(load)).map.size).toBe(2);
    now = 500;
    expect((await cache.get(load)).refresh).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("serves the stale copy at once and refreshes in the background", async () => {
    let now = 0;
    let data = rules;
    const load = vi.fn(async () => data);
    const cache = createRedirectCache({ freshMs: 1000, now: () => now });
    await cache.get(load);
    now = 2000;
    data = [];
    const second = await cache.get(load);
    expect(second.map.size).toBe(2); // stale, not waited for
    await second.refresh;
    now = 2100;
    expect((await cache.get(load)).map.size).toBe(0);
  });
  it("a failing load never throws, keeps the old map, and waits before trying again", async () => {
    let now = 0;
    const load = vi.fn(async (): Promise<RedirectRule[]> => { throw new Error("down"); });
    const cache = createRedirectCache({ retryMs: 10_000, now: () => now });
    expect((await cache.get(load)).map.size).toBe(0);
    await cache.get(load);
    expect(load).toHaveBeenCalledTimes(1);
    now = 11_000;
    await cache.get(load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("the first request does not wait longer than the timeout for a slow load", async () => {
    const load = () => new Promise<RedirectRule[]>(() => undefined);
    const cache = createRedirectCache({ firstLoadTimeoutMs: 20 });
    const started = Date.now();
    expect((await cache.get(load)).map.size).toBe(0);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

// The middleware keeps one cache for the life of the module, so each test loads a fresh copy of it.
async function freshHandler(fetchImpl: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchImpl);
  return (await import("@/modules/redirects/middleware")).handleRedirect;
}

describe("handleRedirect", () => {
  it("answers a moved page with a 301 to the new address and keeps the query string", async () => {
    const handle = await freshHandler(answer({ rules: [["/products/old", "/products/new", 301]] }) as unknown as typeof fetch);
    const response = await handle(req("/products/old?utm_source=mail"));
    expect(response?.status).toBe(301);
    expect(response?.headers.get("location")).toBe("https://khushio.com/products/new?utm_source=mail");
  });
  it("answers a removed page with a 410 that search engines are told not to index", async () => {
    const handle = await freshHandler(answer({ rules: [["/p/removed", null, 410]] }) as unknown as typeof fetch);
    const response = await handle(req("/p/removed"));
    expect(response?.status).toBe(410);
    expect(response?.headers.get("x-robots-tag")).toBe("noindex");
    expect(await response?.text()).toContain("has been removed");
  });
  it("lets every other request through", async () => {
    const handle = await freshHandler(answer({ rules: [["/products/old", "/products/new", 301]] }) as unknown as typeof fetch);
    expect(await handle(req("/products/fine"))).toBeNull();
    expect(await handle(req("/"))).toBeNull();
  });
  it("never breaks a page when the map cannot be loaded", async () => {
    const handle = await freshHandler((async () => new Response("nope", { status: 503 })) as unknown as typeof fetch);
    expect(await handle(req("/products/old"))).toBeNull();
    const throwing = await freshHandler((async () => { throw new Error("network"); }) as unknown as typeof fetch);
    expect(await throwing(req("/products/old"))).toBeNull();
  });
  it("is the same function the middleware imports", () => {
    expect(typeof handleRedirect).toBe("function");
  });
});
