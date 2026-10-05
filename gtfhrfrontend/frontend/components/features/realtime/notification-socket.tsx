"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { notificationSnapshotAction } from "@/lib/actions/realtime";

const POLL_INTERVAL_MS = 30_000;

/** Refreshes the server-rendered inbox without exposing credentials to the browser. */
export function NotificationSocket({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: Map<string, boolean> | null = null;
    let failures = 0;

    const schedule = () => {
      if (!disposed && document.visibilityState === "visible")
        timer = setTimeout(() => { void poll(); }, Math.min(POLL_INTERVAL_MS * 2 ** failures, 300_000));
    };
    async function poll() {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const snapshot = await notificationSnapshotAction();
        if (disposed || snapshot === null) return;
        if (previous !== null) {
          const fresh = snapshot.filter((item) => !item.read && !previous?.has(item.id));
          for (const item of fresh.slice(0, 3)) toast(item.title, {
            id: item.id,
            action: { label: "View", onClick: () => { routerRef.current.push("/notifications"); } },
          });
          if (snapshot.length !== previous.size || snapshot.some((item) => previous?.get(item.id) !== item.read))
            routerRef.current.refresh();
        }
        previous = new Map(snapshot.map((item) => [item.id, item.read]));
        failures = 0;
      } catch {
        failures = Math.min(failures + 1, 4);
      } finally {
        inFlight = false;
        schedule();
      }
    }
    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return null;
}
