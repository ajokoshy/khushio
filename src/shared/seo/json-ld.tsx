import { serializeJsonLd, type JsonLd } from "@/modules/seo/jsonld";

/** Writes structured data into the page. Null entries are skipped, so a builder that decides "nothing to say" simply renders nothing. */
export function JsonLdScript({ data }: { data: JsonLd | null | readonly (JsonLd | null)[] }) {
  const list = (Array.isArray(data) ? data : [data]).filter((d): d is JsonLd => d !== null);
  if (list.length === 0) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(list.length === 1 ? (list[0] as JsonLd) : list) }} />;
}
