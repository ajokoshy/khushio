"use client";

import { useEffect, useRef, useState } from "react";
import { buildImageUrl } from "@/infrastructure/cloudinary/images";
import type { UploadSignature } from "@/infrastructure/cloudinary";
import type { DataResult } from "@/shared/admin/action-helpers";

export type PickerImage = { publicId: string; alt: string; width: number; height: number };

export type PickerActions = {
  search: (query: string) => Promise<DataResult<PickerImage[]>>;
  sign: () => Promise<DataResult<UploadSignature>>;
  record: (upload: unknown, alt: string) => Promise<DataResult<PickerImage>>;
};

type Props = PickerActions & {
  cloudName: string;
  uploadsEnabled: boolean;
  maxMegabytes?: number;
  onPick: (image: PickerImage) => void;
  onClose: () => void;
};

const input = "rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm";

/** Choose a picture from the media library, or upload a new one (the same signed browser upload the product screen uses). */
export function ImagePicker({ cloudName, uploadsEnabled, maxMegabytes = 5, search, sign, record, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await search(query);
      if (!current) return;
      setLoading(false);
      if (result.ok) {
        setItems(result.data);
        setMessage(null);
      } else setMessage(result.error);
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  async function upload() {
    setMessage(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose an image first.");
    if (file.size > maxMegabytes * 1024 * 1024) return setMessage(`The image is larger than ${maxMegabytes} MB.`);
    setBusy(true);
    try {
      const signed = await sign();
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
      const saved = await record(json, alt);
      if (!saved.ok) return setMessage(saved.error);
      onPick({ ...saved.data, alt: saved.data.alt || alt });
    } catch {
      setMessage("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-label="Choose a picture" className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">Choose a picture</h3>
        <button type="button" onClick={onClose} className="text-sm text-ink-600 underline">Close</button>
      </div>
      <label htmlFor="picker-search" className="sr-only">Search the library</label>
      <input id="picker-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library by file name or description" className={`mt-3 w-full ${input}`} />
      {message && <p role="alert" className="mt-3 rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{message}</p>}
      <ul className="mt-3 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" aria-busy={loading}>
        {items.map((m) => (
          <li key={m.publicId}>
            <button type="button" onClick={() => onPick(m)} className="block w-full overflow-hidden rounded-xl border border-cream-200 hover:border-forest-800 focus-visible:outline focus-visible:outline-2" aria-label={`Use ${m.alt || m.publicId}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={buildImageUrl(cloudName, m.publicId, "thumbnail")} alt="" width={160} height={160} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          </li>
        ))}
        {!loading && items.length === 0 && <li className="col-span-full text-sm text-ink-600">No pictures found.</li>}
      </ul>
      <div className="mt-4 border-t border-cream-200 pt-4">
        <p className="text-sm font-medium">Or upload a new picture</p>
        {uploadsEnabled ? (
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="picker-file" className="block text-xs text-ink-600">Picture (JPG, PNG or WebP, up to {maxMegabytes} MB)</label>
              <input id="picker-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 text-sm" />
            </div>
            <div className="min-w-48 flex-1">
              <label htmlFor="picker-alt" className="block text-xs text-ink-600">Description for people who cannot see it</label>
              <input id="picker-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} className={`mt-1 w-full ${input}`} />
            </div>
            <button type="button" onClick={upload} disabled={busy} className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-60">{busy ? "Uploading…" : "Upload and use"}</button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-600">Uploads are switched off because Cloudinary is not configured in this environment. You can still choose pictures already in the library.</p>
        )}
      </div>
    </div>
  );
}
