import { SiteHeader } from "@/shared/layouts/site-header";
import { SiteFooter } from "@/shared/layouts/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
