import { Badge } from "@/components/ui/badge";
import { formatDistance } from "@/lib/utils/geo";
import type { LocationCheck } from "@/types/location";

const verification: Record<LocationCheck["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  verified: { label: "Verified", tone: "success" },
  outside: { label: "Outside geofence", tone: "warning" },
  low_accuracy: { label: "Not verified — accuracy too low", tone: "danger" },
  not_shared: { label: "Not shared", tone: "neutral" },
  no_geofence: { label: "Location recorded · office not set up", tone: "neutral" },
};

function accuracyGrade(meters: number) {
  if (meters <= 20) return "Excellent";
  if (meters <= 50) return "Good";
  if (meters <= 150) return "Fair";
  return "Poor";
}

/** The five location-evidence fields for one punch. Presentational only. */
export function LocationDetails({ evidence, title }: { evidence: LocationCheck; title: string }) {
  const status = evidence.site === "Remote" && evidence.status === "verified" ? { label: "Remote — recorded", tone: "success" as const } : verification[evidence.status];
  const coords = evidence.coordinates;
  return (
    <details className="location-details">
      <summary>{title}</summary>
      <dl className="lines">
        <div className="line">
          <dt>Detected location</dt>
          <dd className="num">
            {coords ? (
              <a className="inline-link" href={`https://www.openstreetmap.org/?mlat=${coords.latitude}&mlon=${coords.longitude}#map=18/${coords.latitude}/${coords.longitude}`} target="_blank" rel="noreferrer noopener">
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
              </a>
            ) : (
              "Not shared"
            )}
          </dd>
        </div>
        <div className="line">
          <dt>Distance from geofence center</dt>
          <dd>
            {evidence.site === "Remote"
              ? "Remote employee — no geofence"
              : evidence.status === "no_geofence"
                ? "Office site not added yet — HR: HR admin → Attendance rules → Office sites"
                : evidence.distanceMeters !== null && evidence.site
                ? `${formatDistance(evidence.distanceMeters)} from ${evidence.site}${evidence.siteRadiusMeters ? ` (radius ${evidence.siteRadiusMeters} m)` : ""}`
                : "—"}
          </dd>
        </div>
        <div className="line">
          <dt>Reverse-geocoded location</dt>
          <dd>{evidence.address ?? (coords ? "Address unavailable (lookup service didn’t respond)" : "—")}</dd>
        </div>
        <div className="line">
          <dt>GPS position accuracy</dt>
          <dd className="num">{evidence.accuracyMeters !== null ? `±${evidence.accuracyMeters} m · ${accuracyGrade(evidence.accuracyMeters)}` : "—"}</dd>
        </div>
        <div className="line">
          <dt>Location verification</dt>
          <dd>
            <Badge tone={status.tone}>{status.label}</Badge>
          </dd>
        </div>
      </dl>
      {evidence.attribution && <p className="location-credit">Map data {evidence.attribution}</p>}
    </details>
  );
}
