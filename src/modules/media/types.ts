export type MediaRow = {
  id: string;
  publicId: string;
  contentHash: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt: string | null;
  createdAt: Date;
};

export type MediaListRow = MediaRow & { usedBy: number };

/** Release 7A: "no-alt" lists pictures with no description (alt text), which search engines and screen readers need. */
export type MediaUsageFilter = "all" | "unused" | "no-alt";

/** A validated Cloudinary upload, ready to be recorded. */
export type MediaWrite = {
  publicId: string;
  contentHash: string | null;
  width: number;
  height: number;
  bytes: number;
  alt: string | null;
};
