import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "./common.js";

/**
 * Selfie + live GPS attendance log (docs/api/attendance-log.md). Every Sign In / Sign Out attempt is recorded,
 * failed ones included; only successful ones change the attendance day.
 */
export const attendanceLogEventSchema = z.enum(["sign_in", "sign_out"]);
export const attendanceLogStatusSchema = z.enum(["success", "failed"]);
export const attendanceLogFlagSchema = z.enum([
  /** Replayed from the device's offline queue; the punch time is the device's clock. */
  "offline",
  /** Not the device first registered for this employee. */
  "new_device",
  /** Client heuristics or the server suspect a mocked / spoofed location. Informational, never sole proof. */
  "mock_suspected",
  /** Accepted, but the fix was coarse (more than half the allowed accuracy radius). */
  "low_accuracy",
  /** Outside every configured office geofence (accepted under the default policy). */
  "outside_geofence",
  /** Outside a geofence while remote work is allowed (approved work-from-home or a remote work location). */
  "remote",
]);

/**
 * Mock-location heuristics computed in the browser. A web page cannot read Android's "mock location" flag, so these
 * are hints only; the server records them and makes its own decision.
 */
export const attendanceClientSignalsSchema = z.object({
  /** Accuracy reported as exactly 0–1 m on consecutive fixes. */
  perfectAccuracy: z.boolean().default(false),
  /** Consecutive fixes identical to 7+ decimals. */
  identicalFixes: z.boolean().default(false),
  /** Altitude, speed and heading all missing while accuracy is high on a mobile device. */
  missingMotionData: z.boolean().default(false),
  /** Consecutive fixes imply more than 250 km/h. */
  impossibleJump: z.boolean().default(false),
  /** The fix's own timestamp was far from the device clock. */
  timestampDrift: z.boolean().default(false),
  /** The client judged the combination strong enough to block (it should then not have submitted). */
  strong: z.boolean().default(false),
  /** Number of fixes observed while waiting for accuracy. */
  fixCount: z.number().int().min(0).max(10_000).default(0),
});

export const SELFIE_MAX_BYTES = 2 * 1024 * 1024;
/** Base64 of the largest allowed selfie (4/3 of the bytes, padded). */
const SELFIE_MAX_BASE64 = Math.ceil(SELFIE_MAX_BYTES / 3) * 4;

export const attendanceLogInputSchema = z.object({
  /** Must equal the signed-in employee; the server never trusts it. */
  employeeId: z.string().trim().min(1).max(32),
  eventType: attendanceLogEventSchema,
  /** Finite numbers only (range and (0,0) are checked by the server so the attempt is still logged). */
  latitude: z.number({ error: "Latitude is required." }),
  longitude: z.number({ error: "Longitude is required." }),
  accuracyM: z.number({ error: "Location accuracy is required." }).min(0, "Accuracy cannot be negative."),
  /** When the employee tapped Sign In / Sign Out (device clock). */
  clientTimestamp: instantSchema,
  /** When the GPS fix was taken (GeolocationPosition.timestamp). */
  positionTimestamp: instantSchema,
  /** Random per-device UUID kept in the browser; never a hardware identifier. */
  deviceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{8,64}$/, "Device id is invalid."),
  selfie: z.object({
    mime: z.enum(["image/jpeg", "image/webp", "image/png"]),
    contentBase64: z
      .string()
      .min(16, "A selfie is required.")
      .max(SELFIE_MAX_BASE64 + 4, "Selfies must be 2 MB or smaller.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "The selfie is not valid base64."),
  }),
  /** True when replayed from the offline queue. */
  offline: z.boolean().default(false),
  clientSignals: attendanceClientSignalsSchema.default({
    perfectAccuracy: false,
    identicalFixes: false,
    missingMotionData: false,
    impossibleJump: false,
    timestampDrift: false,
    strong: false,
    fixCount: 0,
  }),
});

export const attendanceLogSchema = z.object({
  id: z.string(),
  employee: personRefSchema,
  eventType: attendanceLogEventSchema,
  status: attendanceLogStatusSchema,
  /** Problem code of a failed attempt (e.g. `STALE_POSITION`); null on success. */
  failureReason: z.string().nullable(),
  flags: z.array(attendanceLogFlagSchema),
  businessDate: isoDateSchema,
  serverTimestamp: instantSchema,
  clientTimestamp: instantSchema,
  positionTimestamp: instantSchema,
  /** Rounded to 5 decimals (~1 m). Null when the submitted value was out of range. */
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracyM: z.number().nullable(),
  /** Geofence verdict computed by the server. */
  geofence: z.enum(["verified", "outside", "low_accuracy", "not_shared", "no_geofence"]).nullable(),
  site: z.string().nullable(),
  offline: z.boolean(),
  /** Attendance reference (`AT-…`) for a successful attempt. */
  reference: z.string().nullable(),
  /** Authorized API path of the selfie (`/api/v1/attendance/log/:id/selfie`); null when absent or expired. */
  selfieUrl: z.string().nullable(),
});

export const attendanceLogQuerySchema = z.object({ date: isoDateSchema.optional() });
export const attendanceLogReviewQuerySchema = z.object({
  date: isoDateSchema.optional(),
  status: attendanceLogStatusSchema.optional(),
  /** `true`: only attempts with at least one flag or a failure. */
  flagged: z.enum(["true", "false"]).optional(),
});

export type AttendanceLogEvent = z.infer<typeof attendanceLogEventSchema>;
export type AttendanceLogStatus = z.infer<typeof attendanceLogStatusSchema>;
export type AttendanceLogFlag = z.infer<typeof attendanceLogFlagSchema>;
export type AttendanceClientSignals = z.infer<typeof attendanceClientSignalsSchema>;
export type AttendanceLogInput = z.infer<typeof attendanceLogInputSchema>;
export type AttendanceLog = z.infer<typeof attendanceLogSchema>;
