import { describe, expect, it } from "vitest";
import { CACHE_TTL } from "@/core/config/cache";

describe("cache config", () => {
  it("keeps categories longer than products", () => {
    expect(CACHE_TTL.categories).toBeGreaterThan(CACHE_TTL.products);
  });
});
