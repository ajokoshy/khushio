import { describe, expect, it } from "vitest";
import { slugify } from "../lib/slug";
describe("slugify", () => {
  it.each([["  Sample Store & Co. ", "sample-store-co"], ["Already-Slug", "already-slug"], ["A  B", "a-b"], ["Ünï", "n"], ["", ""], ["---", ""]])("%j -> %j", (a, b) => expect(slugify(a)).toBe(b));
});
