import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/core/security/redirects";

const DASHBOARD = "/admin/dashboard";

describe("safeCallbackPath", () => {
  it("falls back to the dashboard when there is no callback", () => {
    for (const v of [undefined, null, ""]) expect(safeCallbackPath(v)).toBe(DASHBOARD);
  });

  it("keeps same-site /admin/ paths and their query", () => {
    expect(safeCallbackPath("/admin/audit")).toBe("/admin/audit");
    expect(safeCallbackPath("/admin/audit?q=login&page=2")).toBe("/admin/audit?q=login&page=2");
  });

  it("reduces the absolute URL that Auth.js middleware sends to its path (deep link after login)", () => {
    expect(safeCallbackPath("http://localhost:3000/admin/audit?q=x")).toBe("/admin/audit?q=x");
    expect(safeCallbackPath("https://khushio.com/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("never returns another host, even if the path looks right", () => {
    const out = safeCallbackPath("https://evil.example/admin/audit");
    expect(out).toBe("/admin/audit");
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
  });

  it("rejects off-site, non-admin and tricky values", () => {
    const bad = [
      "https://evil.example",
      "https://evil.example/",
      "//evil.example/admin/x",
      "/\\evil.example/admin/x",
      "/admin\\..\\x",
      "/admin-login",
      "/admin",
      "/",
      "/products",
      "javascript:alert(1)",
      "/admin/\u0000x",
      "/admin/\nx",
      "/admin/../products",
      "/admin/%2e%2e/%2e%2e/products",
    ];
    for (const v of bad) expect(safeCallbackPath(v), v).toBe(DASHBOARD);
  });
});
