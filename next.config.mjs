const dev = process.env.NODE_ENV !== "production";
/** Content-Security-Policy. Next.js needs inline scripts/styles for hydration; everything else is locked to this site. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const security = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * Cost settings (Vercel and Cloudinary):
 * - images.unoptimized: product images are already optimised and cached by Cloudinary; sending them through Vercel Image
 *   Optimization too would bill the same work twice. (The site uses plain <img>; this also protects any future next/image.)
 * - static files in /brand and /images are cached for a day at the edge and revalidated in the background.
 * - /shop, /gifts, /compare and /journal depend on the query string so they render per request; a short shared-cache lifetime lets the
 *   CDN answer repeat visits to the same URL without running a function.
 */
const STATIC_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const PAGE_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true, poweredByHeader: false, images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "4mb" }, optimizePackageImports: ["lucide-react"] },
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: STATIC_CACHE }] },
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: STATIC_CACHE }] },
      ...["/shop", "/gifts", "/compare", "/journal"].map((source) => ({ source, headers: [{ key: "Cache-Control", value: PAGE_CACHE }] })),
    ];
  },
};
