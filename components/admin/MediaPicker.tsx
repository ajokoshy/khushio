import { Img } from "@/components/Img";
import { recentMedia } from "@/lib/data/media";

/**
 * Pick an image from the media library without any client JavaScript: a native <details> with radio buttons.
 * Thumbnails use the smallest delivery width, so they reuse files that already exist (no extra Cloudinary transformations).
 */
export async function MediaPicker({ name = "media_id", value, label = "Image" }: { name?: string; value?: string | null; label?: string }) {
  const items = await recentMedia(36);
  return (
    <fieldset className="text-sm"><legend className="font-medium">{label}</legend>
      <details className="mt-1 rounded-lg border border-sand bg-white p-3" open={!!value && !items.some((m) => m.id === value) ? false : undefined}>
        <summary className="cursor-pointer text-forest underline">Choose from the media library ({items.length}{items.length === 36 ? "+" : ""} recent)</summary>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <label className="flex flex-col items-center gap-1 rounded border border-sand p-2 text-xs"><input type="radio" name={name} value="" defaultChecked={!value} />No image</label>
          {items.map((m) => (<label key={m.id} className="flex flex-col items-center gap-1 rounded border border-sand p-1 text-xs has-[:checked]:border-forest has-[:checked]:ring-2 has-[:checked]:ring-forest/30">
            <Img src={m.publicId} alt={m.alt} width={320} height={320} originalWidth={m.width} sizes="96px" className="h-20 w-full rounded object-cover" /><input type="radio" name={name} value={m.id} defaultChecked={value === m.id} aria-label={m.alt || m.publicId} /></label>))}
        </div>
        {!items.length && <p className="mt-2 text-xs text-ink/60">The library is empty.</p>}
        <p className="mt-3 text-xs text-ink/60">Not there yet? <a className="underline" href="/admin/media" target="_blank" rel="noopener">Upload it in the media library</a>, then reload this page.</p>
      </details>
    </fieldset>
  );
}
