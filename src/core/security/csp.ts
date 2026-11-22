/**
 * Release 7B: the Content-Security-Policy and the other response headers, as pure functions (next.config.ts imports this file,
 * so it must not import anything from the app).
 *
 * Why 'unsafe-inline' for scripts: Next.js writes small inline scripts for hydration, and a nonce-based policy would make
 * every page render on every request (no static pages, no cache), which costs real money on the free tier. Everything else
 * is locked down: no plug-ins, no framing, no other base address, forms only to this site, and images, fonts, styles and
 * connections only from the places the site really uses.
 *
 * It starts in REPORT-ONLY mode (browsers log violations to /api/csp-report and the page keeps working). Set CSP_ENFORCE=true
 * in Vercel and redeploy once the logs are quiet for a week.
 */

export type CspOptions = {
  /** Vercel Web Analytics and Speed Insights scripts are on. */
  analytics: boolean;
};

const unique = (list: string[]) => [...new Set(list)];

export function buildCsp({ analytics }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": unique(["'self'", "'unsafe-inline'", ...(analytics ? ["https://va.vercel-scripts.com"] : [])]),
    "style-src": ["'self'", "'unsafe-inline'"],
    // Cloudinary pictures, brand logos typed as https addresses, data: for tiny inline images, blob: for upload previews.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    // The browser uploads pictures straight to Cloudinary (signed upload, see src/infrastructure/cloudinary).
    "connect-src": unique(["'self'", "https://api.cloudinary.com", ...(analytics ? ["https://vitals.vercel-insights.com", "https://va.vercel-scripts.com"] : [])]),
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "report-uri": ["/api/csp-report"],
  };
  return [...Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`), "upgrade-insecure-requests"].join("; ");
}

export const cspHeaderName = (enforce: boolean) => (enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");

/** Headers sent with every response. In development the CSP is left out (React's dev tools need eval). */
export function securityHeaders(opts: { production: boolean; enforceCsp: boolean; analytics: boolean }): { key: string; value: string }[] {
  const base = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
  if (!opts.production) return base;
  return [...base, { key: cspHeaderName(opts.enforceCsp), value: buildCsp({ analytics: opts.analytics }) }];
}
