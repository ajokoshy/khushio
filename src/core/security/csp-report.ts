const clip = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : undefined);

/** Reads one violation report (either browser format) into a few short fields for the log. Query strings are dropped from addresses. */
export function summariseReport(payload: unknown): Record<string, string | undefined> | null {
  // Old format: { "csp-report": {...} }. New format (Reporting API): [{ type: "csp-violation", body: {...} }].
  const first = Array.isArray(payload) ? (payload[0] as { body?: unknown } | undefined)?.body : (payload as { "csp-report"?: unknown } | null)?.["csp-report"];
  if (!first || typeof first !== "object") return null;
  const r = first as Record<string, unknown>;
  const strip = (v: unknown) => clip(typeof v === "string" ? v.split("?")[0] : v);
  return {
    directive: clip(r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? r["violatedDirective"], 60),
    blocked: strip(r["blocked-uri"] ?? r["blockedURL"] ?? r["blockedURI"]),
    page: strip(r["document-uri"] ?? r["documentURL"] ?? r["documentURI"]),
    disposition: clip(r["disposition"], 20),
  };
}
