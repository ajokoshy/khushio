import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signParams, verifyUploadResponseSignature } from "@/infrastructure/cloudinary/sign";
import { buildImageUrl, buildSrcSet } from "@/infrastructure/cloudinary/images";
import { uploadProblem, type UploadResult } from "@/infrastructure/cloudinary/upload-rules";

const secret = "test-secret";
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const upload = (over: Partial<UploadResult> = {}): UploadResult => {
  const base = { public_id: "khushio/products/shoe", version: 1700000000, width: 800, height: 600, bytes: 100_000, format: "jpg", resource_type: "image", etag: "abc12345", ...over };
  return { signature: sha1(`public_id=${base.public_id}&version=${base.version}${secret}`), ...base };
};

describe("signing", () => {
  it("matches Cloudinary's documented example", () => {
    expect(signParams({ timestamp: 1315060510, public_id: "sample", file: undefined }, "abcd")).toBe(sha1("public_id=sample&timestamp=1315060510abcd"));
  });
  it("sorts parameters and skips empty ones", () => {
    expect(signParams({ b: 2, a: 1, c: "" }, "s")).toBe(sha1("a=1&b=2s"));
  });
  it("verifies the upload response signature", () => {
    const u = upload();
    expect(verifyUploadResponseSignature({ publicId: u.public_id, version: u.version, signature: u.signature }, secret)).toBe(true);
    expect(verifyUploadResponseSignature({ publicId: u.public_id, version: u.version, signature: "0".repeat(40) }, secret)).toBe(false);
    expect(verifyUploadResponseSignature({ publicId: "other", version: u.version, signature: u.signature }, secret)).toBe(false);
  });
});

describe("upload rules", () => {
  it("accepts a normal product image", () => expect(uploadProblem(upload(), secret)).toBeNull());
  it("rejects a forged signature", () => expect(uploadProblem({ ...upload(), signature: "bad" }, secret)).toMatch(/verified/));
  it("rejects other folders, traversal, formats, sizes and resource types", () => {
    expect(uploadProblem(upload({ public_id: "other/x" }), secret)).toMatch(/folder/);
    expect(uploadProblem(upload({ public_id: "khushio/products/../x" }), secret)).toMatch(/folder/);
    expect(uploadProblem(upload({ format: "svg" }), secret)).toMatch(/Use a/);
    expect(uploadProblem(upload({ bytes: 6 * 1024 * 1024 }), secret)).toMatch(/larger than 5 MB/);
    expect(uploadProblem(upload({ width: 9000 }), secret)).toMatch(/pixels/);
    expect(uploadProblem(upload({ resource_type: "video" }), secret)).toMatch(/images/);
  });
});

describe("image URLs", () => {
  it("builds one URL per profile and a srcset", () => {
    expect(buildImageUrl("demo", "khushio/products/a b", "card")).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_480/khushio/products/a%20b");
    expect(buildImageUrl("demo", "khushio/products/x", "thumbnail")).toContain("c_fill,g_auto,w_160,h_160");
    expect(buildSrcSet("demo", "khushio/products/x", ["card", "product"])).toMatch(/ 480w, .* 800w$/);
  });
});
