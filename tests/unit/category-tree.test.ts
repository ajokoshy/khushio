import { describe, expect, it } from "vitest";
import { descendantIds, flattenTree, indentedLabel, wouldCreateCycle } from "@/modules/discover/tree";

const n = (id: string, parentId: string | null, name = id, sortOrder = 0) => ({ id, parentId, name, sortOrder });
const rows = [
  n("shoes", "fashion", "Shoes"),
  n("fashion", null, "Fashion", 1),
  n("home", null, "Home", 0),
  n("running", "shoes", "Running"),
  n("casual", "shoes", "Casual", -1),
];

describe("flattenTree", () => {
  it("orders depth-first by sort order then name, with depth and path", () => {
    const flat = flattenTree(rows);
    expect(flat.map((r) => [r.id, r.depth])).toEqual([["home", 0], ["fashion", 1 - 1], ["shoes", 1], ["casual", 2], ["running", 2]]);
    expect(flat.find((r) => r.id === "running")?.path).toBe("Fashion › Shoes › Running");
  });
  it("keeps rows whose parent is missing or that sit in a cycle (bad data)", () => {
    const flat = flattenTree([n("a", "ghost"), n("b", "c"), n("c", "b")]);
    expect(flat.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("handles an empty list", () => expect(flattenTree([])).toEqual([]));
});

describe("descendantIds / wouldCreateCycle", () => {
  it("finds every level below a category", () => {
    expect([...descendantIds(rows, "fashion")].sort()).toEqual(["casual", "running", "shoes"]);
    expect(descendantIds(rows, "running").size).toBe(0);
  });
  it("refuses moving a category under itself or any descendant", () => {
    expect(wouldCreateCycle(rows, "fashion", "fashion")).toBe(true);
    expect(wouldCreateCycle(rows, "fashion", "shoes")).toBe(true);
    expect(wouldCreateCycle(rows, "fashion", "running")).toBe(true);
  });
  it("allows legal moves", () => {
    expect(wouldCreateCycle(rows, "running", "home")).toBe(false);
    expect(wouldCreateCycle(rows, "shoes", null)).toBe(false);
    expect(wouldCreateCycle(rows, "home", "fashion")).toBe(false);
  });
  it("does not loop forever on cyclic data", () => {
    expect(() => descendantIds([n("b", "c"), n("c", "b")], "b")).not.toThrow();
  });
});

describe("indentedLabel", () => {
  it("indents by depth", () => {
    expect(indentedLabel("Fashion", 0)).toBe("Fashion");
    expect(indentedLabel("Running", 2)).toBe("— — Running");
  });
});
