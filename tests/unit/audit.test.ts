import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));
vi.mock("@/core/audit/repository", () => ({
  insertAuditRows: (...args: unknown[]) => mocks.insert(...args),
  selectAuditLogs: (...args: unknown[]) => mocks.select(...args),
}));

import { listAuditLogs, logAudit, logAuditMany } from "@/core/audit";

beforeEach(() => {
  mocks.insert.mockReset();
  mocks.select.mockReset();
});

describe("logAudit", () => {
  it("maps actor to actorId and fills defaults", async () => {
    await logAudit({ actor: "u1", action: "product.updated", entityType: "product", entityId: "p1", metadata: { field: "name" } });
    expect(mocks.insert).toHaveBeenCalledWith([
      { actorId: "u1", action: "product.updated", entityType: "product", entityId: "p1", metadata: { field: "name" } },
    ]);
  });

  it("records system actions with a null actor", async () => {
    await logAudit({ action: "user.created", entityType: "user" });
    expect(mocks.insert).toHaveBeenCalledWith([{ actorId: null, action: "user.created", entityType: "user", entityId: null, metadata: null }]);
  });

  it("writes many rows in one call", async () => {
    await logAuditMany([{ action: "a", entityType: "x" }, { action: "b", entityType: "y" }]);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]?.[0]).toHaveLength(2);
  });
});

describe("listAuditLogs", () => {
  const row = (i: number) => ({ id: String(i) });

  it("asks for one extra row and reports whether a next page exists", async () => {
    mocks.select.mockResolvedValue([row(1), row(2), row(3)]);
    const result = await listAuditLogs({ limit: 2, offset: 0 });
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ limit: 3, offset: 0 }));
    expect(result.rows).toHaveLength(2);
    expect(result.hasNext).toBe(true);
  });

  it("reports no next page on the last page", async () => {
    mocks.select.mockResolvedValue([row(1), row(2)]);
    const result = await listAuditLogs({ limit: 2, offset: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.hasNext).toBe(false);
  });
});
