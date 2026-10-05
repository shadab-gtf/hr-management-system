"use client";

import { useState, type FormEvent } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert, StatusBadge } from "@/components/ui/display";
import { LocationDetails } from "@/components/ui/location-details";
import { useCommand } from "@/hooks/use-command";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLiveMinutes } from "@/hooks/use-live-minutes";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { captureAttendanceAction } from "@/lib/actions/attendance";
import { formatDuration, formatTime } from "@/lib/utils/format";
import { todayStatus } from "@/lib/utils/tones";
import type { AttendanceToday } from "@/types/attendance";

/**
 * One capture action. Location is read once, only if the employee opts in for
 * this tap; denial still allows check-in, flagged as "location not shared".
 * Success is shown only after the server confirms the punch.
 */
export function AttendanceCapture({ today }: { today: AttendanceToday }) {
  const { dispatch, pending, formError } = useCommand(captureAttendanceAction);
  const geo = useGeolocation();
  const online = useOnlineStatus();
  const [shareLocation, setShareLocation] = useState(true);
  const worked = useLiveMinutes(today.checkedInAt, today.state === "checked_in", today.workedMinutes);
  const busy = pending || geo.status === "locating";

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (shareLocation) {
      try {
        const reading = await geo.locate();
        formData.set("latitude", String(reading.latitude));
        formData.set("longitude", String(reading.longitude));
        formData.set("accuracy", String(reading.accuracy));
      } catch {
        /* Denied/unavailable: continue without location (flagged server-side). */
      }
    }
    dispatch(formData);
  }

  return (
    <div className="punch">
      <div className="punch-status">
        <StatusBadge status={todayStatus[today.state]} />
        <span className="muted small">
          {today.shift.name} · {today.shift.start}–{today.shift.end}
        </span>
      </div>
      <div className="punch-times">
        <div>
          <span className="punch-label">Check in</span>
          <span className="punch-value num">{today.checkedInAt ? formatTime(today.checkedInAt, today.timezone) : "—"}</span>
        </div>
        <div>
          <span className="punch-label">Check out</span>
          <span className="punch-value num">{today.checkedOutAt ? formatTime(today.checkedOutAt, today.timezone) : "—"}</span>
        </div>
        <div>
          <span className="punch-label">Worked</span>
          <span className="punch-value num" aria-live="off">
            {worked ? formatDuration(worked) : "—"}
          </span>
        </div>
      </div>
      {today.checkInLocation && (
        <p className="punch-location">
          <AppIcon name="location" size={16} />
          {today.checkInLocation}
        </p>
      )}
      {today.checkInEvidence && <LocationDetails evidence={today.checkInEvidence} title="Check-in location details" />}
      {today.checkOutEvidence && <LocationDetails evidence={today.checkOutEvidence} title="Check-out location details" />}
      {today.nextAction ? (
        <form onSubmit={capture} className="stack">
          <input type="hidden" name="direction" value={today.nextAction} />
          <label className="check-row location-opt">
            <input type="checkbox" checked={shareLocation} onChange={(event) => setShareLocation(event.target.checked)} />
            <span>
              Verify with my location
              <span className="small muted"> — read once, only for this tap. The position is sent to OpenStreetMap to look up the address.</span>
            </span>
          </label>
          <Button
            type="submit"
            pending={busy}
            disabled={!online}
            variant={today.nextAction === "check_in" ? "primary" : "secondary"}
            className="punch-button"
          >
            <AppIcon name={today.nextAction === "check_in" ? "login" : "logout"} />
            {geo.status === "locating" ? "Getting location…" : pending ? "Recording…" : today.nextAction === "check_in" ? "Check in" : "Check out"}
          </Button>
          {!online && <p className="small text-danger">You’re offline. Attendance can’t be recorded until you reconnect.</p>}
          {geo.error === "denied" && <p className="small muted">Location is blocked, so this punch will be marked “location not shared”.</p>}
        </form>
      ) : (
        <p className="notice-strip">
          <AppIcon name={today.state === "checked_out" ? "check" : "info"} size={16} />
          {today.state === "checked_out" ? "You’re done for today. See you tomorrow!" : "Capture isn’t needed today."}
        </p>
      )}
      {formError && (
        <Alert tone="danger" live title="Not recorded">
          {formError} Your attendance was not marked.
        </Alert>
      )}
    </div>
  );
}
