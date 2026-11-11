import type { Metadata } from "next";
import { Fraunces, Jost } from "next/font/google";
import "@/styles/globals.css";
import { env } from "@/core/config/env";
import { SITE } from "@/shared/constants/site";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: "website", images: ["/brand/banner.png"] },
};

// Bare root layout. Public pages get the site header/footer from (public)/layout.tsx,
// the admin gets its own shell from admin/layout.tsx.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jost.variable}`}>
      <body>{children}</body>
    </html>
  );
}
