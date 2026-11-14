import { describe, expect, it } from "vitest";
import { creationStatusProblem, deleteProblem, publishBlockers, statusChangeProblem } from "@/modules/products/rules";
import { isProductVisible } from "@/core/catalog/visibility";

describe("status permissions", () => {
  it("lets a publisher do anything", () => {
    expect(statusChangeProblem("DRAFT", "PUBLISHED", true)).toBeNull();
    expect(statusChangeProblem("PUBLISHED", "ARCHIVED", true)).toBeNull();
  });
  it("lets a writer move between draft and review only", () => {
    expect(statusChangeProblem("DRAFT", "REVIEW", false)).toBeNull();
    expect(statusChangeProblem("REVIEW", "DRAFT", false)).toBeNull();
    expect(statusChangeProblem("DRAFT", "PUBLISHED", false)).toMatch(/cannot publish/);
    expect(statusChangeProblem("DRAFT", "SCHEDULED", false)).toMatch(/cannot publish/);
    expect(statusChangeProblem("PUBLISHED", "DRAFT", false)).toMatch(/cannot change/);
    expect(statusChangeProblem("ARCHIVED", "DRAFT", false)).toMatch(/cannot change/);
  });
  it("allows edits that keep a published status", () => {
    expect(statusChangeProblem("PUBLISHED", "PUBLISHED", false)).toBeNull();
  });
  it("starts new products as draft or review", () => {
    expect(creationStatusProblem("DRAFT")).toBeNull();
    expect(creationStatusProblem("REVIEW")).toBeNull();
    expect(creationStatusProblem("PUBLISHED")).toMatch(/draft first/);
  });
});

describe("publishing and deleting", () => {
  it("requires a main category and an image to publish or schedule", () => {
    expect(publishBlockers({ status: "PUBLISHED", primaryCategoryActive: false, imageCount: 0 })).toHaveLength(2);
    expect(publishBlockers({ status: "SCHEDULED", primaryCategoryActive: true, imageCount: 0 })).toHaveLength(1);
    expect(publishBlockers({ status: "PUBLISHED", primaryCategoryActive: true, imageCount: 1 })).toEqual([]);
    expect(publishBlockers({ status: "DRAFT", primaryCategoryActive: false, imageCount: 0 })).toEqual([]);
  });
  it("protects live products and products with affiliate links from deletion", () => {
    expect(deleteProblem({ status: "PUBLISHED", affiliateLinks: 0 })).toMatch(/Archive/);
    expect(deleteProblem({ status: "DRAFT", affiliateLinks: 2 })).toMatch(/2 affiliate links/);
    expect(deleteProblem({ status: "DRAFT", affiliateLinks: 0 })).toBeNull();
  });
});

describe("public visibility", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  it("shows published products and scheduled products whose time has passed", () => {
    expect(isProductVisible({ status: "PUBLISHED", publishAt: null }, now)).toBe(true);
    expect(isProductVisible({ status: "SCHEDULED", publishAt: new Date("2026-11-14T09:59:00Z") }, now)).toBe(true);
    expect(isProductVisible({ status: "SCHEDULED", publishAt: new Date("2026-11-14T10:01:00Z") }, now)).toBe(false);
  });
  it("never shows drafts, reviews, archived, discontinued or scheduled-without-a-time", () => {
    for (const status of ["DRAFT", "REVIEW", "ARCHIVED", "DISCONTINUED"]) expect(isProductVisible({ status, publishAt: null }, now)).toBe(false);
    expect(isProductVisible({ status: "SCHEDULED", publishAt: null }, now)).toBe(false);
  });
});
