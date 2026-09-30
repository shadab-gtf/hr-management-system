"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "native-prompt" | "ios" | "installed" | "unsupported";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Wraps `beforeinstallprompt` (Chrome/Edge/Android) and iOS "Add to Home Screen". */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");

  useEffect(() => {
    const detect = () => setPlatform(isStandalone() ? "installed" : isIos() ? "ios" : "unsupported");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setPlatform("native-prompt");
    };
    const onInstalled = () => {
      setDeferred(null);
      setPlatform("installed");
    };
    // Defer the initial detection so SSR markup and first client render match.
    const timer = window.setTimeout(detect, 0);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  return { platform, canPrompt: Boolean(deferred), install };
}
