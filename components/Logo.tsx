import Link from "next/link";
import { site } from "@/lib/config/site";

/** Text-based logo (no baked image). Wordmark plus the terracotta smile from the brand mark. */
export function Logo({ size = "md", tagline = false }: { size?: "md" | "lg"; tagline?: boolean }) {
  const text = size === "lg" ? "text-5xl" : "text-3xl";
  return (
    <Link href="/" aria-label={`${site.name} home`} className="inline-flex flex-col leading-none">
      <span className={`relative font-display font-bold tracking-tight text-forest ${text}`}>
        {site.name}
        <svg aria-hidden viewBox="0 0 40 12" className="absolute -bottom-2 right-0 h-2.5 w-[18%] text-terracotta" fill="none">
          <path d="M2 2c5 8 31 8 36 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
      {tagline && <span className="mt-3 text-sm tracking-wide text-forest/80">{site.tagline}</span>}
    </Link>
  );
}
