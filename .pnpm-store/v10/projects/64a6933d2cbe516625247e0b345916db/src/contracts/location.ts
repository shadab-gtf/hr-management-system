import { z } from "zod";

/** One-shot reading sent only with an explicit, user-initiated action. */
export const locationReadingSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0).max(100_000),
});

export const locationCheckSchema = z.object({
  status: z.enum(["verified", "outside", "low_accuracy", "not_shared", "no_geofence"]),
  site: z.string().nullable(),
  /** Distance from the nearest geofence centre, and that geofence's radius. */
  distanceMeters: z.number().int().nullable(),
  siteRadiusMeters: z.number().int().nullable(),
  /** Detected position, rounded to 5 decimals (~1 m). Shown to the employee and authorized HR only. */
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  /** Live reverse-geocoded address (OpenStreetMap Nominatim). */
  address: z.string().nullable(),
  /** Nearest named landmark within 400 m (OpenStreetMap Overpass, live). */
  nearby: z.object({ name: z.string(), category: z.string(), distanceMeters: z.number().int() }).nullable(),
  accuracyMeters: z.number().int().nullable(),
  /** Required credit for the place data (ODbL) when a landmark is shown. */
  attribution: z.string().nullable(),
  label: z.string(),
});

export type LocationReading = z.infer<typeof locationReadingSchema>;
export type LocationCheck = z.infer<typeof locationCheckSchema>;
