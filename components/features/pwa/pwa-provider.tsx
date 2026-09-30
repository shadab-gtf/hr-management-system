"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Registers the service worker (production only, so dev HMR is unaffected),
 * offers a safe update when a new version is waiting, and shows a persistent
 * offline banner. Sensitive commands stay server-validated regardless.
 */
export function PwaProvider() {
  const online = useOnlineStatus();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const offerUpdate = (worker: ServiceWorker) =>
      toast("A new version of GTF HR is ready", {
        description: "Update now — your work in progress stays on this page until you reload.",
        duration: Infinity,
        action: { label: "Update", onClick: () => worker.postMessage("SKIP_WAITING") },
      });
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
          });
        });
      })
      .catch(() => undefined);
    // First install also fires controllerchange (clients.claim); never reload for that.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    const onController = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <AppIcon name="warning" size={16} />
      You’re offline. Balances and attendance may be out of date; actions are paused until you reconnect.
    </div>
  );
}
