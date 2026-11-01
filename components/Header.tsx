import { Logo } from "./Logo";
import { getNav } from "@/lib/nav";
import { getSettings } from "@/lib/settings";

export async function Header() {
  const [items, { announcement }] = await Promise.all([getNav("header"), getSettings()]);
  const link = (i: (typeof items)[number], cls: string) => <a key={i.href + i.label} href={i.href} className={cls} {...(i.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{i.label}</a>;
  return (
    <>
    {announcement && <p className="bg-forest px-5 py-2 text-center text-sm text-ivory">{announcement}</p>}
    <header className="sticky top-0 z-40 border-b border-sand/70 bg-ivory/90 backdrop-blur">
      <div className="mx-auto flex max-w-page items-center justify-between gap-6 px-5 py-4">
        <Logo />
        {items.length > 0 && (
          <>
            <nav aria-label="Main" className="hidden gap-7 text-sm font-medium text-forest md:flex">{items.map((i) => link(i, "hover:text-terracotta"))}</nav>
            {/* Mobile menu without any JavaScript: a native <details> disclosure. */}
            <details className="relative md:hidden">
              <summary className="cursor-pointer list-none rounded-full border border-sand bg-white px-4 py-1.5 text-sm font-medium text-forest">Menu</summary>
              <nav aria-label="Main (mobile)" className="absolute right-0 mt-2 grid w-56 gap-1 rounded-card border border-sand bg-white p-3 text-sm font-medium text-forest shadow-lg">{items.map((i) => link(i, "rounded px-2 py-1.5 hover:bg-sand"))}</nav>
            </details>
          </>
        )}
      </div>
    </header>
    </>
  );
}
