import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/affiliate/repository", () => ({}));
vi.mock("@/core/audit", () => ({ logAuditBestEffort: vi.fn(), logAuditMany: vi.fn() }));

import { classifyStatus, describeBatch, probeLink } from "@/modules/affiliate/verify";

const link = { destinationUrl: "https://www.amazon.in/dp/B0123?tag=x", merchantDomains: ["amazon.in"] };

describe("link verification (Release 4A)", () => {
  it("classifies HTTP answers", () => {
    expect(classifyStatus(200).outcome).toBe("ok");
    expect(classifyStatus(301).outcome).toBe("ok");
    expect(classifyStatus(404).outcome).toBe("problem");
    expect(classifyStatus(410).outcome).toBe("problem");
    for (const status of [403, 405, 429, 500, 503]) expect(classifyStatus(status).outcome, String(status)).toBe("unclear");
  });

  it("sends one HEAD request that does not follow redirects, to the destination as stored", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const result = await probeLink(link, fetchImpl);
    expect(result.outcome).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.amazon.in/dp/B0123?tag=x");
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses to request a destination outside the allow-list (no request is made)", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    for (const destinationUrl of ["https://amazon.in.evil.com/", "http://amazon.in/", "https://169.254.169.254/latest/meta-data", "https://localhost/"]) {
      const result = await probeLink({ destinationUrl, merchantDomains: ["amazon.in", "169.254.169.254", "localhost"] }, fetchImpl);
      expect(result.outcome, destinationUrl).toBe("refused");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a network failure or a timeout as unreachable", async () => {
    const result = await probeLink(link, async () => { throw new Error("ECONNRESET"); });
    expect(result).toMatchObject({ outcome: "unreachable", status: null });
  });

  it("describes a batch in plain words", () => {
    expect(describeBatch({ checked: 0, ok: 0, problem: 0, unclear: 0, unreachable: 0, refused: 0 })).toBe("There are no active links to check.");
    expect(describeBatch({ checked: 4, ok: 2, problem: 1, unclear: 1, unreachable: 0, refused: 0 })).toBe("Checked 4 links: 2 working, 1 probably broken, 1 unclear (the store blocks automatic checks).");
    expect(describeBatch({ checked: 1, ok: 1, problem: 0, unclear: 0, unreachable: 0, refused: 0 })).toBe("Checked 1 link: 1 working.");
  });
});
