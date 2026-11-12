import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/core/errors";

const requirePermission = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }));
const discover = vi.hoisted(() => ({
  createCategory: vi.fn(), updateCategory: vi.fn(), archiveCategory: vi.fn(), restoreCategory: vi.fn(), deleteCategory: vi.fn(),
  createBrand: vi.fn(), updateBrand: vi.fn(), archiveBrand: vi.fn(), restoreBrand: vi.fn(), deleteBrand: vi.fn(),
}));
const merchants = vi.hoisted(() => ({
  createMerchant: vi.fn(), updateMerchant: vi.fn(), archiveMerchant: vi.fn(), restoreMerchant: vi.fn(), deleteMerchant: vi.fn(),
}));
vi.mock("@/core/permissions/require", () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/modules/discover/service", () => discover);
vi.mock("@/modules/merchants/service", () => merchants);

import * as categories from "@/app/admin/categories/actions";
import * as brands from "@/app/admin/brands/actions";
import * as merchantActions from "@/app/admin/merchants/actions";

const ID = "3f2b8a0e-6c1d-4b7e-9a55-0d6f1c2e4a11";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const allServices = [...Object.values(discover), ...Object.values(merchants)];

const suites = [
  { name: "categories", perm: "category:write", mod: categories, E: "Category", svc: discover, valid: { name: "Shoes" } },
  { name: "brands", perm: "brand:write", mod: brands, E: "Brand", svc: discover, valid: { name: "Nike" } },
  { name: "merchants", perm: "merchant:write", mod: merchantActions, E: "Merchant", svc: merchants, valid: { name: "Amazon", allowedDomains: "amazon.in" } },
] as const;

beforeEach(() => {
  allServices.forEach((m) => m.mockReset());
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({ user: { id: "actor-1" } });
  redirect.mockClear();
});

describe.each(suites)("$name admin actions", ({ perm, mod, E, svc, valid }) => {
  const m = mod as unknown as Record<string, (...a: never[]) => Promise<any>>;
  const s = svc as unknown as Record<string, ReturnType<typeof vi.fn>>;

  it(`require the ${perm} permission, and write nothing without it`, async () => {
    requirePermission.mockRejectedValue(new ForbiddenError());
    const create = await m[`create${E}Action`]!(null as never, form(valid) as never);
    expect(create).toMatchObject({ ok: false, error: expect.stringContaining("permission") });
    for (const verb of ["archive", "restore", "delete"]) {
      expect(await m[`${verb}${E}Action`]!(ID as never)).toMatchObject({ ok: false, error: expect.stringContaining("permission") });
    }
    expect(await m[`update${E}Action`]!(ID as never, null as never, form(valid) as never)).toMatchObject({ ok: false });
    for (const fn of Object.values(s)) expect(fn).not.toHaveBeenCalled();
  });

  it("check the right permission key", async () => {
    s[`create${E}`]!.mockResolvedValue({});
    await expect(m[`create${E}Action`]!(null as never, form(valid) as never)).rejects.toThrow("REDIRECT:");
    expect(requirePermission).toHaveBeenCalledWith(perm);
  });

  it("create validates first, keeps what was typed, and never reaches the service on bad input", async () => {
    const bad = await m[`create${E}Action`]!(null as never, form({ name: "", slug: "Bad Slug" }) as never);
    expect(bad).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String), slug: expect.any(String) }, values: { slug: "Bad Slug" } });
    expect(s[`create${E}`]).not.toHaveBeenCalled();
  });

  it("create passes the signed-in user as actor and redirects with a notice", async () => {
    s[`create${E}`]!.mockResolvedValue({});
    await expect(m[`create${E}Action`]!(null as never, form(valid) as never)).rejects.toThrow(/REDIRECT:\/admin\/\w+\?notice=created/);
    expect(s[`create${E}`]).toHaveBeenCalledWith(expect.objectContaining({ name: valid.name }), "actor-1");
  });

  it("show service validation errors beside the fields", async () => {
    s[`create${E}`]!.mockRejectedValue(new ValidationError("Duplicate", { name: "Already exists" }));
    expect(await m[`create${E}Action`]!(null as never, form(valid) as never)).toMatchObject({ ok: false, fieldErrors: { name: "Already exists" } });
  });

  it("send a lost session back to the login page", async () => {
    requirePermission.mockRejectedValue(new UnauthorizedError());
    await expect(m[`create${E}Action`]!(null as never, form(valid) as never)).rejects.toThrow("REDIRECT:/admin-login");
  });

  it("reject an id that is not a UUID before calling the service", async () => {
    expect(await m[`archive${E}Action`]!("not-a-uuid" as never)).toMatchObject({ ok: false });
    expect(s[`archive${E}`]).not.toHaveBeenCalled();
  });

  it("archive, restore and delete call the service with the actor; delete returns to the list", async () => {
    for (const verb of ["archive", "restore", "delete"]) s[`${verb}${E}`]!.mockResolvedValue(undefined);
    expect(await m[`archive${E}Action`]!(ID as never)).toMatchObject({ ok: true });
    expect(await m[`restore${E}Action`]!(ID as never)).toMatchObject({ ok: true });
    expect(await m[`delete${E}Action`]!(ID as never)).toMatchObject({ ok: true, redirectTo: expect.stringContaining("notice=deleted") });
    expect(s[`delete${E}`]).toHaveBeenCalledWith(ID, "actor-1");
  });

  it("report a refused delete (conflict) as a message, not a crash", async () => {
    const { ConflictError } = await import("@/core/errors");
    s[`delete${E}`]!.mockRejectedValue(new ConflictError("In use. Archive it instead."));
    expect(await m[`delete${E}Action`]!(ID as never)).toEqual({ ok: false, error: "In use. Archive it instead." });
  });

  it("hide unexpected errors behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    s[`archive${E}`]!.mockRejectedValue(new Error("connection string postgres://secret"));
    const r = await m[`archive${E}Action`]!(ID as never);
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(r.ok).toBe(false);
  });
});
