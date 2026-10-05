"use client";

import { useEffect, useState } from "react";

export type PermissionKind = "geolocation" | "notifications" | "camera";
export type PermissionStatus = "unsupported" | "prompt" | "granted" | "denied" | "unknown";

function supported(kind: PermissionKind): boolean {
  if (typeof window === "undefined") return false;
  if (kind === "geolocation") return "geolocation" in navigator;
  if (kind === "notifications") return "Notification" in window;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Observes a browser permission WITHOUT requesting it. Requests happen only in
 * the specific action that needs the capability (mobile-native-web.md).
 */
export function usePermissionState(kind: PermissionKind) {
  const [status, setStatus] = useState<PermissionStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    let source: globalThis.PermissionStatus | null = null;
    const sync = (value: PermissionStatus) => {
      if (!cancelled) setStatus(value);
    };
    const onChange = () => source && sync(source.state as PermissionStatus);

    if (!supported(kind)) sync("unsupported");
    else if (kind === "notifications" && Notification.permission !== "default") sync(Notification.permission as PermissionStatus);
    else if (navigator.permissions?.query) {
      const name = (kind === "notifications" ? "notifications" : kind) as PermissionName;
      navigator.permissions
        .query({ name })
        .then((result) => {
          source = result;
          sync(result.state as PermissionStatus);
          result.addEventListener("change", onChange);
        })
        .catch(() => sync("prompt"));
    } else sync("prompt");

    return () => {
      cancelled = true;
      source?.removeEventListener("change", onChange);
    };
  }, [kind]);

  return { status, setStatus };
}
