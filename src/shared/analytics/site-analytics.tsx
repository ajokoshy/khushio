"use client";

import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { stripQuery } from "./strip-query";

/**
 * Release 7B: privacy-friendly page analytics outside Neon. Vercel Web Analytics and Speed Insights use no cookies and write
 * nothing to the database, so no consent banner is needed. Only rendered for public pages (never the admin) and only when
 * NEXT_PUBLIC_ANALYTICS=vercel; both also have to be switched on once in the Vercel dashboard (Analytics and Speed Insights tabs).
 *
 * Search words (the ?q= of /discover) are removed from the address before it is sent (strip-query.ts), so what people typed is never collected.
 */
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={stripQuery} />
      {/* Speed Insights is a script Vercel serves from this site once the feature is on (the same thing its npm package loads). */}
      <Script id="speed-insights-init" strategy="afterInteractive">{`window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };`}</Script>
      <Script src="/_vercel/speed-insights/script.js" strategy="afterInteractive" defer data-sdkn="khushio" />
    </>
  );
}
