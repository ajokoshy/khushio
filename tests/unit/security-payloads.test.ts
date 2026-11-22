/** Release 7B security test list, part 2: hostile input. Each case is something an attacker (or a careless paste) could send. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/modules/reports/cron-auth";
import { safeCallbackPath } from "@/core/security/redirects";
import { sanitizeDocument, safeHref, type Doc } from "@/modules/content/document";
import { DocumentRenderer } from "@/shared/content/document-renderer";
import { checkRule, normalizePath } from "@/modules/redirects/path";
import { articleJsonLd, serializeJsonLd } from "@/modules/seo/jsonld";
import { ALLOWED_FORMATS, uploadProblem } from "@/infrastructure/cloudinary/upload-rules";
import { signParams } from "@/infrastructure/cloudinary/sign";

const render = (doc: unknown) => renderToStaticMarkup(createElement(DocumentRenderer, { doc: sanitizeDocument(doc) as Doc }));
const para = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

describe("XSS payloads in the editor are inert", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "\"><script>alert(1)</script>",
    "<iframe src=javascript:alert(1)></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<style>*{background:url(javascript:alert(1))}</style>",
    "</p><script>alert(1)</script>",
    "{{constructor.constructor('alert(1)')()}}",
    "<math><mi xlink:href=\"data:x,<script>alert(1)</script>\">",
  ];
  for (const payload of payloads) {
    it(`text: ${payload.slice(0, 40)}`, () => {
      const html = render({ type: "doc", content: [para(payload)] });
      expect(html).not.toMatch(/<(script|iframe|svg|style|math|img)\b/i);
      if (payload.includes("<")) expect(html).toContain("&lt;"); // shown as text, not run
      expect(html).not.toMatch(/<[^>]*\son\w+=/i); // no real tag carries an event handler
    });
  }

  const badHrefs = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example/x", "\\\\evil.example\\x", "file:///etc/passwd", "&#106;avascript:alert(1)", "/\\evil.example"];
  for (const href of badHrefs) {
    it(`link: ${JSON.stringify(href).slice(0, 40)}`, () => {
      expect(safeHref(href)).toBeNull();
      const html = render({ type: "doc", content: [para("click", [{ type: "link", attrs: { href } }])] });
      expect(html).not.toMatch(/href=/i);
    });
  }

  it("unknown blocks, event-handler attributes and remote image addresses are dropped", () => {
    const html = render({
      type: "doc",
      content: [
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "paragraph", attrs: { onclick: "alert(1)", style: "x" }, content: [{ type: "text", text: "ok" }] },
        { type: "image", attrs: { publicId: "https://evil.example/x.png", alt: "x", onerror: "alert(1)" } },
        { type: "image", attrs: { publicId: "khushio/products/../../secret", alt: "x" } },
      ],
    });
    expect(html).toContain("<p><span class=\"contents\">ok</span></p>");
    expect(html).not.toMatch(/script|onclick|onerror|evil|secret|<img/i);
  });
});

describe("structured data and redirect rules cannot carry markup", () => {
  it("a hostile article title cannot close the JSON-LD script", () => {
    const text = serializeJsonLd(articleJsonLd({ headline: "</script><script>alert(1)</script>", path: "/articles/x" }));
    expect(text).not.toContain("</script>");
    expect(text).not.toContain("<");
  });
  it("redirect rules refuse other sites, protocol tricks and the admin", () => {
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/a?x=1", "/%2e%2e/admin", "/a b", "/\\evil.example"]) expect(normalizePath(bad), bad).toBeNull();
    expect(checkRule({ fromPath: "/a", toPath: "/admin/users", statusCode: 301 }, [])).not.toBeNull();
    expect(checkRule({ fromPath: "/api/health", toPath: "/a", statusCode: 301 }, [])).not.toBeNull();
  });
});

describe("open redirect on the login page", () => {
  for (const value of ["https://evil.example/admin/x", "//evil.example/admin/x", "/\\evil.example", "/admin/../etc", "javascript:alert(1)", "/products/x", "/admin/%2e%2e/%2e%2e/x", "/admin\n/evil", "http://khushio.invalid@evil.example/admin/"]) {
    it(JSON.stringify(value), () => {
      const result = safeCallbackPath(value);
      expect(result.startsWith("/admin/")).toBe(true);
      expect(result).not.toContain("evil");
      expect(result.startsWith("//")).toBe(false);
    });
  }
});

describe("upload type abuse", () => {
  const secret = "test-secret";
  const signed = (over: Record<string, unknown> = {}) => {
    const base = { public_id: "khushio/products/a1", version: 1700000000, width: 800, height: 600, bytes: 1000, format: "jpg", resource_type: "image", ...over };
    const signature = signParams({ public_id: base.public_id as string, version: base.version as number }, secret);
    return { ...base, signature } as Parameters<typeof uploadProblem>[0];
  };
  it("accepts a normal signed image", () => expect(uploadProblem(signed(), secret)).toBeNull());
  it("refuses a forged signature", () => expect(uploadProblem({ ...signed(), signature: "0".repeat(40) }, secret)).not.toBeNull());
  it("refuses everything that is not a plain jpg, png or webp image", () => {
    for (const format of ["svg", "gif", "pdf", "html", "js", "php", "exe", "heic", "tiff"]) expect(uploadProblem(signed({ format }), secret), format).not.toBeNull();
    for (const resource_type of ["raw", "video", "auto"]) expect(uploadProblem(signed({ resource_type }), secret), resource_type).not.toBeNull();
    expect([...ALLOWED_FORMATS].sort()).toEqual(["jpeg", "jpg", "png", "webp"]);
  });
  it("refuses a picture outside the products folder, a path trick, huge files and huge dimensions", () => {
    expect(uploadProblem(signed({ public_id: "other/folder/a" }), secret)).not.toBeNull();
    expect(uploadProblem(signed({ public_id: "khushio/products/../../a" }), secret)).not.toBeNull();
    expect(uploadProblem(signed({ bytes: 50 * 1024 * 1024 }), secret)).not.toBeNull();
    expect(uploadProblem(signed({ width: 20000 }), secret)).not.toBeNull();
  });
});

describe("cron and webhook secret", () => {
  const secret = "a-long-enough-cron-secret";
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    for (const header of [null, "", "Bearer", `Bearer ${secret}x`, `bearer ${secret}`, secret, `Basic ${secret}`, "Bearer " + secret.toUpperCase()]) expect(isCronAuthorized(header, secret), String(header)).toBe(false);
  });
  it("refuses everything when the secret was never set or is too short", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
  });
});
