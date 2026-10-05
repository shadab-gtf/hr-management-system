"use client";

import { useState } from "react";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/display";
import { useGeolocation } from "@/hooks/use-geolocation";
import { usePermissionState, type PermissionKind, type PermissionStatus } from "@/hooks/use-permission-state";

const statusBadge: Record<PermissionStatus, { label: string; tone: "neutral" | "success" | "danger" | "warning" }> = {
  unsupported: { label: "Not supported", tone: "neutral" },
  unknown: { label: "Checking…", tone: "neutral" },
  prompt: { label: "Not asked yet", tone: "warning" },
  granted: { label: "Allowed", tone: "success" },
  denied: { label: "Blocked", tone: "danger" },
};

const copy: Record<PermissionKind, { title: string; why: string; icon: IconName }> = {
  geolocation: { title: "Location", why: "Checked once when you tap Check in, to confirm your work site. Never tracked in the background.", icon: "location" },
  notifications: { title: "Notifications", why: "Approvals, payslip releases and helpdesk replies. Messages never include salary or private details.", icon: "notification" },
  camera: { title: "Camera", why: "Only when you choose to take a profile photo or snap a receipt.", icon: "eye" },
};

function Row({ kind, children }: { kind: PermissionKind; children: (set: (value: PermissionStatus) => void, status: PermissionStatus) => React.ReactNode }) {
  const { status, setStatus } = usePermissionState(kind);
  return (
    <li className="permission-row">
      <span className="icon-tile avatar--neutral">
        <AppIcon name={copy[kind].icon} size={20} />
      </span>
      <span className="list-text">
        <span className="list-title">{copy[kind].title}</span>
        <span className="list-meta">{copy[kind].why}</span>
        {status === "denied" && <span className="small text-danger">Blocked in your browser. Re-enable it from the site settings (lock icon in the address bar).</span>}
      </span>
      <span className="list-trailing">
        <StatusBadge status={statusBadge[status]} />
        {children(setStatus, status)}
      </span>
    </li>
  );
}

/** Explicit, per-capability permission control. Nothing is requested on page load. */
export function PermissionsPanel() {
  const geo = useGeolocation();
  const [message, setMessage] = useState("");

  return (
    <>
      <ul className="list permissions">
        <Row kind="geolocation">
          {(set, status) =>
            status === "prompt" || status === "granted" ? (
              <Button
                size="sm"
                variant="secondary"
                pending={geo.status === "locating"}
                onClick={async () => {
                  try {
                    const reading = await geo.locate();
                    set("granted");
                    setMessage(`Location works (±${reading.accuracy} m). It’s used only when you check in.`);
                  } catch {
                    setMessage("Location wasn’t shared. You can still check in; it will be marked “location not shared”.");
                  }
                }}
              >
                {status === "granted" ? "Test" : "Allow"}
              </Button>
            ) : null
          }
        </Row>
        <Row kind="notifications">
          {(set, status) =>
            status === "prompt" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const result = await Notification.requestPermission();
                  set(result === "default" ? "prompt" : result);
                  if (result === "granted") setMessage("Notifications enabled on this device.");
                }}
              >
                Allow
              </Button>
            ) : status === "granted" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
                  const options = { body: "Notifications are working. You’ll hear about approvals and payslips here.", icon: "/icons/icon-192.png", tag: "gtf-test" };
                  if (registration) await registration.showNotification("GTF HR", options);
                  else new Notification("GTF HR", options);
                }}
              >
                Send test
              </Button>
            ) : null
          }
        </Row>
        <Row kind="camera">
          {(set, status) =>
            status === "prompt" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    stream.getTracks().forEach((track) => track.stop());
                    set("granted");
                    setMessage("Camera allowed. It turns on only when you open the camera.");
                  } catch {
                    set("denied");
                  }
                }}
              >
                Allow
              </Button>
            ) : null
          }
        </Row>
      </ul>
      {message && (
        <p className="notice-strip permission-note" role="status">
          <AppIcon name="info" size={16} />
          {message}
        </p>
      )}
    </>
  );
}
