import { imageSrcSet, imageUrl, type ImageProfile } from "@/infrastructure/cloudinary";

type Props = {
  publicId: string | null;
  alt: string;
  /** Sizes offered to the browser (width descriptors). */
  profiles: readonly ImageProfile[];
  /** The src fallback. */
  fallback: ImageProfile;
  sizes: string;
  width: number;
  height: number;
  /** True only for the one image that is the largest thing on screen (it loads first). All others load lazily. */
  priority?: boolean;
  className?: string;
};

/** A Cloudinary image with srcset, explicit dimensions (no layout jump) and lazy loading; a calm placeholder when there is none. */
export function ProductImage({ publicId, alt, profiles, fallback, sizes, width, height, priority = false, className = "" }: Props) {
  const src = publicId ? imageUrl(publicId, fallback) : null;
  if (!publicId || !src) {
    return (
      <div role="img" aria-label={alt || "No image available"} style={{ aspectRatio: `${width} / ${height}` }} className={`flex items-center justify-center bg-cream-200 text-sm text-ink-600 ${className}`}>
        No image
      </div>
    );
  }
  return (
    // Cloudinary already resizes and converts the file for each width in srcset; next/image would add a second pass.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={imageSrcSet(publicId, profiles) ?? undefined}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      className={className}
    />
  );
}
