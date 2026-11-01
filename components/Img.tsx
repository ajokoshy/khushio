import { imgUrl, srcSet, snapWidth } from "@/lib/media/delivery";

/**
 * The one way to show an image. Plain <img>, never next/image: images are already optimised and cached by Cloudinary,
 * so routing them through Vercel Image Optimization would bill the same work twice.
 * Width and height are always set (no layout shift); everything except the first screen is lazy.
 */
export function Img({ src, alt, width, height, sizes, priority = false, className, originalWidth }: {
  src: string; alt: string; width: number; height: number; sizes?: string; priority?: boolean; className?: string; originalWidth?: number | null;
}) {
  return (
    <img src={imgUrl(src, snapWidth(width))} srcSet={srcSet(src, originalWidth)} sizes={sizes ?? `(min-width: 1024px) ${width}px, 100vw`} alt={alt} width={width} height={height}
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className={className} />
  );
}
