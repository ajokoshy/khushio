import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  selectMerchants: vi.fn(), selectMerchantById: vi.fn(), selectMerchantSlugsLike: vi.fn(), selectMerchantByName: vi.fn(), insertMerchant: vi.fn(),
  updateMerchantRow: vi.fn(), deleteMerchantRow: vi.fn(), countAffiliateLinksForMerchant: vi.fn(), countProgramsForMerchant: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("@/modules/merchants/repository", () => repo);
vi.mock("@/core/audit", () => ({ logAuditBestEffort: (...a: unknown[]) => audit(...a) }));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidate(...a) }));

import * as service from "@/modules/merchants/service";
import type { MerchantInput } from "@/modules/merchants/validation";

const input = (over: Partial<MerchantInput> = {}): MerchantInput => ({
  name: "Amazon India", slug: undefined, websiteUrl: null, allowedDomains: ["amazon.in"], logoUrl: null, confirmSlugChange: false, ...over,
});
const existing = { id: "m1", slug: "amazon-india", name: "Amazon India", websiteUrl: null, allowedDomains: ["amazon.in"], logoUrl: null, isActive: true };

beforeEach(() => {
  Object.values(repo).forEach((m) => m.mockReset());
  audit.mockReset();
  revalidate.mockReset();
  repo.selectMerchantSlugsLike.mockResolvedValue([]);
  repo.selectMerchantByName.mockResolvedValue(null);
  repo.selectMerchantById.mockResolvedValue(existing);
  repo.countAffiliateLinksForMerchant.mockResolvedValue(0);
  repo.countProgramsForMerchant.mockResolvedValue(0);
  repo.updateMerchantRow.mockImplementation(async (_id: string, v: object) => ({ ...existing, ...v }));
});

describe("merchants", () => {
  it("creates, audits the allowed domains and revalidates the merchants tag", async () => {
    repo.insertMerchant.mockImplementation(async (v) => ({ id: "m1", isActive: true, ...v }));
    await service.createMerchant(input({ allowedDomains: ["amazon.in", "amzn.to"] }), "actor");
    expect(repo.insertMerchant).toHaveBeenCalledWith(expect.objectContaining({ slug: "amazon-india", allowedDomains: ["amazon.in", "amzn.to"] }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "merchant.created", metadata: expect.objectContaining({ allowedDomains: ["amazon.in", "amzn.to"] }) }));
    expect(revalidate).toHaveBeenCalledWith("merchants");
  });

  it("records exactly which domains were added and removed", async () => {
    await service.updateMerchant("m1", input({ allowedDomains: ["amzn.to", "www.amazon.in"] }), "a");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "merchant.updated",
      metadata: expect.objectContaining({ domainsAdded: ["amzn.to", "www.amazon.in"], domainsRemoved: ["amazon.in"] }),
    }));
  });

  it("does nothing when the same domains are saved again", async () => {
    await service.updateMerchant("m1", input({ slug: "amazon-india" }), "a");
    expect(repo.updateMerchantRow).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("will not delete a merchant with links or programmes, and archives instead", async () => {
    repo.countAffiliateLinksForMerchant.mockResolvedValue(2);
    await expect(service.deleteMerchant("m1", "a")).rejects.toMatchObject({ status: 409 });
    repo.countAffiliateLinksForMerchant.mockResolvedValue(0);
    repo.countProgramsForMerchant.mockResolvedValue(1);
    await expect(service.deleteMerchant("m1", "a")).rejects.toMatchObject({ status: 409 });
    expect(repo.deleteMerchantRow).not.toHaveBeenCalled();
    await service.archiveMerchant("m1", "a");
    expect(repo.updateMerchantRow).toHaveBeenCalledWith("m1", { isActive: false });
    repo.countProgramsForMerchant.mockResolvedValue(0);
    await service.deleteMerchant("m1", "a");
    expect(repo.deleteMerchantRow).toHaveBeenCalledWith("m1");
  });

  it("restores an archived merchant", async () => {
    repo.selectMerchantById.mockResolvedValue({ ...existing, isActive: false });
    await service.restoreMerchant("m1", "a");
    expect(repo.updateMerchantRow).toHaveBeenCalledWith("m1", { isActive: true });
  });

  it("pages lists by fetching one extra row", async () => {
    repo.selectMerchants.mockResolvedValue([existing, existing, existing]);
    const r = await service.listMerchants({ status: "all", limit: 2, offset: 0 });
    expect(repo.selectMerchants).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    expect(r.rows).toHaveLength(2);
    expect(r.hasNext).toBe(true);
  });
});
