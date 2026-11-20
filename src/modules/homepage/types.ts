import type { CatalogCard, CollectionTile } from "@/modules/catalog/types";
import type { PublicArticleSummary } from "@/modules/content/types";
import type { PublicDeal } from "@/modules/deals/types";
import type { CollectionsConfig, GuidesConfig, HeroConfig, PromoConfig, SectionType } from "./config";

/** A row of homepage_sections as the admin and the builder read it. `config` is unvalidated JSON until parseSectionConfig has seen it. */
export type SectionRow = {
  id: string;
  type: SectionType;
  heading: string | null;
  config: unknown;
  sortOrder: number;
  isEnabled: boolean;
  publishAt: Date | null;
  createdAt: Date;
};

export type SectionWrite = { type: SectionType; heading: string | null; config: unknown; isEnabled: boolean; publishAt: Date | null };

/** Where a section stands for visitors, by the clock. */
export type SectionState = "live" | "scheduled" | "off";

export const SECTION_STATE_LABELS: Record<SectionState, string> = { live: "Live", scheduled: "Scheduled", off: "Switched off" };

type Base = { id: string; heading: string | null };

/** A section with its data loaded, ready for the registered component of its type. */
export type ResolvedSection =
  | (Base & { type: "hero_banner"; config: HeroConfig })
  | (Base & { type: "featured_categories"; categories: { slug: string; name: string; description: string | null }[] })
  | (Base & { type: "trending_products"; cards: CatalogCard[] })
  | (Base & { type: "deals"; deals: PublicDeal[] })
  | (Base & { type: "collections"; tiles: CollectionTile[]; config: CollectionsConfig })
  | (Base & { type: "guides"; articles: PublicArticleSummary[]; config: GuidesConfig })
  | (Base & { type: "promo_banner"; config: PromoConfig });

/** One section of the preview: the loaded section (or null when it has nothing to show or its config is invalid) and why. */
export type PreviewSection = { id: string; type: SectionType; heading: string | null; state: SectionState; publishAt: Date | null; section: ResolvedSection | null; problem: string | null };

