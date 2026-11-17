"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isWindowOpen } from "@/modules/deals/window";

/**
 * Hides its content once the offer's end time has passed, using the visitor's own clock (Release 5A). Product and store
 * pages are cached for up to 30 minutes, so without this a page built just before an offer ended would still show it.
 * The server already left out ended offers when it built the page; this closes the gap while the page stays open.
 */
export function LiveWindow({ startsAt, endsAt, children }: { startsAt: string; endsAt: string | null; children: ReactNode }) {
  const [live, setLive] = useState(true);
  useEffect(() => {
    const check = () => setLive(isWindowOpen(startsAt, endsAt, new Date()));
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [startsAt, endsAt]);
  return live ? <>{children}</> : null;
}
