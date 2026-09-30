"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraError = "unsupported" | "denied" | "unavailable";

/**
 * Camera stream started only by an explicit user action. Tracks are always
 * stopped on close/unmount so the camera light never stays on.
 */
export function useCamera() {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [error, setError] = useState<CameraError | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async (facingMode: "user" | "environment" = "user") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      setStatus("error");
      return;
    }
    setStatus("starting");
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => undefined);
      }
      setStatus("live");
    } catch (failure) {
      const name = failure instanceof DOMException ? failure.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      setStatus("error");
    }
  }, []);

  /** Square JPEG snapshot of the current frame. */
  const capture = useCallback(async (): Promise<File | null> => {
    const element = video.current;
    if (!element || !element.videoWidth) return null;
    const size = Math.min(element.videoWidth, element.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(size, 800);
    canvas.height = canvas.width;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(element, (element.videoWidth - size) / 2, (element.videoHeight - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
  }, []);

  // The stream may arrive before the <video> mounts (sheet animation); attach late.
  useEffect(() => {
    const element = video.current;
    if (status === "live" && element && stream.current && element.srcObject !== stream.current) {
      element.srcObject = stream.current;
      void element.play().catch(() => undefined);
    }
  }, [status]);

  useEffect(() => stop, [stop]);

  return { video, status, error, start, stop, capture };
}
