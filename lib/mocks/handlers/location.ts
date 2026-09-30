import "server-only";
import { sites } from "@/lib/mocks/handlers/config";
import { me, type MockActor } from "@/lib/mocks/handlers/shared";
import { OSM_ATTRIBUTION, nearestLandmark, reverseGeocode } from "@/lib/server/places/geocoder";
import { distanceMeters, formatDistance } from "@/lib/utils/geo";
import type { LocationCheck, LocationReading } from "@/types/location";

/*
 * Geofence check against the office sites HR configured, plus a live address
 * and nearby landmark from OpenStreetMap's free APIs (lib/server/places/geocoder).
 * One reading per punch is kept (rounded to ~1 m) as evidence for the employee
 * and authorized HR — never a tracking trail. Location is evidence only, never
 * sole proof of misconduct (mobile-native-web.md).
 */

export async function checkLocation(actor: MockActor, reading: LocationReading | null): Promise<LocationCheck> {
  const none = { site: null, distanceMeters: null, siteRadiusMeters: null, coordinates: null, address: null, nearby: null, accuracyMeters: null, attribution: null };
  if (!reading) return { ...none, status: "not_shared", label: "Location not shared" };
  const employee = me(actor);
  const accuracy = Math.round(reading.accuracy);
  const coordinates = { latitude: Number(reading.latitude.toFixed(5)), longitude: Number(reading.longitude.toFixed(5)) };
  // Both lookups run in parallel; a slow or unreachable API just leaves them empty.
  const [address, nearby] = await Promise.all([reverseGeocode(reading), nearestLandmark(reading)]);
  const extra = { coordinates, address, nearby, accuracyMeters: accuracy, attribution: address || nearby ? OSM_ATTRIBUTION : null };
  const nearText = nearby ? ` · near ${nearby.name} (${formatDistance(nearby.distanceMeters)}, ±${accuracy} m)` : "";

  if (reading.accuracy > 1_000)
    return { ...none, ...extra, nearby: null, status: "low_accuracy", label: `Location too imprecise (±${accuracy} m)` };
  if (employee.location === "Remote")
    return { ...none, ...extra, status: "verified", site: "Remote", label: `Remote work · ${address ?? "location recorded"}${nearText}` };

  const nearest = sites()
    .map((site) => ({ site, meters: distanceMeters(reading, site) }))
    .sort((a, b) => a.meters - b.meters)[0];
  if (!nearest)
    return { ...none, ...extra, status: "no_geofence", label: `${address ?? `${coordinates.latitude}, ${coordinates.longitude}`}${nearText} · office geofence not set up yet` };
  const base = { ...none, ...extra, site: nearest.site.name, distanceMeters: nearest.meters, siteRadiusMeters: nearest.site.radiusMeters };
  if (nearest.meters <= nearest.site.radiusMeters + reading.accuracy)
    return { ...base, status: "verified", label: `At ${nearest.site.name} (${formatDistance(nearest.meters)})${nearText}` };
  return { ...base, status: "outside", label: `Outside office — ${formatDistance(nearest.meters)} from ${nearest.site.name}${address ? ` · ${address}` : ""}${nearText}` };
}
