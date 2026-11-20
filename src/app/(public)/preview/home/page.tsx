import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { env } from "@/core/config/env";
import { hasPermission, PERMISSIONS as P } from "@/core/permissions";
import { getHomepagePreview } from "@/modules/homepage/service";
import { verifyPreviewToken } from "@/modules/homepage/preview";
import { HomepagePreview } from "@/shared/homepage/sections";

// Never cached and never indexed: it shows sections visitors can not see.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Homepage preview", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/**
 * Release 6B. Needs BOTH a valid signed link (made on Admin > Homepage, good for an hour) and a signed-in person with
 * homepage:write. Anyone else gets the same 404 as a page that does not exist, so the preview's existence is not revealed.
 */
export default async function HomePreviewPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || !hasPermission(session.user.permissions, P.homepageWrite)) notFound();
  const secret = env.AUTH_SECRET;
  const raw = (await searchParams).token;
  const check = secret ? verifyPreviewToken(secret, Array.isArray(raw) ? raw[0] : raw) : "invalid";
  if (check === "invalid") notFound();
  if (check === "expired") {
    return (
      <section className="mx-auto max-w-prose px-4 py-12">
        <h1 className="text-2xl">This preview link has expired</h1>
        <p className="mt-2 text-ink-600">Open the preview again from <Link href="/admin/homepage" className="text-coral-600 underline">Admin, Homepage</Link>.</p>
      </section>
    );
  }
  const sections = await getHomepagePreview();
  return (
    <>
      <p role="status" className="bg-coral-100 px-4 py-2 text-center text-sm text-coral-600">
        Preview for editors. Sections switched off or not yet live are shown with a label; visitors do not see them. <Link href="/admin/homepage" className="underline">Back to Admin</Link>
      </p>
      {sections.length > 0 ? <HomepagePreview sections={sections} /> : <p className="mx-auto max-w-6xl px-4 py-12 text-ink-600">There are no sections yet. Add some under Admin, Homepage.</p>}
    </>
  );
}
