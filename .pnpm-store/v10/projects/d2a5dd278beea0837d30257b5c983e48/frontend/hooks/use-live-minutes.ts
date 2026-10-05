"use client";

import { useEffect, useState } from "react";

/**
 * Minutes elapsed since `since`, refreshed every 30s while `active`.
 * Starts from the server-rendered value so hydration matches.
 */
export function useLiveMinutes(since: string | null, active: boolean, serverMinutes: number): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!active || !since || now === null) return serverMinutes;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 60_000));
}
