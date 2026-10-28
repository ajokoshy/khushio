import { Logo } from "./Logo";
import { enabled, nav } from "@/lib/config/site";

export function Header() {
  const items = enabled(nav);
  return (
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-ivory/90 backdrop-blur">
      <div className="mx-auto flex max-w-page items-center justify-between gap-6 px-5 py-4">
        <Logo />
        {items.length > 0 && (
          <nav aria-label="Main" className="hidden gap-7 text-sm font-medium text-forest md:flex">
            {items.map((i) => (<a key={i.href} href={i.href} className="hover:text-terracotta">{i.label}</a>))}
          </nav>
        )}
      </div>
    </header>
  );
}
