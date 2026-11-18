"use client";

import { useState } from "react";
import { buildImageUrl } from "@/infrastructure/cloudinary/images";
import { FormField, inputClass } from "@/shared/admin/form-field";
import { ImagePicker, type PickerActions, type PickerImage } from "./image-picker";

type Props = PickerActions & {
  initialPublicId: string;
  initialAlt: string;
  cloudName: string | null;
  uploadsEnabled: boolean;
  error?: string;
};

/** The article's cover picture: chosen from the media library (or uploaded), with its description. */
export function CoverField({ initialPublicId, initialAlt, cloudName, uploadsEnabled, error, search, sign, record }: Props) {
  const [publicId, setPublicId] = useState(initialPublicId);
  const [alt, setAlt] = useState(initialAlt);
  const [picking, setPicking] = useState(false);

  function pick(image: PickerImage) {
    setPublicId(image.publicId);
    if (!alt && image.alt) setAlt(image.alt);
    setPicking(false);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="coverPublicId" value={publicId} />
      <p className="text-sm font-medium">Cover picture</p>
      {error && <p role="alert" className="text-sm text-coral-600">{error}</p>}
      {publicId && cloudName ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={buildImageUrl(cloudName, publicId, "card")} alt="" width={240} className="h-auto w-60 max-w-full rounded-xl border border-cream-200" />
      ) : (
        <p className="text-sm text-ink-600">No cover picture.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!cloudName} onClick={() => setPicking(true)} className="rounded-xl border border-forest-800 px-3 py-2 text-sm font-medium hover:bg-forest-100 disabled:opacity-50">{publicId ? "Change picture" : "Choose picture"}</button>
        {publicId && <button type="button" onClick={() => { setPublicId(""); setAlt(""); }} className="text-sm text-ink-600 underline">Remove</button>}
      </div>
      {picking && cloudName && <ImagePicker cloudName={cloudName} uploadsEnabled={uploadsEnabled} search={search} sign={sign} record={record} onPick={pick} onClose={() => setPicking(false)} />}
      {publicId && (
        <FormField label="Cover description" htmlFor="coverAlt" hint="For people who cannot see the picture. Empty uses the title.">
          <input id="coverAlt" name="coverAlt" maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} className={inputClass} />
        </FormField>
      )}
    </div>
  );
}
