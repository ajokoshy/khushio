import Image from "next/image";
import Link from "next/link";
import { NAV } from "@/shared/constants/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="Khushio home">
          <Image src="/brand/logo.png" alt="Khushio" width={132} height={66} className="h-10 w-auto mix-blend-multiply" priority />
        </Link>
        <nav aria-label="Main" className="flex gap-6 text-sm font-medium">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-coral-600">{n.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
