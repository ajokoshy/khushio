import Link from "next/link";
import { getNavigation } from "@/modules/navigation/service";
import { SITE } from "@/shared/constants/site";

export async function SiteFooter() {
  const links = await getNavigation("footer");
  return (
    <footer className="mt-24 border-t border-cream-200 py-10 text-sm text-ink-600">
      <div className="mx-auto max-w-6xl px-4">
        <p className="font-display text-lg text-forest-800">{SITE.name}</p>
        <p>{SITE.tagline}</p>
        {links.length > 0 && (
          <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
            {links.map((n) =>
              n.href.startsWith("/") ? (
                <Link key={`${n.href}|${n.label}`} href={n.href} className="hover:text-coral-600">{n.label}</Link>
              ) : (
                <a key={`${n.href}|${n.label}`} href={n.href} rel="noopener" className="hover:text-coral-600">{n.label}</a>
              ),
            )}
          </nav>
        )}
        <p className="mt-4">Some links on Khushio are affiliate links. We may earn a commission at no extra cost to you.</p>
      </div>
    </footer>
  );
}
