import { describe, expect, it } from "vitest";
import { linkInputSchema, networkInputSchema, programInputSchema } from "@/modules/affiliate/validation";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("affiliate link form (Release 4A)", () => {
  const base = { merchantId: UUID, destinationUrl: " https://www.amazon.in/dp/B0123 ", productSlug: "", trackingParams: "", slug: "", isActive: "on" };

  it("trims, turns empty text into null and a ticked box into true", () => {
    const parsed = linkInputSchema.parse(base);
    expect(parsed).toMatchObject({ destinationUrl: "https://www.amazon.in/dp/B0123", productSlug: null, trackingParams: null, slug: undefined, isActive: true, confirmSlugChange: false });
  });

  it("leaves the box unticked as false", () => {
    expect(linkInputSchema.parse({ ...base, isActive: undefined }).isActive).toBe(false);
  });

  it("normalises tracking parameters and rejects bad ones with a message for the field", () => {
    expect(linkInputSchema.parse({ ...base, trackingParams: "?tag=khushio-21\nascsubtag={subid}" }).trackingParams).toBe("tag=khushio-21&ascsubtag={subid}");
    const bad = linkInputSchema.safeParse({ ...base, trackingParams: "tag={click}" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path).toEqual(["trackingParams"]);
  });

  it("requires a merchant and a destination, and a clean product slug", () => {
    expect(linkInputSchema.safeParse({ ...base, merchantId: "" }).success).toBe(false);
    expect(linkInputSchema.safeParse({ ...base, merchantId: "not-a-uuid" }).success).toBe(false);
    expect(linkInputSchema.safeParse({ ...base, destinationUrl: "  " }).success).toBe(false);
    expect(linkInputSchema.safeParse({ ...base, productSlug: "Not A Slug" }).success).toBe(false);
    expect(linkInputSchema.parse({ ...base, productSlug: " Sony-XM5 " }).productSlug).toBe("sony-xm5");
  });
});

describe("network and programme forms", () => {
  it("network: needs a name, key is optional and must be a clean slug", () => {
    expect(networkInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(networkInputSchema.parse({ name: " Cuelinks ", key: "", isActive: "on" })).toMatchObject({ name: "Cuelinks", key: undefined, isActive: true });
    expect(networkInputSchema.safeParse({ name: "Cuelinks", key: "Bad Key" }).success).toBe(false);
  });

  it("programme: needs a merchant and a network, trims the optional text", () => {
    expect(programInputSchema.safeParse({ merchantId: "", networkId: UUID }).success).toBe(false);
    const parsed = programInputSchema.parse({ merchantId: UUID, networkId: UUID, externalProgramId: " 12345 ", commissionNote: "", isActive: "on" });
    expect(parsed).toMatchObject({ externalProgramId: "12345", commissionNote: null, isActive: true });
    expect(programInputSchema.safeParse({ merchantId: UUID, networkId: UUID, commissionNote: "x".repeat(501) }).success).toBe(false);
  });
});
