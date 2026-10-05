import { createHmac } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { config } from "../../config/index.js";
import { idempotent } from "../../core/database/idempotency.js";
import { newId, nextReference } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { AuthorizationError } from "../../core/errors/AuthorizationError.js";
import { NotFoundError } from "../../core/errors/NotFoundError.js";
import { ValidationError } from "../../core/errors/ValidationError.js";
import { notifyMany } from "../../core/notifications/notify.js";
import { personRef } from "../../core/people/person-ref.js";
import { can } from "../../core/security/actor.js";
import { employeeScopeWhere, hasAdministrativeReach } from "../../core/security/scope.js";
import { detectFileKind, loadFile, saveFile, type UploadedFile } from "../../core/storage/storage.js";
import { businessDateOf, todayInOrgZone } from "../../utils/date.js";
import {
  attendanceLogFlagSchema,
  SELFIE_MAX_BYTES,
  type AttendanceLog,
  type AttendanceLogFlag,
  type AttendanceLogInput,
} from "../../contracts/attendance-log.js";
import { locationCheckSchema, type LocationCheck } from "../../contracts/location.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { applyCapture, captureConflict, verifyLocation } from "../attendance/attendance.service.js";
import { createTimeRepository, type CommandContext, type TimeRepository } from "../time/time.repository.js";
import { administers, attendanceRules, calendarDay, employeeOf } from "../time/time.service.js";
import { createAttendanceLogRepository, type AttLogRow } from "./attendance-log.repository.js";
import {
  DEFAULT_ATT_LOG_SETTINGS,
  fixFailures,
  fixFlags,
  travelFailure,
  validCoordinates,
  type AttLogSettings,
  type RuleFailure,
} from "./attendance-log.rules.js";

/** `stored_files.purpose` of attendance selfies (retention applies to this purpose only). */
export const SELFIE_PURPOSE = "attendance-selfie";
const SELFIE_KINDS = ["image/jpeg", "image/png", "image/webp"] as const;

export interface AttendanceLogPolicy extends AttLogSettings {
  newDevicePolicy: "flag" | "reject";
  outsideGeofencePolicy: "flag" | "reject";
  selfieRetentionDays: number;
}

export function attendanceLogPolicy(): AttendanceLogPolicy {
  return {
    ...DEFAULT_ATT_LOG_SETTINGS,
    maxAccuracyM: config.attendanceLog.maxAccuracyM,
    newDevicePolicy: config.attendanceLog.newDevicePolicy,
    outsideGeofencePolicy: config.attendanceLog.outsideGeofencePolicy,
    selfieRetentionDays: config.attendanceLog.selfieRetentionDays,
  };
}

/** Stored as the command's idempotent response, so a replay re-raises the same failure without a second row. */
type Outcome =
  | { ok: true; log: AttendanceLog }
  | {
      ok: false;
      log: AttendanceLog;
      problem: { status: number; code: string; message: string; fieldErrors: Record<string, string> };
    };

const selfiePath = (id: string) => `/api/v1/attendance/log/${encodeURIComponent(id)}/selfie`;
const round = (value: Prisma.Decimal | null, places: number) =>
  value === null ? null : Number(Number(value).toFixed(places));
const geofenceOf = (status: string | null) => {
  const parsed = locationCheckSchema.shape.status.safeParse(status);
  return parsed.success ? parsed.data : null;
};

export function toAttendanceLog(row: AttLogRow, liveFiles: ReadonlySet<string>): AttendanceLog {
  return {
    id: row.id,
    employee: personRef(row.employee),
    eventType: row.eventType,
    status: row.status,
    failureReason: row.failureReason,
    flags: row.flags.flatMap((flag) => {
      const parsed = attendanceLogFlagSchema.safeParse(flag);
      return parsed.success ? [parsed.data] : [];
    }),
    businessDate: row.businessDate,
    serverTimestamp: row.serverTimestamp.toISOString(),
    clientTimestamp: row.clientTimestamp.toISOString(),
    positionTimestamp: row.positionTimestamp.toISOString(),
    latitude: round(row.latitude, 5),
    longitude: round(row.longitude, 5),
    accuracyM: round(row.accuracyM, 0),
    geofence: geofenceOf(row.geofenceStatus),
    site: row.siteName,
    offline: row.offline,
    reference: row.reference,
    selfieUrl: row.selfieFileId && liveFiles.has(row.selfieFileId) ? selfiePath(row.id) : null,
  };
}

/** Decodes and magic-byte checks the selfie; the declared MIME type must match the real one. */
export function selfieFile(selfie: AttendanceLogInput["selfie"], logId: string): UploadedFile | RuleFailure {
  const bytes = Buffer.from(selfie.contentBase64, "base64");
  if (bytes.length === 0)
    return { code: "SELFIE_REQUIRED", status: 400, message: "Take a selfie to mark attendance.", field: "selfie" };
  if (bytes.length > SELFIE_MAX_BYTES)
    return { code: "SELFIE_TOO_LARGE", status: 400, message: "Selfies must be 2 MB or smaller.", field: "selfie" };
  const kind = detectFileKind(bytes);
  if (!kind || !SELFIE_KINDS.some((allowed) => allowed === kind) || kind !== selfie.mime)
    return {
      code: "SELFIE_TYPE_NOT_ALLOWED",
      status: 400,
      message: "The selfie must be a JPEG, PNG or WebP image.",
      field: "selfie",
    };
  return { bytes, kind, fileName: `selfie-${logId}.${kind.slice(6).replace("jpeg", "jpg")}` };
}

/** Keyed hash of the caller IP (domain-separated from the token key); the address itself is never stored. */
function ipHash(ip: string | undefined): string | null {
  if (!ip) return null;
  const key = Buffer.concat([Buffer.from("gtf-attendance-log-ip|"), Buffer.from(config.jwt.secret)]);
  return createHmac("sha256", key).update(ip).digest("hex");
}

/** Remote work is allowed for the day: approved work-from-home leave, or a "Remote" work location. */
async function remoteAllowed(repo: TimeRepository, employeeId: string, locationName: string, date: string) {
  if (/^remote$/i.test(locationName)) return true;
  const day = await calendarDay(repo, employeeId, date);
  return day.leave?.state === "approved" && day.type?.countsAsPresent === true;
}

export function createAttendanceLogService(prisma: PrismaClient, policy: AttendanceLogPolicy = attendanceLogPolicy()) {
  const reader = createAttendanceLogRepository(prisma);
  const timeReader = createTimeRepository(prisma);

  async function dtos(rows: AttLogRow[]) {
    const live = await reader.liveFiles(rows.flatMap((r) => (r.selfieFileId ? [r.selfieFileId] : [])));
    return rows.map((row) => toAttendanceLog(row, live));
  }

  return {
    /** POST /attendance/log: validate, record the attempt (always), and on success mark attendance. */
    async log(ctx: CommandContext, input: AttendanceLogInput, ip: string | undefined): Promise<AttendanceLog> {
      if (!ctx.key)
        throw new ValidationError(
          "IDEMPOTENCY_KEY_REQUIRED",
          "Send an Idempotency-Key header so a retried attendance log is not recorded twice.",
        );
      const outcome = await idempotent<Outcome>(
        prisma,
        { actorId: ctx.actor.employeeId, key: ctx.key, command: "attendance.log" },
        async (tx) => {
          const time = createTimeRepository(tx),
            logs = createAttendanceLogRepository(tx);
          // Same serialization as every other time command (attendance rows, references).
          await time.lock("workflows");
          const serverNow = new Date(),
            // Never trust the submitted employee id: the attempt always belongs to the signed-in actor.
            employee = await employeeOf(time, ctx.actor.employeeId),
            id = newId("alog"),
            clientTimestamp = new Date(input.clientTimestamp),
            positionTimestamp = new Date(input.positionTimestamp),
            direction = input.eventType === "sign_in" ? "check_in" : "check_out",
            businessDate = input.offline ? businessDateOf(clientTimestamp) : todayInOrgZone(),
            coordinatesValid = validCoordinates(input.latitude, input.longitude),
            flags = new Set<AttendanceLogFlag>(fixFlags(input, policy));
          // First failed rule wins; later rules still run so flags (new device, geofence) are complete.
          const verdict: { failure: RuleFailure | null; fieldErrors: Record<string, string> } = {
            failure: null,
            fieldErrors: {},
          };
          const failWith = (rule: RuleFailure | null) => {
            if (!verdict.failure && rule) {
              verdict.failure = rule;
              if (rule.field) verdict.fieldErrors = { [rule.field]: rule.message };
            }
          };

          if (input.employeeId !== ctx.actor.employeeId)
            failWith({
              code: "EMPLOYEE_MISMATCH",
              status: 403,
              message: "You can only mark your own attendance.",
              field: "employeeId",
            });
          if (employee.status === "exited")
            failWith({ code: "INACTIVE_EMPLOYEE", status: 403, message: "Attendance is unavailable." });

          const selfie = selfieFile(input.selfie, id);
          if (!("bytes" in selfie)) failWith(selfie);

          const fix = fixFailures({ ...input, clientTimestamp, positionTimestamp }, serverNow, policy);
          if (!verdict.failure && fix[0]) {
            verdict.failure = fix[0];
            verdict.fieldErrors = Object.fromEntries(fix.flatMap((f) => (f.field ? [[f.field, f.message]] : [])));
          }

          const existing = await time.attendance(employee.id, businessDate);
          const conflict = captureConflict(existing, direction);
          if (conflict) failWith({ ...conflict, status: 409 });
          const at = input.offline ? clientTimestamp : serverNow;
          if (direction === "check_out" && existing?.firstIn && at < existing.firstIn)
            failWith({
              code: "INVALID_ATTENDANCE_STATE",
              status: 409,
              message: "Sign-out time is before your sign-in.",
            });

          if (coordinatesValid) {
            const previous = await logs.previousPositioned(employee.id);
            const previousPosition =
              previous && Number.isFinite(previous.latitude) && Number.isFinite(previous.longitude)
                ? {
                    latitude: Number(previous.latitude),
                    longitude: Number(previous.longitude),
                    accuracyM: Number(previous.accuracyM ?? 0),
                    positionTimestamp: previous.positionTimestamp,
                  }
                : null;
            failWith(travelFailure(previousPosition, { ...input, positionTimestamp }, policy));
          }

          const registered = await logs.device(employee.id);
          let announceDevice = false;
          if (registered && registered.deviceId !== input.deviceId) {
            flags.add("new_device");
            announceDevice = !(await logs.seenDevice(employee.id, input.deviceId));
            if (policy.newDevicePolicy === "reject")
              failWith({
                code: "DEVICE_NOT_REGISTERED",
                status: 403,
                message: "This device isn't registered for your attendance. Ask HR to register it.",
              });
          }

          let evidence: LocationCheck | null = null;
          let siteId: string | null = null;
          if (coordinatesValid && Number.isFinite(input.accuracyM)) {
            evidence = await verifyLocation(time, {
              latitude: input.latitude,
              longitude: input.longitude,
              accuracy: input.accuracyM,
            });
            siteId = (await attendanceRules(time)).sites.find((s) => s.name === evidence?.site)?.id ?? null;
            if (evidence.status === "outside") {
              if (await remoteAllowed(time, employee.id, employee.location.name, businessDate)) flags.add("remote");
              else {
                flags.add("outside_geofence");
                if (policy.outsideGeofencePolicy === "reject")
                  failWith({
                    code: "OUTSIDE_GEOFENCE",
                    status: 422,
                    message: `You are outside ${evidence.site ?? "the office"}. Attendance can be marked only at a work site.`,
                  });
              }
            }
          }

          const stored =
            "bytes" in selfie
              ? await saveFile(tx, {
                  purpose: SELFIE_PURPOSE,
                  ownerEmployeeId: employee.id,
                  createdBy: ctx.actor.employeeId,
                  file: selfie,
                })
              : null;

          let reference: string | null = null;
          const accepted = verdict.failure === null;
          if (accepted && evidence) {
            if (!registered) await logs.registerDevice(employee.id, input.deviceId);
            await applyCapture(time, {
              employeeId: employee.id,
              date: businessDate,
              at,
              direction,
              existing,
              evidence,
              source: "web_selfie_gps",
            });
            reference = await nextReference(tx, "AT", todayInOrgZone());
          }

          const finalFailure = verdict.failure;
          const row = await logs.insert({
            id,
            employeeId: employee.id,
            eventType: input.eventType,
            businessDate,
            latitude: coordinatesValid ? input.latitude.toFixed(7) : null,
            longitude: coordinatesValid ? input.longitude.toFixed(7) : null,
            accuracyM: Number.isFinite(input.accuracyM) ? Math.min(input.accuracyM, 9_999_999).toFixed(2) : null,
            selfieFileId: stored?.id ?? null,
            serverTimestamp: serverNow,
            clientTimestamp,
            positionTimestamp,
            deviceId: input.deviceId,
            status: accepted ? "success" : "failed",
            failureReason: finalFailure?.code ?? null,
            flags: [...flags],
            offline: input.offline,
            geofenceStatus: evidence?.status ?? null,
            siteId,
            siteName: evidence?.site ?? null,
            clientSignals: input.clientSignals,
            ipHash: ipHash(ip),
            reference,
            requestId: ctx.requestId.slice(0, 100),
          });
          // Audit carries no coordinates or image data: status, flags and the failure code only.
          await recordAuditEvent(tx, {
            actorEmployeeId: ctx.actor.employeeId,
            action: accepted ? `attendance.log.${input.eventType}` : "attendance.log.failed",
            entity: "attendance_log",
            entityId: id,
            requestId: ctx.requestId,
            details: {
              status: accepted ? "success" : "failed",
              eventType: input.eventType,
              failureReason: finalFailure?.code ?? null,
              flags: [...flags],
              reference,
            },
          });
          if (announceDevice)
            await notifyMany(
              tx,
              (await logs.hrRecipients(employee.departmentId)).filter((recipient) => recipient !== employee.id),
              {
                kind: "system",
                title: "Attendance from a new device",
                body: `${employee.name} used an unregistered device for attendance${accepted ? "" : " (not recorded)"}. Review the log.`,
                href: "/attendance?view=review",
              },
            );
          const log = toAttendanceLog(row, new Set(stored ? [stored.id] : []));
          return finalFailure
            ? {
                ok: false,
                log,
                problem: {
                  status: finalFailure.status,
                  code: finalFailure.code,
                  message: finalFailure.message,
                  fieldErrors: verdict.fieldErrors,
                },
              }
            : { ok: true, log };
        },
      );
      if (!outcome.ok)
        throw new AppError(
          outcome.problem.status,
          outcome.problem.code,
          outcome.problem.message,
          Object.keys(outcome.problem.fieldErrors).length ? { fieldErrors: outcome.problem.fieldErrors } : {},
        );
      return outcome.log;
    },

    /** GET /attendance/log: the signed-in employee's attempts for one business date (default today). */
    async mine(ctx: CommandContext, date?: string) {
      return dtos(await reader.list({ employeeId: ctx.actor.employeeId, businessDate: date ?? todayInOrgZone() }));
    },

    /**
     * GET /attendance/log/review: attempts of the caller's direct reports (managers) and of employees inside the
     * caller's HR scope (BE-003: department-scoped HR sees only their departments). Never the caller's own.
     */
    async review(
      ctx: CommandContext,
      query: { date?: string | undefined; status?: "success" | "failed" | undefined; flagged?: "true" | "false" | undefined },
    ) {
      const team = can(ctx.actor, "attendance.read.team"),
        hr = hasAdministrativeReach(ctx.actor, "employee.read");
      if (!team && !hr) throw new AuthorizationError("You don't have access to this.");
      const reach: Prisma.EmployeeWhereInput[] = [
        ...(team ? [{ managerId: ctx.actor.employeeId }] : []),
        ...(hr ? [employeeScopeWhere(ctx.actor, "employee.read")] : []),
      ];
      return dtos(
        await reader.list({
          businessDate: query.date ?? todayInOrgZone(),
          employeeId: { not: ctx.actor.employeeId },
          employee: { OR: reach },
          ...(query.status ? { status: query.status } : {}),
          ...(query.flagged === "true" ? { OR: [{ status: "failed" }, { NOT: { flags: { isEmpty: true } } }] } : {}),
        }),
      );
    },

    /**
     * GET /attendance/log/:id/selfie: only the employee, their manager, or HR whose scope covers the employee.
     * Everyone else gets 404 so log ids cannot be probed.
     */
    async selfie(ctx: CommandContext, id: string) {
      const row = await reader.byId(id);
      const notFound = new NotFoundError("We couldn't find that selfie.");
      if (!row) throw notFound;
      const allowed =
        row.employeeId === ctx.actor.employeeId ||
        (can(ctx.actor, "attendance.read.team") && row.employee.managerId === ctx.actor.employeeId) ||
        (await administers(timeReader, ctx.actor, "employee.read", row.employeeId));
      if (!allowed || !row.selfieFileId) throw notFound;
      const file = await loadFile(prisma, row.selfieFileId);
      return { bytes: file.bytes, mime: file.meta.mimeType };
    },
  };
}

let lastPurge = 0;
/**
 * Retention: deletes selfie images older than ATTENDANCE_SELFIE_RETENTION_DAYS (bytes removed, metadata marked
 * deleted). The append-only log rows stay; their selfieUrl becomes null. Safe to call from the background job on
 * every tick: it runs at most hourly and handles a bounded batch.
 */
export async function purgeExpiredSelfies(
  prisma: PrismaClient,
  now = new Date(),
  retentionDays = config.attendanceLog.selfieRetentionDays,
  force = false,
): Promise<number> {
  if (!force && now.getTime() - lastPurge < 3_600_000) return 0;
  lastPurge = now.getTime();
  const repo = createAttendanceLogRepository(prisma);
  const root = resolve(config.storageDir);
  const files = await repo.expiredSelfies(SELFIE_PURPOSE, new Date(now.getTime() - retentionDays * 86_400_000), 200);
  for (const file of files) {
    const path = resolve(root, file.storageKey);
    if (!path.startsWith(root + sep)) continue;
    await unlink(path).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
    await repo.markFileDeleted(file.id);
  }
  return files.length;
}
