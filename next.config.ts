import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/core/security/csp";

// Release 7B: the headers (and the Content-Security-Policy) come from one tested function. Read at build time, so changing
// CSP_ENFORCE or NEXT_PUBLIC_ANALYTICS in Vercel needs a redeploy.
const headers = securityHeaders({
  production: process.env.NODE_ENV === "production",
  enforceCsp: process.env.CSP_ENFORCE === "true",
  analytics: process.env.NEXT_PUBLIC_ANALYTICS === "vercel",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets server pages answer a real 403 via forbidden() (see src/core/permissions/require.ts).
  // Server actions accept bodies up to 3 MB: the CSV import limit is 2 MB per file (Release 5B).
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "3mb" } },
  images: {
    // Cloudinary serves optimized, transformed images itself (see docs/ARCHITECTURE.md);
    // Vercel image processing is bypassed to save usage.
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

// `npm run analyze` writes the bundle reports to .next/analyze (Release 7B).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true", openAnalyzer: false });

export default withBundleAnalyzer(nextConfig);
