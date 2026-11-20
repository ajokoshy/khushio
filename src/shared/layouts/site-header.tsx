import Image from "next/image";
import Link from "next/link";
import { getNavigation } from "@/modules/navigation/service";

/** The menu comes from the navigation editor (Release 6B); with none set up it falls back to the built-in links. */
export async function SiteHeader() {
  const links = await getNavigation("header");
  return (
    <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Khushio home">
          <Image src="/brand/logo.png" alt="Khushio" width={132} height={66} className="h-10 w-auto mix-blend-multiply" priority />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm font-medium">
          {links.map((n) =>
            n.href.startsWith("/") ? (
              <Link key={`${n.href}|${n.label}`} href={n.href} className="hover:text-coral-600">{n.label}</Link>
            ) : (
              <a key={`${n.href}|${n.label}`} href={n.href} rel="noopener" className="hover:text-coral-600">{n.label}</a>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
