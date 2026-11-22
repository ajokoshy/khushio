import { preconnect } from "react-dom";
import { env } from "@/core/config/env";
import { SiteAnalytics } from "@/shared/analytics/site-analytics";
import { organizationJsonLd, websiteJsonLd } from "@/modules/seo/jsonld";
import { JsonLdScript } from "@/shared/seo/json-ld";
import { SiteHeader } from "@/shared/layouts/site-header";
import { SiteFooter } from "@/shared/layouts/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // Release 7B: open the connection to the picture host while the page is still loading (a faster Largest Contentful Paint).
  preconnect("https://res.cloudinary.com");
  return (
    <>
      <JsonLdScript data={[organizationJsonLd(), websiteJsonLd()]} />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      {env.NEXT_PUBLIC_ANALYTICS === "vercel" && <SiteAnalytics />}
    </>
  );
}
