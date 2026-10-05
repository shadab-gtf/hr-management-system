import "server-only";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { checkLocation } from "@/lib/mocks/handlers/location";
import { locationCheckSchema, type LocationReading } from "@/types/location";

/**
 * Verifies a one-shot reading against work-site geofences.
 * Live: POST /api/v1/attendance/location-check (to be provided by the HR API).
 */
export async function verifyLocation(reading: LocationReading | null) {
  return callApi({
    schema: locationCheckSchema,
    live: { method: "POST", path: "/attendance/location-check", body: reading ?? { shared: false } },
    mock: async () => checkLocation(await mockActor(), reading),
  });
}
