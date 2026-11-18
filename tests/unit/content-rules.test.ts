import { describe, expect, it } from "vitest";
import { sanitizeDocument } from "@/modules/content/document";
import { resolvePublishing, statusChangeProblem } from "@/modules/content/rules";
import { isContentVisible } from "@/modules/content/visibility";
import { parseTagNames, articleInputSchema, pageInputSchema } from "@/modules/content/validation";

const now = new Date("2026-11-18T10:00:00Z");
const hour = 3_600_000;
const body = sanitizeDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Some words" }] }] });
const empty = sanitizeDocument(null);

describe("isContentVisible", () => {
  it("shows PUBLISHED always, SCHEDULED only once due, and nothing else", () => {
    expect(isContentVisible({ status: "PUBLISHED", publishAt: null }, now)).toBe(true);
    expect(isContentVisible({ status: "SCHEDULED", publishAt: new Date(now.getTime() - hour) }, now)).toBe(true);
    expect(isContentVisible({ status: "SCHEDULED", publishAt: new Date(now.getTime()) }, now)).toBe(true);
    expect(isContentVisible({ status: "SCHEDULED", publishAt: new Date(now.getTime() + 1) }, now)).toBe(false);
    expect(isContentVisible({ status: "SCHEDULED", publishAt: null }, now)).toBe(false);
    for (const status of ["DRAFT", "REVIEW", "ARCHIVED", "weird"]) expect(isContentVisible({ status, publishAt: new Date(now.getTime() - hour) }, now)).toBe(false);
  });
  it("accepts a cached (text) date", () => {
    expect(isContentVisible({ status: "SCHEDULED", publishAt: new Date(now.getTime() - hour).toISOString() }, now)).toBe(true);
    expect(isContentVisible({ status: "SCHEDULED", publishAt: "not a date" }, now)).toBe(false);
  });
});

describe("statusChangeProblem", () => {
  it("lets a publisher do anything", () => {
    for (const next of ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const) expect(statusChangeProblem("PUBLISHED", next, true)).toBeNull();
  });
  it("lets a writer move between DRAFT and REVIEW, and keep a status unchanged", () => {
    expect(statusChangeProblem(null, "DRAFT", false)).toBeNull();
    expect(statusChangeProblem("DRAFT", "REVIEW", false)).toBeNull();
    expect(statusChangeProblem("REVIEW", "DRAFT", false)).toBeNull();
    expect(statusChangeProblem("PUBLISHED", "PUBLISHED", false)).toBeNull();
  });
  it("stops a writer from publishing, scheduling, archiving, or pulling live content back", () => {
    for (const next of ["SCHEDULED", "PUBLISHED", "ARCHIVED"] as const) expect(statusChangeProblem("DRAFT", next, false)).toMatch(/cannot publish/);
    expect(statusChangeProblem(null, "PUBLISHED", false)).not.toBeNull();
    expect(statusChangeProblem("PUBLISHED", "DRAFT", false)).toMatch(/cannot change/);
    expect(statusChangeProblem("SCHEDULED", "REVIEW", false)).not.toBeNull();
    expect(statusChangeProblem("ARCHIVED", "DRAFT", false)).not.toBeNull();
  });
});

describe("resolvePublishing", () => {
  const base = { requestedAt: null, currentAt: null, content: body, now };
  it("leaves drafts alone, even with no text", () => {
    expect(resolvePublishing({ ...base, status: "DRAFT", content: empty })).toEqual({ publishAt: null, problems: [] });
    const t = new Date(now.getTime() + hour);
    expect(resolvePublishing({ ...base, status: "REVIEW", requestedAt: t }).publishAt).toEqual(t);
  });
  it("publishing needs something to show, and sets the time to now the first time", () => {
    expect(resolvePublishing({ ...base, status: "PUBLISHED", content: empty }).problems[0]).toMatch(/Write some text/);
    expect(resolvePublishing({ ...base, status: "PUBLISHED" })).toEqual({ publishAt: now, problems: [] });
  });
  it("keeps the first publish time on later saves, and allows a past date", () => {
    const first = new Date(now.getTime() - 5 * hour);
    expect(resolvePublishing({ ...base, status: "PUBLISHED", currentAt: first }).publishAt).toEqual(first);
    const back = new Date(now.getTime() - 24 * hour);
    expect(resolvePublishing({ ...base, status: "PUBLISHED", requestedAt: back, currentAt: first }).publishAt).toEqual(back);
  });
  it("refuses a future time on PUBLISHED (that is what SCHEDULED is for)", () => {
    const r = resolvePublishing({ ...base, status: "PUBLISHED", requestedAt: new Date(now.getTime() + hour) });
    expect(r.field).toBe("publishAt");
    expect(r.problems[0]).toMatch(/Use Scheduled/);
  });
  it("scheduling needs a time, and it must be in the future", () => {
    expect(resolvePublishing({ ...base, status: "SCHEDULED" }).problems[0]).toMatch(/Choose the date/);
    expect(resolvePublishing({ ...base, status: "SCHEDULED", requestedAt: new Date(now.getTime() - 1) }).problems[0]).toMatch(/in the past/);
    expect(resolvePublishing({ ...base, status: "SCHEDULED", requestedAt: new Date(now.getTime() + 1) }).problems).toEqual([]);
  });
});

describe("tags and form validation", () => {
  it("splits, trims, removes repeats (ignoring case) and limits", () => {
    expect(parseTagNames(" Tea,  home   office ; tea\nGifts ")).toEqual({ ok: true, value: ["Tea", "home office", "Gifts"] });
    expect(parseTagNames("")).toEqual({ ok: true, value: [] });
    expect(parseTagNames(undefined)).toEqual({ ok: true, value: [] });
    expect(parseTagNames(Array.from({ length: 16 }, (_, i) => `t${i}`).join(","))).toMatchObject({ ok: false });
    expect(parseTagNames("x".repeat(41))).toMatchObject({ ok: false });
    expect(parseTagNames("!!!")).toMatchObject({ ok: false });
  });
  const valid = { title: "Best teas", status: "DRAFT", content: JSON.stringify({ type: "doc", content: [{ type: "script" }] }) };
  it("parses an article, cleaning the editor text on the way in", () => {
    const r = articleInputSchema.safeParse({ ...valid, tags: "a, b", seoRobots: "noindex,follow", seoCanonical: "https://example.com/x" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toEqual({ type: "doc", content: [] });
      expect(r.data.tags).toEqual(["a", "b"]);
      expect(r.data.seoRobots).toBe("noindex,follow");
      expect(r.data.publishAt).toBeNull();
      expect(r.data.excerpt).toBeNull();
    }
  });
  it("rejects bad content, status, robots, cover ids, addresses and dates", () => {
    const bad = (over: Record<string, unknown>) => articleInputSchema.safeParse({ ...valid, ...over }).success;
    expect(bad({})).toBe(true);
    expect(bad({ content: "{not json" })).toBe(false);
    expect(bad({ content: undefined })).toBe(false);
    expect(bad({ content: "x".repeat(600_001) })).toBe(false);
    expect(bad({ status: "LIVE" })).toBe(false);
    expect(bad({ seoRobots: "index,nofollow" })).toBe(false);
    expect(bad({ coverPublicId: "https://evil.example/x.png" })).toBe(false);
    expect(bad({ coverPublicId: "khushio/products/abc" })).toBe(true);
    expect(bad({ seoCanonical: "javascript:alert(1)" })).toBe(false);
    expect(bad({ seoOgImage: "http://insecure.example/x.png" })).toBe(false);
    expect(bad({ publishAt: "next tuesday" })).toBe(false);
    expect(bad({ title: "   " })).toBe(false);
    expect(bad({ seoTitle: "x".repeat(71) })).toBe(false);
  });
  it("treats an empty editor field as an empty document", () => {
    const r = pageInputSchema.safeParse({ title: "About", status: "DRAFT", content: "" });
    expect(r.success && r.data.content).toEqual({ type: "doc", content: [] });
  });
});
