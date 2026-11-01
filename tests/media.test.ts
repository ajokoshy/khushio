import { describe, expect, it } from "vitest";
import { MAX_STORED_PX, RECIPE, WIDTHS, imgUrl, signingString, snapWidth, srcSet } from "../lib/media/delivery";

const URL1 = "https://res.cloudinary.com/demo/image/upload/v1700000000/khushio/abc123.jpg";
describe("width snapping (limits derived Cloudinary files)", () => {
  it("only ever yields an allowed width", () => { for (const w of [1, 100, 321, 600, 641, 900, 1000, 1281, 5000]) expect(WIDTHS).toContain(snapWidth(w)); });
  it("rounds up to the next step and caps at the largest", () => { expect([snapWidth(300), snapWidth(320), snapWidth(321), snapWidth(5000)]).toEqual([320, 320, 640, 1280]); });
  it("produces at most WIDTHS.length distinct URLs for one image, however many sizes are requested", () => {
    const urls = new Set(Array.from({ length: 400 }, (_, i) => imgUrl(URL1, i * 4 + 1))); expect(urls.size).toBeLessThanOrEqual(WIDTHS.length);
  });
});
describe("delivery URLs", () => {
  it("uses the single recipe: automatic format and quality, never upscale", () => { expect(imgUrl(URL1, 600)).toBe(`https://res.cloudinary.com/demo/image/upload/${RECIPE},w_640/v1700000000/khushio/abc123.jpg`); expect(RECIPE).toContain("f_auto"); expect(RECIPE).toContain("q_auto"); expect(RECIPE).toContain("c_limit"); });
  it("replaces transformations already stored in an old URL, so old data collapses onto the recipe", () => {
    expect(imgUrl("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/v17/x/y.jpg", 700)).toBe(`https://res.cloudinary.com/demo/image/upload/${RECIPE},w_960/v17/x/y.jpg`);
    expect(imgUrl("https://res.cloudinary.com/demo/image/upload/w_100,h_100,c_fill/v17/x/y.jpg", 100)).toContain("/v17/x/y.jpg");
    expect(imgUrl("https://res.cloudinary.com/demo/image/upload/w_100,h_100,c_fill/v17/x/y.jpg", 100)).not.toContain("c_fill");
  });
  it("builds URLs from a bare public id when a cloud name is known", () => { expect(imgUrl("khushio/abc", 300, "demo")).toBe(`https://res.cloudinary.com/demo/image/upload/${RECIPE},w_320/khushio/abc`); expect(imgUrl("khushio/abc", 300, undefined)).toBe("khushio/abc"); });
  it("leaves local files and foreign hosts alone", () => { for (const u of ["/images/hero.jpg", "https://cdn.other.example/a.jpg"]) expect(imgUrl(u, 640, "demo")).toBe(u); });
  it("does not treat a path-traversal id as a public id", () => expect(imgUrl("../../secret", 300, "demo")).toBe("../../secret"));
});
describe("srcset", () => {
  it("lists only allowed widths, and none above the original image", () => {
    const set = srcSet(URL1, 700)!; const ws = [...set.matchAll(/ (\d+)w/g)].map((m) => Number(m[1])); expect(ws).toEqual([320, 640, 960]);
  });
  it("is omitted for images we do not control", () => expect(srcSet("/images/hero.jpg")).toBeUndefined());
});
describe("upload signing", () => {
  it("signs sorted parameters and leaves out file, api_key and empty values", () => {
    expect(signingString({ timestamp: "1", public_id: "a/b", overwrite: "false", file: "x", api_key: "k", empty: "", transformation: "c_limit" })).toBe("overwrite=false&public_id=a/b&timestamp=1&transformation=c_limit");
  });
  it("caps the stored original at a sensible size", () => expect(MAX_STORED_PX).toBeLessThanOrEqual(2000));
});

import { cloudinaryProvider, externalProvider, getProvider } from "../lib/media/provider";
describe("media provider boundary", () => {
  it("defaults to Cloudinary and can be switched to external", () => { expect(getProvider({})).toBe(cloudinaryProvider); expect(getProvider({ MEDIA_PROVIDER: "external" })).toBe(externalProvider); expect(getProvider({ MEDIA_PROVIDER: "anything-else" })).toBe(cloudinaryProvider); });
  it("the external provider never uploads, never deletes remotely, and serves addresses unchanged", async () => { expect(externalProvider.configured()).toBe(false); await expect(externalProvider.upload(new File([], "x.png"), "h")).rejects.toThrow(); await expect(externalProvider.destroy("x")).resolves.toBeUndefined(); expect(externalProvider.url("https://cdn.example/a.jpg", 640)).toBe("https://cdn.example/a.jpg"); });
  it("the Cloudinary provider builds delivery URLs on the fixed width set", () => expect(cloudinaryProvider.url("https://res.cloudinary.com/demo/image/upload/v1/a.jpg", 500)).toContain("w_640"));
});
