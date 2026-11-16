import { describe, expect, it, vi } from "vitest";
import { handleGo, type ClickRecord, type GoDeps, type GoLink, type GoRequest } from "@/modules/affiliate/go";

const BROWSER = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const link = (over: Partial<GoLink> = {}): GoLink => ({
  id: "link-1",
  slug: "amazon-sony-xm5",
  destinationUrl: "https://www.amazon.in/dp/B0123",
  trackingParams: "tag=khushio-21&ascsubtag={subid}",
  isActive: true,
  merchantActive: true,
  allowedDomains: ["amazon.in"],
  ...over,
});

const request = (over: Partial<GoRequest> = {}): GoRequest => ({ slug: "amazon-sony-xm5", method: "GET", userAgent: BROWSER, referer: "https://www.google.com/search?q=x", country: "in", ...over });

function setup(found: GoLink | null = link()) {
  const clicks: ClickRecord[] = [];
  const warn = vi.fn();
  const findLink = vi.fn(async () => found);
  const recordClick = vi.fn(async (c: ClickRecord) => void clicks.push(c));
  const scheduled: (() => Promise<void>)[] = [];
  const deps: GoDeps = { findLink, recordClick, warn, schedule: (work) => void scheduled.push(work) };
  const flush = async () => { for (const work of scheduled.splice(0)) await work(); };
  return { deps, clicks, warn, findLink, recordClick, scheduled, flush };
}

describe("/go decision (Release 4A)", () => {
  it("redirects with 302, tracking parameters and the sub-ID, and records the click AFTER the response", async () => {
    const s = setup();
    const out = await handleGo(request(), s.deps);
    expect(out.status).toBe(302);
    const url = new URL((out as { location: string }).location);
    expect(url.host).toBe("www.amazon.in");
    expect(url.searchParams.get("tag")).toBe("khushio-21");
    expect(url.searchParams.get("ascsubtag")).toBe("amazon-sony-xm5");

    // Fire-and-forget: nothing is written until the scheduled work runs.
    expect(s.recordClick).not.toHaveBeenCalled();
    expect(s.scheduled).toHaveLength(1);
    await s.flush();
    expect(s.clicks).toEqual([expect.objectContaining({ linkId: "link-1", subId: "amazon-sony-xm5", referrerHost: "www.google.com", country: "IN", isBot: false })]);
    expect(s.clicks[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does one read and one insert", async () => {
    const s = setup();
    await handleGo(request(), s.deps);
    await s.flush();
    expect(s.findLink).toHaveBeenCalledTimes(1);
    expect(s.recordClick).toHaveBeenCalledTimes(1);
  });

  it("answers an unknown slug with 404 and records nothing", async () => {
    const s = setup(null);
    expect(await handleGo(request({ slug: "nope" }), s.deps)).toEqual({ status: 404 });
    expect(s.scheduled).toHaveLength(0);
  });

  it.each([
    ["an empty slug", ""],
    ["upper case", "Amazon"],
    ["a path", "../admin"],
    ["a space", "a b"],
    ["a very long slug", "a".repeat(200)],
    ["an encoded slash", "a%2Fb"],
  ])("answers %s with 404 WITHOUT reading the database", async (_label, slug) => {
    const s = setup();
    expect(await handleGo(request({ slug }), s.deps)).toEqual({ status: 404 });
    expect(s.findLink).not.toHaveBeenCalled();
  });

  it("answers an inactive link, and a link of an archived merchant, with 404", async () => {
    for (const over of [{ isActive: false }, { merchantActive: false }]) {
      const s = setup(link(over));
      expect(await handleGo(request(), s.deps)).toEqual({ status: 404 });
      expect(s.scheduled).toHaveLength(0);
    }
  });

  it("refuses a destination outside the allow-list, logs it (slug and reason only) and records no click", async () => {
    const s = setup(link({ destinationUrl: "https://amazon.in.evil.com/dp/1" }));
    expect(await handleGo(request(), s.deps)).toEqual({ status: 404 });
    expect(s.warn).toHaveBeenCalledWith("go: destination refused", { slug: "amazon-sony-xm5", reason: "not_allowed" });
    expect(s.scheduled).toHaveLength(0);
  });

  it("refuses when the merchant lost its domains, and for non-https or IP destinations stored by hand", async () => {
    for (const over of [{ allowedDomains: [] }, { destinationUrl: "http://amazon.in/" }, { destinationUrl: "https://127.0.0.1/" }, { destinationUrl: "javascript:alert(1)" }]) {
      const s = setup(link(over));
      expect(await handleGo(request(), s.deps)).toEqual({ status: 404 });
      expect(s.warn).toHaveBeenCalledTimes(1);
    }
  });

  it("never lets the visitor's request choose the destination (the handler has no query input)", async () => {
    const s = setup();
    const out = await handleGo({ ...request(), slug: "amazon-sony-xm5", referer: "https://evil.com/?url=https://evil.com" }, s.deps);
    expect(new URL((out as { location: string }).location).host).toBe("www.amazon.in");
  });

  it("stores bots with isBot = true and still redirects them", async () => {
    const s = setup();
    const out = await handleGo(request({ userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }), s.deps);
    expect(out.status).toBe(302);
    await s.flush();
    expect(s.clicks[0]?.isBot).toBe(true);
  });

  it("answers HEAD like GET but does not count it as a click", async () => {
    const s = setup();
    const out = await handleGo(request({ method: "HEAD" }), s.deps);
    expect(out.status).toBe(302);
    expect(s.scheduled).toHaveLength(0);
  });

  it("sends no sub-ID when the parameters do not use {subid}", async () => {
    const s = setup(link({ trackingParams: "tag=khushio-21" }));
    await handleGo(request(), s.deps);
    await s.flush();
    expect(s.clicks[0]?.subId).toBeNull();
  });

  it("a failing click insert never breaks the redirect; it is logged", async () => {
    const s = setup();
    s.recordClick.mockRejectedValueOnce(new Error("database is down"));
    const out = await handleGo(request(), s.deps);
    expect(out.status).toBe(302);
    await s.flush();
    expect(s.warn).toHaveBeenCalledWith("go: click not recorded", { slug: "amazon-sony-xm5", error: "database is down" });
  });

  it("lets a database failure on the read reach the route (which answers 503)", async () => {
    const s = setup();
    s.findLink.mockRejectedValueOnce(new Error("boom"));
    await expect(handleGo(request(), s.deps)).rejects.toThrow("boom");
  });
});
