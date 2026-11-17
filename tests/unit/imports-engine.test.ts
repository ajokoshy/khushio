import { describe, expect, it } from "vitest";
import { buildErrorCsv, previewImport, readFile, runImport } from "@/modules/imports/engine";
import { cleanMapping, missingRequired, suggestMapping, toRawRows } from "@/modules/imports/mapping";
import { given, normaliseHeader, readBool, readInt, splitList } from "@/modules/imports/values";
import type { ColumnSpec, EntityHandler, PlanUnit, RawRow } from "@/modules/imports/types";

const COLUMNS: ColumnSpec[] = [
  { name: "slug", required: true, aliases: ["id", "handle"], help: "", example: "" },
  { name: "name", required: true, aliases: ["title"], help: "", example: "" },
  { name: "note", required: false, aliases: [], help: "", example: "" },
];

/** A handler that accepts rows named like "ok-*" as new, "same-*" as unchanged, and rejects anything else. */
function fakeHandler(applied: PlanUnit[][] = [], failBatch = (_: PlanUnit[]) => false): EntityHandler {
  return {
    entity: "brands",
    columns: COLUMNS,
    async plan(rows: RawRow[]) {
      const units: PlanUnit[] = [];
      const errors = [];
      for (const r of rows) {
        const slug = r.cells.slug ?? "";
        if (slug.startsWith("ok")) units.push({ lines: [r.line], action: "create", data: slug });
        else if (slug.startsWith("same")) units.push({ lines: [r.line], action: "unchanged", data: slug });
        else errors.push({ line: r.line, message: `bad slug "${slug}"` });
      }
      return { units, errors };
    },
    async apply(units) {
      if (failBatch(units)) throw new Error("database said no");
      applied.push(units);
    },
  };
}
const file = (...lines: string[]) => lines.join("\n");

describe("values", () => {
  it("reads booleans, integers and lists", () => {
    expect(readBool("YES", "f")).toEqual({ ok: true, value: true });
    expect(readBool("0", "f")).toEqual({ ok: true, value: false });
    expect(readBool("", "f")).toEqual({ ok: true, value: null });
    expect(readBool("maybe", "f").ok).toBe(false);
    expect(readInt("42", "f", 0, 100)).toEqual({ ok: true, value: 42 });
    expect(readInt("101", "f", 0, 100).ok).toBe(false);
    expect(readInt("4.5", "f", 0, 100).ok).toBe(false);
    expect(readInt("", "f", 0, 100)).toEqual({ ok: true, value: null });
    expect(splitList("a|b, c;d\ne|a")).toEqual(["a", "b", "c", "d", "e"]);
    expect(normaliseHeader(" Logo URL! ")).toBe("logo_url");
    expect(given("  ")).toBe(false);
  });
});

describe("column mapping", () => {
  it("matches headers by name or alias, ignoring case and symbols, and never uses one header twice", () => {
    expect(suggestMapping(COLUMNS, ["Handle", "TITLE", "Extra"])).toEqual({ slug: "Handle", name: "TITLE", note: "" });
    expect(suggestMapping(COLUMNS, ["slug", "slug", "name"])).toEqual({ slug: "slug", name: "name", note: "" });
  });
  it("cleans a mapping the browser posted: only real headers, only once", () => {
    expect(cleanMapping(COLUMNS, ["A", "B"], { slug: "A", name: "A", note: "Z", other: "B" })).toEqual({ slug: "A", name: "", note: "" });
  });
  it("names the required fields that are not mapped", () => {
    expect(missingRequired(COLUMNS, { slug: "A", name: "", note: "" })).toEqual(["name"]);
  });
  it("builds rows from the mapped columns and removes spreadsheet protection", () => {
    const parsed = readFile("a,b\n1,'=x\n");
    const rows = toRawRows(COLUMNS, parsed.headerCells, { slug: "a", name: "b", note: "" }, parsed.body);
    expect(rows).toEqual([{ line: 2, cells: { slug: "1", name: "=x", note: "" } }]);
  });
});

describe("file limits", () => {
  it("refuses empty files, header-only files and files with too many rows", () => {
    expect(() => readFile("")).toThrow();
    expect(() => readFile("slug,name\n")).toThrow();
    const many = ["slug,name", ...Array.from({ length: 2001 }, (_, i) => `ok${i},n`)].join("\n");
    expect(() => readFile(many)).toThrow(/Too many rows/);
    expect(readFile(["slug,name", ...Array.from({ length: 2000 }, (_, i) => `ok${i},n`)].join("\n")).rowsInFile).toBe(2000);
  });
  it("refuses a file over 2 MB", () => {
    expect(() => readFile(`slug,name\n${"x".repeat(2_000_001)},a`)).toThrow(/too large/);
  });
});

describe("preview", () => {
  it("counts what would happen without writing", async () => {
    const applied: PlanUnit[][] = [];
    const p = await previewImport(fakeHandler(applied), { text: file("slug,name", "ok1,A", "same1,B", "nope,C"), filename: "f.csv", mapping: null });
    expect(p.counts).toEqual({ create: 1, update: 0, unchanged: 1, failed: 1 });
    expect(p.errors).toEqual(['Line 4: bad slug "nope"']);
    expect(applied).toEqual([]);
  });
  it("stops at missing required columns and says which", async () => {
    const p = await previewImport(fakeHandler(), { text: file("slug,zzz", "ok1,A"), filename: "f.csv", mapping: null });
    expect(p.missingRequired).toEqual(["name"]);
    expect(p.counts).toEqual({ create: 0, update: 0, unchanged: 0, failed: 0 });
  });
  it("uses the mapping the admin chose", async () => {
    const p = await previewImport(fakeHandler(), { text: file("code,label", "ok1,A"), filename: "f.csv", mapping: { slug: "code", name: "label" } });
    expect(p.missingRequired).toEqual([]);
    expect(p.counts.create).toBe(1);
  });
});

describe("run", () => {
  it("writes in batches of 100, skips unchanged rows and reports the rest", async () => {
    const applied: PlanUnit[][] = [];
    const lines = ["slug,name", ...Array.from({ length: 250 }, (_, i) => `ok${i},n`), "same1,n", "bad,n"];
    const r = await runImport(fakeHandler(applied), { text: file(...lines), filename: "big.csv", mapping: null }, { actorId: "u" });
    expect(applied.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(r).toMatchObject({ created: 250, updated: 0, unchanged: 1, failed: 1, rowsInFile: 252 });
  });

  it("rolls back only the failing batch: its rows are reported, the other batches still import", async () => {
    const applied: PlanUnit[][] = [];
    const lines = ["slug,name", ...Array.from({ length: 250 }, (_, i) => `ok${i},n`)];
    const r = await runImport(fakeHandler(applied, (batch) => batch.some((u) => u.data === "ok150")), { text: file(...lines), filename: "big.csv", mapping: null }, { actorId: "u" });
    expect(applied.map((b) => b.length)).toEqual([100, 50]);
    expect(r.created).toBe(150);
    expect(r.failed).toBe(100);
    expect(r.errors[0]).toContain("rolled back");
    expect(r.errorCsv.split("\r\n").length).toBeGreaterThan(100);
  });

  it("is a no-op on a second run when the handler reports everything unchanged", async () => {
    const applied: PlanUnit[][] = [];
    const r = await runImport(fakeHandler(applied), { text: file("slug,name", "same1,a", "same2,b"), filename: "f.csv", mapping: null }, { actorId: "u" });
    expect(applied).toEqual([]);
    expect(r).toMatchObject({ created: 0, updated: 0, unchanged: 2, failed: 0, errorCsv: "" });
  });

  it("refuses to run with a required column unmapped", async () => {
    await expect(runImport(fakeHandler(), { text: file("slug,zzz", "ok1,A"), filename: "f.csv", mapping: null }, { actorId: "u" })).rejects.toThrow();
  });
});

describe("error file", () => {
  it("lists the line, the problem and the original cells, ready to fix and import again", () => {
    const parsed = readFile(file("slug,name", "ok1,A", 'bad,"B, C"'));
    const csv = buildErrorCsv(parsed, [{ line: 3, message: "bad slug" }]);
    expect(csv).toContain("line,error,slug,name");
    expect(csv).toContain('3,bad slug,bad,"B, C"');
    expect(buildErrorCsv(parsed, [])).toBe("");
  });
});
