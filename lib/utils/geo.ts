/** Great-circle distance in metres (haversine). Pure; safe on server or client. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Human distance: ~10 m, ~250 m, ~1.2 km (rounded; GPS is never exact). */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `~${Math.max(5, Math.round(meters / 5) * 5)} m`;
  return `~${(meters / 1000).toFixed(1)} km`;
}
