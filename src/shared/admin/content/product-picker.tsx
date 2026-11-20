"use client";

import { useEffect, useState } from "react";
import type { DataResult } from "@/shared/admin/action-helpers";

export type ProductPickerItem = { id: string; name: string; brandName: string | null; status: string };
export type ProductSearch = (query: string) => Promise<DataResult<ProductPickerItem[]>>;

const input = "rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-sm";

/** Search the catalogue and choose the product to embed. Only the id is stored in the article. */
export function ProductPicker({ search, onPick, onClose }: { search: ProductSearch; onPick: (item: ProductPickerItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="product-picker-q" className="block text-xs text-ink-600">Search products by name</label>
          <input id="product-picker-q" value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} mt-1 w-full`} autoComplete="off" />
        </div>
        <button type="button" onClick={onClose} className="text-sm text-ink-600 underline">Close</button>
      </div>
      {message && <p role="alert" className="text-sm text-coral-600">{message}</p>}
      {loading ? (
        <p className="text-sm text-ink-600">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-600">No products found.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-cream-200 overflow-auto rounded-xl border border-cream-200 bg-white">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-forest-100">
                <span><span className="font-medium">{p.name}</span>{p.brandName && <span className="text-ink-600"> · {p.brandName}</span>}</span>
                <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">{p.status === "PUBLISHED" ? "Live" : p.status.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-600">A product that is not live yet stays hidden in the article until it is published.</p>
    </div>
  );
}
