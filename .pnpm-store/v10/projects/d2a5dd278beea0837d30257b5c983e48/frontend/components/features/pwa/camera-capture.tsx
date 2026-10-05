"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Sheet } from "@/components/ui/sheet";
import { useCamera } from "@/hooks/use-camera";
import { useDisclosure } from "@/hooks/use-disclosure";

/**
 * In-app camera. The permission prompt appears only after the user taps
 * "Take photo"; the stream stops as soon as the sheet closes.
 */
export function CameraCapture({ onCapture, facingMode = "user", label = "Take photo" }: { onCapture: (file: File) => void; facingMode?: "user" | "environment"; label?: string }) {
  const sheet = useDisclosure();
  const { video, status, error, start, stop, capture } = useCamera();

  const close = () => {
    stop();
    sheet.hide();
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          sheet.show();
          void start(facingMode);
        }}
      >
        <AppIcon name="eye" size={20} />
        {label}
      </Button>
      <Sheet open={sheet.open} onOpenChange={(next) => (next ? sheet.show() : close())} title={label} description="The camera is used only while this window is open.">
        <div className="camera">
          <video ref={video} className="camera-video" playsInline muted aria-label="Camera preview" />
          {status === "starting" && <p className="camera-hint">Waiting for camera permission…</p>}
          {error && (
            <Alert tone="danger" live title={error === "denied" ? "Camera blocked" : "Camera unavailable"}>
              {error === "denied" ? "Allow camera access in your browser’s site settings, or upload a file instead." : "No camera was found. Upload a file instead."}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={status !== "live"}
              onClick={async () => {
                const file = await capture();
                if (file) {
                  onCapture(file);
                  close();
                }
              }}
            >
              <AppIcon name="check" size={20} />
              Capture
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
