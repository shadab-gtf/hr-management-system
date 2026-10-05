"use client";

import { useCallback, useState } from "react";

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}
export type GeoError = "unsupported" | "denied" | "unavailable" | "timeout";

/**
 * One-shot location read, triggered by a user action (e.g. "Check in").
 * No watchPosition, no background tracking — ever.
 */
export function useGeolocation() {
  const [state, setState] = useState<{ status: "idle" | "locating" | "ready" | "error"; reading: GeoReading | null; error: GeoError | null }>({
    status: "idle",
    reading: null,
    error: null,
  });

  const locate = useCallback(
    () =>
      new Promise<GeoReading>((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          setState({ status: "error", reading: null, error: "unsupported" });
          reject(new Error("unsupported"));
          return;
        }
        setState((current) => ({ ...current, status: "locating", error: null }));
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const reading = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: Math.round(position.coords.accuracy),
              capturedAt: new Date(position.timestamp).toISOString(),
            };
            setState({ status: "ready", reading, error: null });
            resolve(reading);
          },
          (failure) => {
            const error: GeoError = failure.code === failure.PERMISSION_DENIED ? "denied" : failure.code === failure.TIMEOUT ? "timeout" : "unavailable";
            setState({ status: "error", reading: null, error });
            reject(new Error(error));
          },
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
        );
      }),
    [],
  );

  return { ...state, locate };
}
