/**
 * Pure validation rules for selfie + GPS attendance logs (unit-tested in tests/unit/attendance-log). No I/O here:
 * the service feeds in the previous log and the settings, and decides what to persist.
 */
import type { AttendanceClientSignals, AttendanceLogFlag } from "../../contracts/attendance-log.js";

export interface AttLogSettings {
  /** Worst accepted GPS accuracy radius, in metres. */
  maxAccuracyM: number;
  /** Largest allowed gap between the GPS fix and the tap. */
  maxFixAgeMs: number;
  /** Allowed device-clock skew for online submissions. */
  maxOnlineSkewMs: number;
  /** Oldest offline submission accepted on replay. */
  maxOfflineAgeMs: number;
  /** Speed above which two consecutive logs are physically impossible. */
  maxTravelKmh: number;
}

export const DEFAULT_ATT_LOG_SETTINGS: AttLogSettings = {
  maxAccuracyM: 100,
  maxFixAgeMs: 2 * 60_000,
  maxOnlineSkewMs: 5 * 60_000,
  maxOfflineAgeMs: 12 * 60 * 60_000,
  maxTravelKmh: 250,
};

/** One failed rule: problem code, HTTP status, safe message and the field it concerns. */
export interface RuleFailure {
  code: string;
  status: number;
  message: string;
  field?: string;
}

export interface FixInput {
  latitude: number;
  longitude: number;
  accuracyM: number;
  clientTimestamp: Date;
  positionTimestamp: Date;
  offline: boolean;
}

/** Coordinates are inside the valid ranges and are not the (0,0) "null island" placeholder. */
export function validCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Field-level checks of one submission against the server clock. Returns every failure (the first one is the
 * attempt's failure reason) so the client can show all field errors at once.
 */
export function fixFailures(input: FixInput, serverNow: Date, settings: AttLogSettings): RuleFailure[] {
  const failures: RuleFailure[] = [];
  if (!validCoordinates(input.latitude, input.longitude)) {
    const message = "The location is not a valid position.";
    if (!(input.latitude >= -90 && input.latitude <= 90))
      failures.push({ code: "INVALID_COORDINATES", status: 422, message, field: "latitude" });
    if (!(input.longitude >= -180 && input.longitude <= 180))
      failures.push({ code: "INVALID_COORDINATES", status: 422, message, field: "longitude" });
    if (!failures.length) failures.push({ code: "INVALID_COORDINATES", status: 422, message, field: "latitude" });
  }
  if (!Number.isFinite(input.accuracyM) || input.accuracyM > settings.maxAccuracyM)
    failures.push({
      code: "LOW_ACCURACY",
      status: 422,
      message: `Location accuracy must be ${settings.maxAccuracyM} m or better. Move to an open area and try again.`,
      field: "accuracyM",
    });
  const fixAge = input.clientTimestamp.getTime() - input.positionTimestamp.getTime();
  // A fix may be a few seconds "newer" than the tap (clock rounding); anything else must be recent.
  if (fixAge > settings.maxFixAgeMs || fixAge < -10_000)
    failures.push({
      code: "STALE_POSITION",
      status: 422,
      message: "The location fix is not fresh. Get a new location and try again.",
      field: "positionTimestamp",
    });
  const skew = input.clientTimestamp.getTime() - serverNow.getTime();
  if (input.offline) {
    if (skew > settings.maxOnlineSkewMs)
      failures.push({
        code: "CLOCK_SKEW",
        status: 422,
        message: "Your device clock is ahead of the server. Set the time automatically and try again.",
        field: "clientTimestamp",
      });
    else if (-skew > settings.maxOfflineAgeMs)
      failures.push({
        code: "OFFLINE_ENTRY_EXPIRED",
        status: 422,
        message: "This offline entry is too old to be recorded. Ask HR to regularize the day.",
        field: "clientTimestamp",
      });
  } else if (Math.abs(skew) > settings.maxOnlineSkewMs)
    failures.push({
      code: "CLOCK_SKEW",
      status: 422,
      message: "Your device clock is out of sync. Set date and time to automatic and try again.",
      field: "clientTimestamp",
    });
  return failures;
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface PositionedLog {
  latitude: number;
  longitude: number;
  accuracyM: number;
  positionTimestamp: Date;
}

/**
 * Speed implied by two logs, in km/h, after giving both fixes the benefit of their accuracy radius. Zero when the
 * fixes overlap; Infinity when they are far apart but (claim to be) simultaneous.
 */
export function impliedSpeedKmh(previous: PositionedLog, next: PositionedLog): number {
  const meters = Math.max(0, distanceMeters(previous, next) - previous.accuracyM - next.accuracyM);
  if (meters === 0) return 0;
  const hours = Math.abs(next.positionTimestamp.getTime() - previous.positionTimestamp.getTime()) / 3_600_000;
  return hours === 0 ? Infinity : meters / 1000 / hours;
}

export function travelFailure(
  previous: PositionedLog | null,
  next: PositionedLog,
  settings: AttLogSettings,
): RuleFailure | null {
  if (!previous) return null;
  return impliedSpeedKmh(previous, next) > settings.maxTravelKmh
    ? {
        code: "IMPOSSIBLE_TRAVEL",
        status: 422,
        message: "This location is too far from your previous attendance log for the time between them.",
      }
    : null;
}

/** Informational flags derived from the submission (accepted attempts keep them for HR review). */
export function fixFlags(
  input: { accuracyM: number; offline: boolean; clientSignals: AttendanceClientSignals },
  settings: AttLogSettings,
): AttendanceLogFlag[] {
  const flags: AttendanceLogFlag[] = [];
  if (input.offline) flags.push("offline");
  const s = input.clientSignals;
  // A real GNSS fix is never reported as better than ~1 m; mock-location apps often report 0 or 1.
  if (
    input.accuracyM <= 1 ||
    s.strong ||
    s.perfectAccuracy ||
    s.identicalFixes ||
    s.impossibleJump ||
    s.timestampDrift ||
    s.missingMotionData
  )
    flags.push("mock_suspected");
  if (input.accuracyM > settings.maxAccuracyM / 2 && input.accuracyM <= settings.maxAccuracyM) flags.push("low_accuracy");
  return flags;
}
