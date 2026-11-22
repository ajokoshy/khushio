import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { excerptFrom } from "@/modules/content/document";
import { getVisiblePage } from "@/modules/content/public";
import { buildMetadata, notFoundMetadata } from "@/modules/seo/metadata";
import { Breadcrumbs } from "@/shared/catalog/breadcrumbs";
import { DocumentRenderer } from "@/shared/content/document-renderer";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getVisiblePage((await params).slug);
  if (!found) return notFoundMetadata("Page");
  return buildMetadata({ title: found.title, description: excerptFrom(found.content), path: `/p/${found.slug}`, override: found.seo });
}

export default async function StandalonePage({ params }: Props) {
  const found = await getVisiblePage((await params).slug);
  if (!found) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: found.title }]} />
      <h1 className="mt-4 text-4xl leading-tight">{found.title}</h1>
      <div className="mt-8"><DocumentRenderer doc={found.content} /></div>
    </article>
  );
}
