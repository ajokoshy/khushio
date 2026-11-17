import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
