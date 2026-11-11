"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };
type ToastFn = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const tones: Record<Tone, string> = {
  success: "bg-forest-800 text-cream-50",
  error: "bg-coral-600 text-cream-50",
  info: "bg-cream-50 text-forest-800 border border-cream-200",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const toast = useCallback<ToastFn>((message, tone = "info") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, tone }]);
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(timer);
    }, 5000);
    timers.current.add(timer);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <p key={t.id} className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lg ${tones[t.tone]}`}>{t.message}</p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
