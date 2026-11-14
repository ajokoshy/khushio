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

export type MediaUsageFilter = "all" | "unused";

/** A validated Cloudinary upload, ready to be recorded. */
export type MediaWrite = {
  publicId: string;
  contentHash: string | null;
  width: number;
  height: number;
  bytes: number;
  alt: string | null;
};
