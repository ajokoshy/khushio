import Link from "next/link";
import { env } from "@/core/config/env";
import { PERMISSIONS as P } from "@/core/permissions";
import { requirePagePermission } from "@/core/permissions/require";
import { formatAdminDateTime } from "@/core/validation/datetime";
import { MAX_SECTIONS, SECTION_LABELS, SECTION_TYPES } from "@/modules/homepage/config";
import { signPreviewToken } from "@/modules/homepage/preview";
import { listSections, sectionState } from "@/modules/homepage/service";
import { SECTION_STATE_LABELS } from "@/modules/homepage/types";
import { EmptyState } from "@/shared/admin/empty-state";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { Notice } from "@/shared/admin/notice";
import { createStarterLayoutAction, moveSectionAction, refreshHomepageAction, toggleSectionAction } from "./actions";

export const metadata = { title: "Homepage", robots: { index: false } };

const stateClass = { live: "bg-forest-100", scheduled: "bg-cream-200", off: "bg-coral-100 text-coral-600" } as const;
const small = "rounded-lg border border-cream-200 px-2.5 py-1 text-xs hover:bg-forest-100 disabled:opacity-40";

export default async function HomepageAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(P.homepageWrite);
  const sp = await searchParams;
  const sections = await listSections();
  const now = new Date();
  const previewHref = env.AUTH_SECRET ? `/preview/home?token=${signPreviewToken(env.AUTH_SECRET, now)}` : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Homepage</h1>
          <p className="mt-2 max-w-prose text-ink-600">The sections of the home page, from top to bottom. Changes show on the site at once; sections that have nothing to show (no offers, no products) are left out by themselves.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {previewHref ? <a href={previewHref} target="_blank" rel="noopener" className="rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100">Open preview</a> : <span className="text-sm text-ink-600">Preview needs AUTH_SECRET.</span>}
          <Link href="/admin/navigation" className="rounded-xl border border-forest-800 px-4 py-2.5 text-sm font-medium hover:bg-forest-100">Navigation</Link>
        </div>
      </div>

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        {sections.length === 0 ? (
          <EmptyState
            title="The homepage has no sections yet"
            description="Visitors see the Khushio brand banner only. Create the starter layout (banner, categories, trending products, deals, guides) and adjust it, or add sections one by one."
            action={<form action={createStarterLayoutAction}><button type="submit" className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">Create the starter layout</button></form>}
          />
        ) : (
          <ol className="space-y-3">
            {sections.map((s, i) => {
              const state = sectionState(s, now);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-cream-200 bg-cream-50 p-4">
                  <div className="min-w-0">
                    <p className="font-medium"><Link href={`/admin/homepage/${s.id}`} className="underline-offset-2 hover:underline">{SECTION_LABELS[s.type]}</Link>{s.heading && <span className="font-normal text-ink-600"> · {s.heading}</span>}</p>
                    <p className="mt-1 text-xs text-ink-600">
                      <span className={`rounded-full px-2 py-0.5 ${stateClass[state]}`}>{SECTION_STATE_LABELS[state]}</span>
                      {s.publishAt && <span className="ml-2">{state === "scheduled" ? "Goes live" : "Live since"} {formatAdminDateTime(s.publishAt)}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="direction" value="up" /><button type="submit" className={small} disabled={i === 0} aria-label={`Move ${SECTION_LABELS[s.type]} up`}>↑ Up</button></form>
                    <form action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="direction" value="down" /><button type="submit" className={small} disabled={i === sections.length - 1} aria-label={`Move ${SECTION_LABELS[s.type]} down`}>↓ Down</button></form>
                    <form action={toggleSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="enable" value={s.isEnabled ? "0" : "1"} /><button type="submit" className={small}>{s.isEnabled ? "Switch off" : "Switch on"}</button></form>
                    <Link href={`/admin/homepage/${s.id}`} className={small}>Edit</Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <section aria-labelledby="add-heading" className="mt-10 border-t border-cream-200 pt-6">
        <h2 id="add-heading" className="text-xl">Add a section</h2>
        <p className="mt-1 text-sm text-ink-600">{sections.length >= MAX_SECTIONS ? `The homepage is full (${MAX_SECTIONS} sections). Delete one to add another.` : "New sections go to the bottom. Use Up and Down to place them."}</p>
        {sections.length < MAX_SECTIONS && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {SECTION_TYPES.map((t) => <li key={t}><Link href={`/admin/homepage/new?type=${t}`} className="rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100">{SECTION_LABELS[t]}</Link></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="refresh-heading" className="mt-10 border-t border-cream-200 pt-6">
        <h2 id="refresh-heading" className="text-xl">Refresh now</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-600">Every change above already refreshes the page. Use this after changing products, deals or guides if you want the homepage rebuilt right away instead of within its 10-minute window.</p>
        <form action={refreshHomepageAction} className="mt-3"><button type="submit" className="rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100">Refresh the homepage</button></form>
      </section>
    </>
  );
}
