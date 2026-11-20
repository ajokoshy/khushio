import Link from "next/link";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { listItems } from "@/modules/navigation/service";
import { NAV_AREAS, NAV_AREA_LABELS, NAV_LIMITS } from "@/modules/navigation/types";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { createNavItemAction, moveNavItemAction, toggleNavItemAction } from "./actions";
import { NavForm } from "./nav-form";

export const metadata = { title: "Navigation", robots: { index: false } };

const small = "rounded-lg border border-cream-200 px-2.5 py-1 text-xs hover:bg-forest-100 disabled:opacity-40";

export default async function NavigationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.homepageWrite);
  const sp = await searchParams;
  const items = await listItems();
  return (
    <>
      <p className="text-sm"><Link href="/admin/homepage" className="text-ink-600 underline">← Homepage</Link></p>
      <h1 className="mt-2 text-3xl">Navigation</h1>
      <p className="mt-2 max-w-prose text-ink-600">The links in the site header and footer. With no header link shown, the built-in menu (Discover, Deals, Compare, Articles, Guides) is used.</p>
      <div className="mt-6"><Notice code={firstParam(sp.notice)} /></div>

      {NAV_AREAS.map((area) => {
        const rows = items.filter((i) => i.area === area);
        return (
          <section key={area} aria-labelledby={`${area}-heading`} className="mt-8">
            <h2 id={`${area}-heading`} className="text-xl">{NAV_AREA_LABELS[area]} <span className="text-sm font-normal text-ink-600">({rows.length} of {NAV_LIMITS[area]})</span></h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">{area === "header" ? "None yet: the built-in menu is shown." : "None yet: no extra footer links are shown."}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {rows.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-cream-200 bg-cream-50 p-3">
                    <div className="min-w-0">
                      <p className="font-medium"><Link href={`/admin/navigation/${r.id}`} className="underline-offset-2 hover:underline">{r.label}</Link>{!r.isActive && <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 text-xs font-normal text-coral-600">Hidden</span>}</p>
                      <p className="truncate text-xs text-ink-600">{r.href}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={moveNavItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="direction" value="up" /><button type="submit" className={small} disabled={i === 0} aria-label={`Move ${r.label} up`}>↑ Up</button></form>
                      <form action={moveNavItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="direction" value="down" /><button type="submit" className={small} disabled={i === rows.length - 1} aria-label={`Move ${r.label} down`}>↓ Down</button></form>
                      <form action={toggleNavItemAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="enable" value={r.isActive ? "0" : "1"} /><button type="submit" className={small}>{r.isActive ? "Hide" : "Show"}</button></form>
                      <Link href={`/admin/navigation/${r.id}`} className={small}>Edit</Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      <section aria-labelledby="add-heading" className="mt-10 border-t border-cream-200 pt-6">
        <h2 id="add-heading" className="mb-4 text-xl">Add a link</h2>
        <NavForm mode="create" action={createNavItemAction} initial={{ area: "header", label: "", href: "", isActive: true }} areas={NAV_AREAS.map((a) => ({ value: a, label: NAV_AREA_LABELS[a] }))} cancelHref="/admin/navigation" />
      </section>
    </>
  );
}
