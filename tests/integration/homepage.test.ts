/**
 * Release 6B against a real Postgres: the homepage builder (per-type validation, reorder, switch on and off, go-live time by
 * the clock, preview versus visitors, a broken row skipped, the starter layout, the 20-section limit, cache refresh on every
 * write, hero pictures counted as media uses) and the navigation editor. Only the Next.js cache is stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown, tags: [] as string[], paths: [] as string[] }));
vi.mock("@/core/database/client", () => ({ db: () => holder.db }));
vi.mock("next/cache", () => ({
  revalidateTag: (t: string) => void holder.tags.push(t),
  revalidatePath: (p: string) => void holder.paths.push(p),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

import { eq } from "drizzle-orm";
import { auditLogs, homepageSections, products, productVariants, users } from "@/core/database/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { MAX_SECTIONS } from "@/modules/homepage/config";
import * as service from "@/modules/homepage/service";
import { sectionInputSchema, type SectionInput } from "@/modules/homepage/validation";
import { countImageUses } from "@/modules/media/repository";
import * as nav from "@/modules/navigation/service";
import { NAV_LIMITS } from "@/modules/navigation/types";
import { navItemInputSchema } from "@/modules/navigation/validation";
import { createTestDatabase } from "./helpers";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
let t: TestDb;
let actorId: string;

const HOUR = 3_600_000;
const input = (over: Record<string, unknown> = {}): SectionInput => sectionInputSchema.parse({ type: "promo_banner", isEnabled: "on", ...over });
const promo = (text: string) => ({ text, ctaLabel: null, ctaHref: null, tone: "forest" });
const order = async () => (await service.listSections()).map((s) => s.heading ?? s.type);
const clearSections = async () => void (await t.db.delete(homepageSections));

beforeAll(async () => {
  t = await createTestDatabase();
  holder.db = t.db;
  actorId = (await t.db.insert(users).values({ email: "editor@khushio.test", passwordHash: "x" }).returning({ id: users.id }))[0]!.id;
}, 60_000);
afterAll(async () => t.client.close());
beforeEach(async () => {
  holder.tags.length = 0;
  holder.paths.length = 0;
  await clearSections();
});

describe("homepage sections: validation per type", () => {
  it("stores the checked config only and writes an audit row", async () => {
    const id = await service.createSection(input({ heading: "Sale" }), { ...promo("Big sale"), html: "<script>alert(1)</script>" }, actorId);
    const [row] = await t.db.select().from(homepageSections).where(eq(homepageSections.id, id));
    expect(row?.config).toEqual(promo("Big sale"));
    expect(JSON.stringify(row?.config)).not.toContain("script");
    expect((await t.db.select().from(auditLogs).where(eq(auditLogs.entityId, id)))[0]?.action).toBe("homepage_section.created");
  });

  it("refuses an invalid config with messages keyed by the form's field names, and stores nothing", async () => {
    await expect(service.createSection(input({ type: "promo_banner" }), { text: "Hi", ctaLabel: "Go", ctaHref: "javascript:alert(1)", tone: "forest" }, actorId)).rejects.toMatchObject({ fields: { c_ctaHref: expect.any(String) } });
    await expect(service.createSection(input({ type: "collections" }), { collectionIds: [] }, actorId)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.createSection(input({ type: "trending_products" }), { mode: "random" }, actorId)).rejects.toBeInstanceOf(ValidationError);
    expect(await service.listSections()).toHaveLength(0);
  });

  it("a section's type never changes on update (the stored type decides which settings are read)", async () => {
    const id = await service.createSection(input({ type: "deals" }), { limit: 4 }, actorId);
    await service.updateSection(id, input({ type: "promo_banner", heading: "Offers" }), { limit: 5 }, actorId);
    const row = await service.getSection(id);
    expect(row).toMatchObject({ type: "deals", heading: "Offers", config: { limit: 5 } });
  });

  it("refuses more than MAX_SECTIONS sections", async () => {
    for (let i = 0; i < MAX_SECTIONS; i++) await service.createSection(input({ heading: `s${i}` }), promo("x"), actorId);
    await expect(service.createSection(input(), promo("one too many"), actorId)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("homepage sections: order", () => {
  it("new sections go to the bottom, and a move persists with contiguous sort orders", async () => {
    for (const h of ["A", "B", "C"]) await service.createSection(input({ heading: h }), promo(h), actorId);
    expect(await order()).toEqual(["A", "B", "C"]);
    const [, , c] = await service.listSections();
    await service.moveSection(c!.id, "up", actorId);
    expect(await order()).toEqual(["A", "C", "B"]);
    expect((await service.listSections()).map((s) => s.sortOrder)).toEqual([0, 1, 2]);
    const [a] = await service.listSections();
    await service.moveSection(a!.id, "down", actorId);
    expect(await order()).toEqual(["C", "A", "B"]);
  });

  it("moving the first section up or the last one down changes nothing", async () => {
    for (const h of ["A", "B"]) await service.createSection(input({ heading: h }), promo(h), actorId);
    const [a, b] = await service.listSections();
    await service.moveSection(a!.id, "up", actorId);
    await service.moveSection(b!.id, "down", actorId);
    expect(await order()).toEqual(["A", "B"]);
    await expect(service.moveSection("44444444-4444-4444-8444-444444444444", "up", actorId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleting a section keeps the others in order", async () => {
    for (const h of ["A", "B", "C"]) await service.createSection(input({ heading: h }), promo(h), actorId);
    const [, b] = await service.listSections();
    await service.deleteSection(b!.id, actorId);
    expect(await order()).toEqual(["A", "C"]);
  });
});

describe("homepage: visitors versus the preview", () => {
  it("visitors see live sections only: switched off and not-yet-live ones are hidden, and go live by the clock with no job", async () => {
    const now = Date.now();
    await service.createSection(input({ heading: "live" }), promo("live"), actorId);
    await service.createSection(input({ heading: "off", isEnabled: undefined }), promo("off"), actorId);
    await service.createSection(input({ heading: "later", publishAt: new Date(now + 2 * HOUR).toISOString().slice(0, 16) }), promo("later"), actorId);
    // publishAt strings are India time: build the Date directly for a precise future moment.
    const later = (await service.listSections()).find((s) => s.heading === "later")!;
    await t.db.update(homepageSections).set({ publishAt: new Date(now + 2 * HOUR) }).where(eq(homepageSections.id, later.id));

    expect((await service.getHomepage(new Date(now))).map((s) => s.heading)).toEqual(["live"]);
    expect((await service.getHomepage(new Date(now + 3 * HOUR))).map((s) => s.heading)).toEqual(["live", "later"]);
  });

  it("the preview lists every section with its state, so editors can see what is hidden", async () => {
    const now = Date.now();
    await service.createSection(input({ heading: "live" }), promo("live"), actorId);
    await service.createSection(input({ heading: "off", isEnabled: undefined }), promo("off"), actorId);
    const id = await service.createSection(input({ heading: "later" }), promo("later"), actorId);
    await t.db.update(homepageSections).set({ publishAt: new Date(now + 2 * HOUR) }).where(eq(homepageSections.id, id));
    const preview = await service.getHomepagePreview(new Date(now));
    expect(preview.map((p) => [p.heading, p.state])).toEqual([["live", "live"], ["off", "off"], ["later", "scheduled"]]);
    expect(preview.every((p) => p.section !== null)).toBe(true);
  });

  it("a section with nothing to show (no offers, no products) is left out for visitors and explained in the preview", async () => {
    await service.createSection(input({ type: "deals", heading: "Deals" }), { limit: 6 }, actorId);
    await service.createSection(input({ type: "trending_products", heading: "Trending" }), { mode: "featured", limit: 8 }, actorId);
    expect(await service.getHomepage()).toEqual([]);
    const preview = await service.getHomepagePreview();
    expect(preview.map((p) => p.problem)).toEqual([expect.stringContaining("Nothing to show"), expect.stringContaining("Nothing to show")]);
  });

  it("a row with a broken config (edited by hand) is skipped for visitors and flagged in the preview; the rest of the page still loads", async () => {
    await service.createSection(input({ heading: "fine" }), promo("fine"), actorId);
    await t.db.insert(homepageSections).values({ type: "promo_banner", heading: "broken", config: { text: "", ctaHref: "javascript:alert(1)", ctaLabel: "x" }, sortOrder: 5 });
    expect((await service.getHomepage()).map((s) => s.heading)).toEqual(["fine"]);
    const bad = (await service.getHomepagePreview()).find((p) => p.heading === "broken");
    expect(bad).toMatchObject({ section: null, problem: expect.stringContaining("not valid") });
  });

  it("a row with a type this code does not know is ignored everywhere", async () => {
    await t.db.insert(homepageSections).values({ type: "custom_html", heading: "evil", config: { html: "<script>x</script>" } });
    expect(await service.listSections()).toHaveLength(0);
    expect(await service.getHomepage()).toEqual([]);
  });

  it("loads real data for a trending section: only products a visitor may see", async () => {
    const mk = async (slug: string, status: "PUBLISHED" | "DRAFT" | "ARCHIVED", price?: number) => {
      const [p] = await t.db.insert(products).values({ slug, name: slug, status }).returning({ id: products.id });
      if (price) await t.db.insert(productVariants).values({ productId: p!.id, label: "Standard", priceMinor: price });
    };
    await mk("home-live-a", "PUBLISHED", 100_00);
    await mk("home-live-b", "PUBLISHED");
    await mk("home-draft", "DRAFT");
    await mk("home-archived", "ARCHIVED");
    await service.createSection(input({ type: "trending_products", heading: "Trending" }), { mode: "newest", limit: 12 }, actorId);
    const [section] = await service.getHomepage();
    expect(section?.type).toBe("trending_products");
    const names = section?.type === "trending_products" ? section.cards.map((c) => c.slug).sort() : [];
    expect(names).toEqual(["home-live-a", "home-live-b"]);
  });
});

describe("homepage: every change refreshes the cached page", () => {
  it("create, update, switch, move and delete each clear the homepage tag and the home page", async () => {
    const id = await service.createSection(input({ heading: "One" }), promo("one"), actorId);
    await service.createSection(input({ heading: "Two" }), promo("two"), actorId);
    const steps: [string, () => Promise<unknown>][] = [
      ["update", () => service.updateSection(id, input({ heading: "One!" }), promo("one"), actorId)],
      ["switch off", () => service.setEnabled(id, false, actorId)],
      ["move", () => service.moveSection(id, "down", actorId)],
      ["delete", () => service.deleteSection(id, actorId)],
      ["refresh button", () => service.refreshHomepage(actorId)],
    ];
    for (const [name, run] of steps) {
      holder.tags.length = 0;
      holder.paths.length = 0;
      await run();
      expect(holder.tags, name).toContain("homepage");
      expect(holder.paths, name).toContain("/");
    }
  });

  it("saving without a change writes nothing and refreshes nothing", async () => {
    const id = await service.createSection(input({ heading: "Same" }), promo("same"), actorId);
    holder.tags.length = 0;
    await service.updateSection(id, input({ heading: "Same" }), promo("same"), actorId);
    await service.setEnabled(id, true, actorId);
    expect(holder.tags).toEqual([]);
  });
});

describe("homepage: starter layout", () => {
  it("creates banner, categories, trending, deals and guides on an empty homepage, once", async () => {
    expect(await service.createStarterLayout(actorId)).toBe(5);
    expect((await service.listSections()).map((s) => s.type)).toEqual(["hero_banner", "featured_categories", "trending_products", "deals", "guides"]);
    await expect(service.createStarterLayout(actorId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("the brand-banner hero is always shown, even on a site with no data", async () => {
    await t.db.delete(productVariants);
    await t.db.delete(products);
    await service.createStarterLayout(actorId);
    const live = await service.getHomepage();
    expect(live.map((s) => s.type)).toEqual(["hero_banner"]);
  });
});

describe("homepage: hero pictures count as media uses", () => {
  it("a picture used by a hero banner counts as used, so the media library refuses to delete it", async () => {
    await service.createSection(input({ type: "hero_banner" }), { imagePublicId: "khushio/banners/diwali", imageAlt: "Diwali", headline: null, subheadline: null, ctaLabel: null, ctaHref: null }, actorId);
    expect(await countImageUses("khushio/banners/diwali")).toBe(1);
    expect(await countImageUses("khushio/banners/other")).toBe(0);
  });
});

describe("navigation editor", () => {
  const item = (over: Record<string, unknown> = {}) => navItemInputSchema.parse({ area: "header", label: "Deals", href: "/deals", isActive: "on", ...over });

  it("an empty header uses the built-in menu; an empty footer has no extra links", async () => {
    const header = await nav.getNavigation("header");
    expect(header.map((l) => l.href)).toEqual(expect.arrayContaining(["/discover", "/deals", "/articles", "/guides"]));
    expect(await nav.getNavigation("footer")).toEqual([]);
  });

  it("shows the active links of an area in the chosen order, and hides the switched-off ones", async () => {
    const a = await nav.createItem(item({ label: "Offers", href: "/deals" }), actorId);
    await nav.createItem(item({ label: "Guides", href: "/guides" }), actorId);
    const c = await nav.createItem(item({ label: "Hidden", href: "/hidden", isActive: undefined }), actorId);
    await nav.createItem(item({ area: "footer", label: "About", href: "/p/about" }), actorId);
    expect((await nav.getNavigation("header")).map((l) => l.label)).toEqual(["Offers", "Guides"]);
    await nav.moveItem(a, "down", actorId);
    expect((await nav.getNavigation("header")).map((l) => l.label)).toEqual(["Guides", "Offers"]);
    await nav.setActive(c, true, actorId);
    expect((await nav.getNavigation("header")).map((l) => l.label)).toEqual(["Guides", "Offers", "Hidden"]);
    expect((await nav.getNavigation("footer")).map((l) => l.label)).toEqual(["About"]);
  });

  it("moves within one area only, and every write clears the navigation tag", async () => {
    const all = await nav.listItems();
    const header = all.filter((i) => i.area === "header");
    holder.tags.length = 0;
    await nav.moveItem(header[0]!.id, "down", actorId);
    expect(holder.tags).toContain("navigation");
    expect((await nav.listItems()).filter((i) => i.area === "footer").map((i) => i.label)).toEqual(["About"]);
    await nav.updateItem(header[0]!.id, item({ label: "Renamed", href: "/renamed" }), actorId);
    expect((await nav.getItem(header[0]!.id)).label).toBe("Renamed");
    await nav.deleteItem(header[0]!.id, actorId);
    await expect(nav.getItem(header[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses more links than the area holds", async () => {
    const before = (await nav.listItems()).filter((i) => i.area === "footer").length;
    for (let i = before; i < NAV_LIMITS.footer; i++) await nav.createItem(item({ area: "footer", label: `F${i}`, href: `/f${i}` }), actorId);
    await expect(nav.createItem(item({ area: "footer", label: "Too many", href: "/x" }), actorId)).rejects.toBeInstanceOf(ConflictError);
  });
});
