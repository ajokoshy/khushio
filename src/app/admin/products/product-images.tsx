"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { inputClass } from "@/shared/admin/form-field";
import { useToast } from "@/shared/admin/toast";
import { addProductImageAction, getUploadSignatureAction, moveProductImageAction, removeProductImageAction, updateProductImageAltAction } from "./actions";

export type ImageItem = { id: string; alt: string; thumbUrl: string | null };

type Props = {
  productId: string;
  images: ImageItem[];
  /** False when the Cloudinary variables are missing: uploads are switched off and the screen says why. */
  uploadsEnabled: boolean;
  maxImages: number;
  maxMegabytes: number;
  accept: string;
};

/**
 * Image manager for one product. The file goes from the browser straight to Cloudinary with a signature the
 * server created (the API secret never reaches the browser); the server then verifies the result before saving it.
 */
export function ProductImages({ productId, images, uploadsEnabled, maxImages, maxMegabytes, accept }: Props) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const full = images.length >= maxImages;

  async function upload() {
    setMessage(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose an image first.");
    if (file.size > maxMegabytes * 1024 * 1024) return setMessage(`The image is larger than ${maxMegabytes} MB.`);

    setBusy(true);
    try {
      const signed = await getUploadSignatureAction();
      if (!signed.ok) return setMessage(signed.error);
      const s = signed.data;

      const body = new FormData();
      body.append("file", file);
      body.append("api_key", s.apiKey);
      body.append("timestamp", String(s.timestamp));
      body.append("signature", s.signature);
      body.append("folder", s.folder);
      body.append("allowed_formats", s.allowedFormats);

      const response = await fetch(s.uploadUrl, { method: "POST", body });
      const json = (await response.json().catch(() => null)) as (Record<string, unknown> & { error?: { message?: string } }) | null;
      if (!response.ok || !json || json.error) return setMessage(json?.error?.message ?? "The upload failed. Try again.");

      const result = await addProductImageAction(productId, json, alt);
      if (!result.ok) return setMessage(result.error);
      toast(result.message ?? "Image added.", "success");
      setAlt("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setMessage("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const saveAlt = (imageId: string, value: string) =>
    startTransition(async () => {
      const result = await updateProductImageAltAction(productId, imageId, value);
      if (!result.ok) return toast(result.error, "error");
      toast(result.message ?? "Saved.", "success");
      router.refresh();
    });

  const move = (imageId: string, direction: "up" | "down") =>
    startTransition(async () => {
      const result = await moveProductImageAction(productId, imageId, direction);
      if (!result.ok) return toast(result.error, "error");
      router.refresh();
    });

  return (
    <section className="mt-10 max-w-3xl border-t border-cream-200 pt-6" aria-labelledby="images-heading">
      <h2 id="images-heading" className="text-xl">Images</h2>
      <p className="mt-1 text-sm text-ink-600">The first image is the main picture and the one on product cards. Up to {maxImages} images, {maxMegabytes} MB each.</p>

      {images.length === 0 ? (
        <p className="mt-4 text-sm text-ink-600">No images yet. A product needs at least one before it can be published.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {images.map((image, index) => (
            <ImageRow key={image.id} image={image} first={index === 0} last={index === images.length - 1} disabled={pending} onSaveAlt={saveAlt} onMove={move}>
              <ConfirmActionButton
                label="Remove"
                destructive
                title="Remove this image from the product?"
                description="The file stays in the media library, so you can use it again or delete it there."
                action={removeProductImageAction.bind(null, productId, image.id)}
              />
            </ImageRow>
          ))}
        </ul>
      )}

      {!uploadsEnabled ? (
        <p role="status" className="mt-6 rounded-xl bg-coral-100 px-4 py-3 text-sm text-coral-600">
          Image uploads are switched off because Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in this environment.
        </p>
      ) : full ? (
        <p className="mt-6 text-sm text-ink-600">This product has the maximum of {maxImages} images. Remove one to add another.</p>
      ) : (
        <div className="mt-6 space-y-3 rounded-xl border border-cream-200 bg-cream-50 p-4">
          <p className="text-sm font-medium">Add an image</p>
          <div>
            <label htmlFor="image-file" className="sr-only">Image file</label>
            <input id="image-file" ref={fileRef} type="file" accept={accept} className="block w-full text-sm" />
          </div>
          <div>
            <label htmlFor="image-alt" className="text-sm">Description for people who cannot see the image</label>
            <input id="image-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} className={`${inputClass} mt-1`} placeholder="Leave empty to use the product name" />
          </div>
          <button type="button" onClick={upload} disabled={busy} className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-60">
            {busy ? "Uploading…" : "Upload image"}
          </button>
          {message && <p role="alert" className="text-sm text-coral-600">{message}</p>}
        </div>
      )}
    </section>
  );
}

function ImageRow({
  image, first, last, disabled, onSaveAlt, onMove, children,
}: {
  image: ImageItem;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onSaveAlt: (id: string, alt: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  children: React.ReactNode;
}) {
  const [alt, setAlt] = useState(image.alt);
  return (
    <li className="flex flex-wrap items-start gap-4 rounded-xl border border-cream-200 bg-cream-50 p-3">
      {image.thumbUrl ? (
        // Cloudinary already serves a small, optimised file; next/image would add nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.thumbUrl} alt={image.alt} width={80} height={80} loading="lazy" className="h-20 w-20 rounded-lg object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-cream-200 text-xs text-ink-600">No preview</div>
      )}
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={`alt-${image.id}`} className="text-sm font-medium">Description</label>
        <div className="mt-1 flex gap-2">
          <input id={`alt-${image.id}`} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} className={inputClass} />
          <button type="button" disabled={disabled || alt === image.alt} onClick={() => onSaveAlt(image.id, alt)} className="rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100 disabled:opacity-50">Save</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled || first} onClick={() => onMove(image.id, "up")} className="rounded-xl border border-cream-200 px-3 py-1.5 text-sm hover:bg-forest-100 disabled:opacity-40" aria-label="Move image up">Move up</button>
          <button type="button" disabled={disabled || last} onClick={() => onMove(image.id, "down")} className="rounded-xl border border-cream-200 px-3 py-1.5 text-sm hover:bg-forest-100 disabled:opacity-40" aria-label="Move image down">Move down</button>
          {children}
        </div>
      </div>
    </li>
  );
}
