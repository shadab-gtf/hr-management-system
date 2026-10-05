import { required } from "../time/time.service.js";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { newId } from "../../core/database/ids.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can } from "../../core/security/actor.js";
import { isOrgWide, requireOrgWide } from "../../core/security/scope.js";
import { addDays, todayInOrgZone, daysBetween } from "../../utils/date.js";
import { locationCheckSchema, locationReadingSchema, type LocationCheck } from "../../contracts/location.js";
import {
  type AttendanceDay,
  type AttendanceMonth,
  rosterPatternInputSchema,
  weeklyOffInputSchema,
  shiftSwapInputSchema,
} from "../../contracts/attendance.js";
import {
  holidayInputSchema,
  leaveTypeInputSchema,
  shiftInputSchema,
  officeSiteInputSchema,
  overtimeInputSchema,
  lateEarlyInputSchema,
} from "../../contracts/hr-config.js";
import {
  createTimeRepository,
  timeCommand,
  json,
  type CommandContext,
  type TimeRepository,
} from "../time/time.repository.js";
import {
  attendanceRules,
  calendarDay,
  clockTime,
  employeeOf,
  fail,
  holidaysFor,
  minutesOf,
  monday,
  monthDates,
  personRef,
  policyTypes,
  policyVersion,
  requireDecision,
  requireOwner,
  requirePending,
  scopedPeople,
  weeklyOff,
  workflowOf,
  canDecide,
  administers,
} from "../time/time.service.js";
import { captureBody, regularizationBody, rosterPayload, swapPayload } from "../time/time.schema.js";
import { employeeCalendar } from "../time/time.service.js";
export async function verifyLocation(
  repo: TimeRepository,
  reading: z.infer<typeof locationReadingSchema> | null,
): Promise<LocationCheck> {
  const base = {
    site: null,
    distanceMeters: null,
    siteRadiusMeters: null,
    coordinates: null,
    address: null,
    nearby: null,
    accuracyMeters: null,
    attribution: null,
  };
  if (!reading) return { ...base, status: "not_shared", label: "Location not shared" };
  const { sites } = await attendanceRules(repo);
  const coordinates = {
    latitude: Number(reading.latitude.toFixed(5)),
    longitude: Number(reading.longitude.toFixed(5)),
  };
  const candidates = sites
    .map((s) => {
      const rad = Math.PI / 180,
        a =
          Math.sin(((s.latitude - reading.latitude) * rad) / 2) ** 2 +
          Math.cos(reading.latitude * rad) *
            Math.cos(s.latitude * rad) *
            Math.sin(((s.longitude - reading.longitude) * rad) / 2) ** 2;
      return { s, d: Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) };
    })
    .sort((a, b) => a.d - b.d);
  const nearest = candidates[0];
  if (!nearest)
    return {
      ...base,
      status: "no_geofence",
      label: "No office geofence configured",
      coordinates,
      accuracyMeters: Math.round(reading.accuracy),
    };
  const status = reading.accuracy > 150 ? "low_accuracy" : nearest.d <= nearest.s.radiusMeters ? "verified" : "outside";
  return {
    ...base,
    status,
    site: nearest.s.name,
    distanceMeters: nearest.d,
    siteRadiusMeters: nearest.s.radiusMeters,
    coordinates,
    accuracyMeters: Math.round(reading.accuracy),
    label:
      status === "verified"
        ? `At ${nearest.s.name}`
        : status === "outside"
          ? `Outside ${nearest.s.name}`
          : "Location accuracy is low",
  };
}
export async function todayAttendance(repo: TimeRepository, employeeId: string) {
  const date = todayInOrgZone();
  const [row, day] = await Promise.all([repo.attendance(employeeId, date), calendarDay(repo, employeeId, date)]);
  const checkInEvidence = row?.checkInEvidence ? locationCheckSchema.parse(row.checkInEvidence) : null;
  return {
    businessDate: date,
    timezone: "Asia/Kolkata",
    state: row?.lastOut ? "checked_out" : row?.firstIn ? "checked_in" : "not_recorded",
    shift: day.shift,
    checkedInAt: row?.firstIn?.toISOString() ?? null,
    checkedOutAt: row?.lastOut?.toISOString() ?? null,
    workedMinutes: row?.workedMinutes ?? 0,
    nextAction: row?.lastOut ? null : row?.firstIn ? "check_out" : "check_in",
    checkInLocation: checkInEvidence?.label ?? null,
    checkInEvidence,
    checkOutEvidence: row?.checkOutEvidence ? locationCheckSchema.parse(row.checkOutEvidence) : null,
    lastUpdatedAt: row?.updatedAt.toISOString() ?? new Date().toISOString(),
  };
}
type AttendanceRow = Awaited<ReturnType<TimeRepository["attendance"]>>;

/**
 * Self-service capture sequence rules, shared by POST /attendance/events and the selfie + GPS log: one check-in per
 * day, and a check-out needs an open check-in. Null when the punch is allowed.
 */
export function captureConflict(
  existing: AttendanceRow,
  direction: "check_in" | "check_out",
): { code: string; message: string } | null {
  if (direction === "check_in" && existing?.firstIn)
    return { code: "ALREADY_CHECKED_IN", message: "Check-in is already recorded." };
  if (direction === "check_out" && (!existing?.firstIn || existing.lastOut))
    return { code: "INVALID_ATTENDANCE_STATE", message: "A current check-in is required." };
  return null;
}

/** Writes one allowed punch (after `captureConflict`) with its server-verified location evidence. */
export async function applyCapture(
  r: TimeRepository,
  input: {
    employeeId: string;
    date: string;
    at: Date;
    direction: "check_in" | "check_out";
    existing: AttendanceRow;
    evidence: LocationCheck;
    source: string;
  },
): Promise<void> {
  const { employeeId, date, at, direction, existing, evidence } = input;
  const day = await calendarDay(r, employeeId, date);
  await r.saveAttendance(employeeId, date, {
    source: input.source,
    firstIn: existing?.firstIn ?? at,
    lastOut: direction === "check_out" ? at : null,
    workedMinutes:
      direction === "check_out" && existing?.firstIn
        ? Math.max(0, Math.floor((at.getTime() - existing.firstIn.getTime()) / 60000) - day.shift.breakMinutes)
        : 0,
    ...(direction === "check_in" ? { checkInEvidence: json(evidence) } : {}),
    ...(direction === "check_out" ? { checkOutEvidence: json(evidence) } : {}),
  });
}

export function createAttendanceService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  return {
    today: (ctx: CommandContext) => todayAttendance(repo, ctx.actor.employeeId),
    location: (
      _ctx: CommandContext,
      input:
        | z.infer<typeof locationReadingSchema>
        | {
            shared: false;
          },
    ) => verifyLocation(repo, "shared" in input ? null : input),
    async month(ctx: CommandContext, month: string): Promise<AttendanceMonth> {
      return classifiedMonth(repo, ctx.actor.employeeId, month);
    },
    async team(ctx: CommandContext) {
      return Promise.all(
        (await scopedPeople(repo, ctx.actor))
          .filter((e) => e.id !== ctx.actor.employeeId)
          .map(async (e) => {
            const t = await todayAttendance(repo, e.id);
            return { person: personRef(e), state: t.state, checkedInAt: t.checkedInAt, exception: null };
          }),
      );
    },
    capture(ctx: CommandContext, input: z.infer<typeof captureBody>) {
      return timeCommand(prisma, ctx, `attendance.${input.direction}`, async (r, reference) => {
        const employee = await employeeOf(r, ctx.actor.employeeId);
        if (employee.status === "exited") fail("INACTIVE_EMPLOYEE", "Attendance is unavailable.", 403);
        const date = todayInOrgZone(),
          now = new Date(),
          existing = await r.attendance(employee.id, date);
        const conflict = captureConflict(existing, input.direction);
        if (conflict) fail(conflict.code, conflict.message, 409);
        // Only coordinates are accepted as evidence; the server recalculates every claimed geofence result.
        const reading =
          input.location?.coordinates && input.location.accuracyMeters !== null
            ? { ...input.location.coordinates, accuracy: input.location.accuracyMeters }
            : null;
        await applyCapture(r, {
          employeeId: employee.id,
          date,
          at: now,
          direction: input.direction,
          existing,
          evidence: await verifyLocation(r, reading),
          source: "web_self_service",
        });
        return { reference: await reference("AT"), recordedAt: now.toISOString(), direction: input.direction };
      });
    },
    regularize(ctx: CommandContext, input: z.infer<typeof regularizationBody>) {
      return timeCommand(prisma, ctx, "attendance.regularization.create", async (r, reference) => {
        const today = todayInOrgZone();
        if (input.date > today || daysBetween(input.date, today) > 30)
          fail("INVALID_DATE", "Regularize attendance within the last 30 days.");
        const e = await employeeOf(r, ctx.actor.employeeId);
        if (!e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        const duplicate = await r.workflows({
          kind: "regularization",
          employeeId: e.id,
          startDate: input.date,
          state: "pending",
        });
        if (duplicate.length) fail("DUPLICATE_REQUEST", "A request is already pending for this date.", 409);
        const ref = await reference("AR");
        await r.createWorkflow({
          id: newId("reg"),
          reference: ref,
          kind: "regularization",
          employeeId: e.id,
          approverId: e.managerId,
          startDate: input.date,
          endDate: input.date,
          payload: json(input),
        });
        await r.notify(e.managerId, "Attendance correction requested", `${e.name} submitted ${ref}.`, "/approvals");
        return { reference: ref, state: "pending", approver: e.manager?.name ?? "Manager" };
      });
    },
    async roster(ctx: CommandContext, view: "week" | "month", anchor: string) {
      const e = await employeeOf(repo, ctx.actor.employeeId),
        start = view === "week" ? monday(anchor) : `${anchor.slice(0, 7)}-01`,
        dates =
          view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : monthDates(anchor.slice(0, 7));
      const days = await Promise.all(
        dates.map(async (date) => {
          const d = await calendarDay(repo, e.id, date);
          return {
            date,
            shift: d.off || d.holiday ? null : { ...d.shift, short: d.shift.name.slice(0, 3).toUpperCase() },
            weekOff: d.off,
            holiday: d.holiday,
            onLeave: d.type?.name ?? null,
            source: d.source,
          };
        }),
      );
      const swaps = await repo.workflows({
        kind: "shift_swap",
        OR: [{ employeeId: e.id }, { payload: { path: ["colleagueId"], equals: e.id } }],
      });
      const colleagues = await repo.people({ departmentId: e.departmentId, id: { not: e.id } });
      const swapOptions = [];
      for (const d of days.filter((d) => d.date >= todayInOrgZone() && d.source === "roster" && d.shift)) {
        const options = [];
        for (const colleague of colleagues) {
          const c = await calendarDay(repo, colleague.id, d.date);
          if (!c.off && !c.holiday && !c.leave)
            options.push({ id: colleague.id, name: colleague.name, shift: c.shift.name });
        }
        swapOptions.push({ date: d.date, mine: required(d.shift).name, colleagues: options });
      }
      return {
        view,
        anchor,
        label: `${dates[0]} – ${dates.at(-1)}`,
        department: e.department.name,
        days,
        weeklyOff: await weeklyOff(repo, e.department.name),
        swaps: await Promise.all(swaps.map((s) => swapDto(repo, ctx, s.id))),
        swapOptions,
      };
    },
    async planner(ctx: CommandContext, department?: string, weekStart?: string) {
      const people = await scopedPeople(repo, ctx.actor),
        departments = [...new Set(people.map((e) => e.department.name))];
      const selected = department ?? departments[0] ?? (await employeeOf(repo, ctx.actor.employeeId)).department.name;
      if (!departments.includes(selected)) fail("FORBIDDEN", "This department is outside your team.", 403);
      const start = monday(weekStart ?? todayInOrgZone()),
        dates = Array.from({ length: 7 }, (_, i) => addDays(start, i)),
        doc = await repo.document(`roster:${selected}:${start}`),
        data = doc ? rosterPayload.parse(doc.payload) : null,
        rules = await attendanceRules(repo);
      const rows = [];
      for (const e of people.filter((e) => e.department.name === selected)) {
        const calendar = await Promise.all(dates.map((d) => calendarDay(repo, e.id, d)));
        rows.push({
          person: personRef(e),
          cells: data?.cells[e.id] ?? Array<string | null>(7).fill(null),
          effective: calendar.map((c) => (c.off ? "off" : c.shift.id)),
          leave: calendar.map((c) => c.type?.name ?? null),
        });
      }
      const swaps = await repo.workflows({
        kind: "shift_swap",
        state: "pending",
        employeeId: { in: rows.map((r) => r.person.id) },
      });
      return {
        department: selected,
        departments,
        weekStart: start,
        dates,
        status: data?.status ?? "none",
        publishedAt: data?.publishedAt ?? null,
        publishedBy: data?.publishedBy ?? null,
        version: doc?.version ?? 0,
        shifts: rules.shifts.map((s) => ({ ...s, short: s.name.slice(0, 3).toUpperCase() })),
        departmentShift: rules.departmentShifts.find((d) => d.department === selected)?.shiftId ?? rules.defaultShiftId,
        rows,
        holidays: dates.map((_d) => null as string | null),
        weeklyOff: await weeklyOff(repo, selected),
        swapQueue: await Promise.all(swaps.map((s) => swapDto(repo, ctx, s.id))),
        canEditWeeklyOff: isOrgWide(ctx.actor, "policy.publish"),
      };
    },
    saveRoster(
      ctx: CommandContext,
      department: string,
      weekStart: string,
      intent: "save" | "publish",
      cells: Record<string, (string | null)[]>,
    ) {
      return timeCommand(prisma, ctx, "roster.save", async (r) =>
        saveRoster(r, ctx, department, weekStart, intent, cells),
      );
    },
    pattern(ctx: CommandContext, input: z.infer<typeof rosterPatternInputSchema>) {
      return timeCommand(prisma, ctx, "roster.pattern", async (r) => {
        const people = (await scopedPeople(r, ctx.actor)).filter((e) => e.department.name === input.department),
          previous = await r.document(`roster:${input.department}:${addDays(input.weekStart, -7)}`),
          old = previous ? rosterPayload.parse(previous.payload) : null;
        if (input.pattern === "copy_previous" && !old)
          fail("NO_PREVIOUS_ROSTER", "There is no previous roster to copy.", 409);
        const cells: Record<string, (string | null)[]> = {};
        for (const [index, e] of people.entries())
          cells[e.id] =
            input.pattern === "copy_previous"
              ? (old?.cells[e.id] ?? Array<null>(7).fill(null))
              : input.pattern === "all_default"
                ? Array<null>(7).fill(null)
                : Array.from({ length: 7 }, (_, i) => (i >= 5 ? "off" : (index + i) % 2 ? input.first : input.second));
        const result = await saveRoster(r, ctx, input.department, input.weekStart, "save", cells);
        return { ok: true, version: result.version };
      });
    },
    saveWeeklyOff(ctx: CommandContext, input: z.infer<typeof weeklyOffInputSchema>) {
      // Weekly-off rules are attendance policy: organization-level (BE-003).
      requireOrgWide(ctx.actor, "policy.publish");
      return timeCommand(prisma, ctx, "roster.weekly_off.save", async (r) => {
        if (!(await r.departments()).some((d) => d.name === input.department))
          fail("INVALID_DEPARTMENT", "Choose an active department.");
        await r.saveDocument(`weekly_off:${input.department}`, "weekly_off", {
          ...input,
          label:
            input.offWeekdays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") +
            (input.alternateSaturdays ? " and alternate Saturdays" : ""),
        });
        return { ok: true };
      });
    },
    swap(ctx: CommandContext, input: z.infer<typeof shiftSwapInputSchema>) {
      return timeCommand(prisma, ctx, "roster.swap.create", async (r, reference) => {
        const me = await employeeOf(r, ctx.actor.employeeId),
          other = await employeeOf(r, input.colleagueId);
        if (me.id === other.id || me.departmentId !== other.departmentId || !me.managerId)
          fail("INVALID_COLLEAGUE", "Choose a colleague from your department.");
        if (input.date < todayInOrgZone() || daysBetween(todayInOrgZone(), input.date) > 90)
          fail("INVALID_DATE", "Choose an upcoming roster date.");
        const a = await calendarDay(r, me.id, input.date),
          b = await calendarDay(r, other.id, input.date);
        if (
          a.off ||
          b.off ||
          a.holiday ||
          b.holiday ||
          a.leave ||
          b.leave ||
          a.source !== "roster" ||
          b.source !== "roster" ||
          a.shift.id === b.shift.id
        )
          fail("INVALID_SWAP", "Published, different working shifts are required.");
        if (
          (
            await r.workflows({
              kind: "shift_swap",
              state: "pending",
              startDate: input.date,
              OR: [
                { employeeId: { in: [me.id, other.id] } },
                { payload: { path: ["colleagueId"], equals: me.id } },
                { payload: { path: ["colleagueId"], equals: other.id } },
              ],
            })
          ).length
        )
          fail("DUPLICATE_SWAP", "One participant already has a pending swap.", 409);
        const ref = await reference("SW");
        await r.createWorkflow({
          id: newId("swap"),
          reference: ref,
          kind: "shift_swap",
          employeeId: me.id,
          approverId: me.managerId,
          startDate: input.date,
          endDate: input.date,
          payload: json({ ...input, requesterShift: a.shift.id, colleagueShift: b.shift.id }),
        });
        return { reference: ref, state: "pending" };
      });
    },
    decideSwap(ctx: CommandContext, id: string, decision: "approve" | "reject", note: string) {
      return timeCommand(prisma, ctx, `roster.swap.${id}.${decision}`, async (r) => {
        const row = await workflowOf(r, id, "shift_swap");
        await requireDecision(r, ctx.actor, row);
        requirePending(row);
        assertVersion(row.version, ctx.version);
        const p = swapPayload.parse(row.payload);
        if (decision === "approve") {
          const e = await employeeOf(r, row.employeeId),
            a = await calendarDay(r, e.id, p.date),
            b = await calendarDay(r, p.colleagueId, p.date);
          if (
            a.shift.id !== p.requesterShift ||
            b.shift.id !== p.colleagueShift ||
            a.leave ||
            b.leave ||
            p.date < todayInOrgZone()
          )
            fail("STALE_ROSTER", "The roster or leave changed. Submit a new swap.", 409);
          const doc = await r.document(`roster:${e.department.name}:${monday(p.date)}`);
          if (!doc) fail("ROSTER_NOT_PUBLISHED", "Roster is unavailable.", 409);
          const roster = rosterPayload.parse(doc.payload),
            index = daysBetween(monday(p.date), p.date);
          for (const [employeeId, shift] of [
            [row.employeeId, p.colleagueShift],
            [p.colleagueId, p.requesterShift],
          ] as const) {
            const cell = roster.cells[employeeId] ?? Array<string | null>(7).fill(null),
              published = roster.publishedCells[employeeId] ?? Array<string | null>(7).fill(null);
            cell[index] = shift;
            published[index] = shift;
            roster.cells[employeeId] = cell;
            roster.publishedCells[employeeId] = published;
          }
          await r.saveDocument(doc.id, "roster", roster);
        }
        const state = decision === "approve" ? "approved" : "rejected";
        await r.updateWorkflow(id, {
          state,
          version: { increment: 1 },
          decidedAt: new Date(),
          decidedBy: ctx.actor.employeeId,
          decisionNote: note,
        });
        return { reference: row.reference, state };
      });
    },
    cancelSwap: (ctx: CommandContext, id: string) =>
      timeCommand(prisma, ctx, `roster.swap.${id}.cancel`, async (r) => {
        const row = await workflowOf(r, id, "shift_swap");
        requireOwner(ctx.actor, row);
        requirePending(row);
        await r.updateWorkflow(id, { state: "cancelled", version: { increment: 1 } });
        return { reference: row.reference, state: "cancelled" };
      }),
  };
}
async function swapDto(repo: TimeRepository, ctx: CommandContext, id: string) {
  const row = await workflowOf(repo, id, "shift_swap"),
    p = swapPayload.parse(row.payload),
    rules = await attendanceRules(repo);
  return {
    id,
    reference: row.reference,
    requester: personRef(await employeeOf(repo, row.employeeId)),
    colleague: personRef(await employeeOf(repo, p.colleagueId)),
    date: p.date,
    requesterShift: rules.shifts.find((s) => s.id === p.requesterShift)?.name ?? p.requesterShift,
    colleagueShift: rules.shifts.find((s) => s.id === p.colleagueShift)?.name ?? p.colleagueShift,
    reason: p.reason,
    state: row.state,
    submittedAt: row.createdAt.toISOString(),
    decisionNote: row.decisionNote,
    canDecide: row.state === "pending" && (await canDecide(repo, ctx.actor, row)),
    version: row.version,
  };
}
async function saveRoster(
  repo: TimeRepository,
  ctx: CommandContext,
  department: string,
  weekStart: string,
  intent: "save" | "publish",
  cells: Record<string, (string | null)[]>,
) {
  if (monday(weekStart) !== weekStart) fail("INVALID_WEEK", "The roster week must start on Monday.");
  const people = (await scopedPeople(repo, ctx.actor)).filter((e) => e.department.name === department),
    ids = new Set(people.map((e) => e.id));
  if (!people.length) fail("FORBIDDEN", "This department is outside your team.", 403);
  if (Object.keys(cells).some((id) => !ids.has(id))) fail("FORBIDDEN", "A roster member is outside your team.", 403);
  const rules = await attendanceRules(repo);
  if (
    Object.values(cells)
      .flat()
      .some((cell) => cell !== null && cell !== "off" && !rules.shifts.some((s) => s.id === cell))
  )
    fail("INVALID_SHIFT", "Select a configured shift.");
  const key = `roster:${department}:${weekStart}`,
    existing = await repo.document(key);
  assertVersion(existing?.version ?? 0, ctx.version);
  const previous = existing ? rosterPayload.parse(existing.payload) : null;
  const merged = { ...previous?.cells, ...cells };
  const payload = {
    department,
    weekStart,
    status: intent === "publish" ? "published" : previous?.publishedAt ? "changes" : "draft",
    cells: merged,
    publishedCells: intent === "publish" ? merged : (previous?.publishedCells ?? {}),
    publishedAt: intent === "publish" ? new Date().toISOString() : (previous?.publishedAt ?? null),
    publishedBy:
      intent === "publish" ? (await employeeOf(repo, ctx.actor.employeeId)).name : (previous?.publishedBy ?? null),
  };
  const saved = await repo.saveDocument(key, "roster", payload, department);
  return { status: payload.status, version: saved.version };
}
export function createTimeConfigService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  // Holidays, leave types, shifts, sites and attendance rules are organization-level policy (BE-003): a
  // department-scoped HR operator cannot read or change them through the configuration endpoints.
  const orgWide = (ctx: CommandContext) => {
    requireOrgWide(ctx.actor, "policy.publish");
  };
  return {
    holidays: async (ctx: CommandContext) => {
      orgWide(ctx);
      return holidaysFor(repo);
    },
    types: async (ctx: CommandContext) => {
      orgWide(ctx);
      return policyTypes(repo);
    },
    version: () => policyVersion(repo),
    rules: async (ctx: CommandContext) => {
      orgWide(ctx);
      return attendanceRules(repo);
    },
    saveHoliday: async (ctx: CommandContext, input: z.infer<typeof holidayInputSchema>, id?: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "holiday.save", async (r) => {
        const key = id ?? newId("hol");
        if (id && !(await r.document(id))) fail("NOT_FOUND", "Holiday was not found.", 404);
        await r.saveDocument(key, "holiday", { ...input, id: key });
        return { id: key };
      });
    },
    deleteHoliday: async (ctx: CommandContext, id: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "holiday.delete", async (r) => {
        const doc = await r.document(id);
        if (!doc || doc.kind !== "holiday") fail("NOT_FOUND", "Holiday was not found.", 404);
        await r.deleteDocument(id);
        return { ok: true };
      });
    },
    saveType: async (ctx: CommandContext, input: z.infer<typeof leaveTypeInputSchema>, id?: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "leave.policy.save", async (r) => {
        const key = id ?? newId("lt"),
          types = await policyTypes(r),
          existing = types.find((t) => t.id === key);
        if (id && !existing) fail("NOT_FOUND", "Leave type was not found.", 404);
        if (types.some((t) => t.code === input.code && t.id !== key))
          fail("DUPLICATE_CODE", "That leave code already exists.", 409);
        const inUse =
          (await r.workflows({ kind: "leave", payload: { path: ["leaveTypeId"], equals: key } })).length > 0;
        if (existing && inUse && existing.code !== input.code)
          fail("POLICY_IN_USE", "A used leave code cannot be changed.", 409);
        await r.saveDocument(key, "leave_type", {
          ...input,
          id: key,
          entitledDays: input.unlimited ? null : input.entitledDays || "0",
          carryForwardDays: input.carryForwardDays || "0",
          maxEncashDays: input.maxEncashDays || "0",
          minRetainDays: input.minRetainDays || "0",
          negativeDays: input.negativeDays || "0",
          maxConsecutiveDays: input.maxConsecutiveDays === "" ? null : input.maxConsecutiveDays,
          documentAfterDays: input.documentAfterDays === "" ? null : input.documentAfterDays,
          expiryDays: input.expiryDays === "" ? null : input.expiryDays,
          inUse,
        });
        const version = String(Number(await policyVersion(r)) + 1);
        await r.saveDocument("leave_policy_version", "policy_version", version);
        return { id: key, version };
      });
    },
    saveShift: async (ctx: CommandContext, input: z.infer<typeof shiftInputSchema>, id?: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.shift.save", async (r) => {
        const rules = await attendanceRules(r),
          key = id ?? newId("shift");
        if (id && !rules.shifts.some((s) => s.id === id)) fail("NOT_FOUND", "Shift was not found.", 404);
        rules.shifts = [...rules.shifts.filter((s) => s.id !== key), { ...input, id: key }];
        await r.saveDocument("attendance_rules", "attendance_rules", rules);
        return { id: key };
      });
    },
    shiftAction: async (ctx: CommandContext, id: string, action: "delete" | "default") => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, `attendance.shift.${action}`, async (r) => {
        const rules = await attendanceRules(r);
        if (!rules.shifts.some((s) => s.id === id)) fail("NOT_FOUND", "Shift was not found.", 404);
        if (action === "default") rules.defaultShiftId = id;
        else {
          if (
            rules.defaultShiftId === id ||
            rules.departmentShifts.some((s) => s.shiftId === id) ||
            (await r.documents("roster")).some((d) =>
              Object.values(rosterPayload.parse(d.payload).cells).flat().includes(id),
            )
          )
            fail("SHIFT_IN_USE", "This shift is assigned to a default, department or roster.", 409);
          rules.shifts = rules.shifts.filter((s) => s.id !== id);
        }
        await r.saveDocument("attendance_rules", "attendance_rules", rules);
        return { ok: true };
      });
    },
    departmentShift: async (ctx: CommandContext, department: string, shiftId: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.department_shift.save", async (r) => {
        const rules = await attendanceRules(r);
        if (!(await r.departments()).some((d) => d.name === department) || !rules.shifts.some((s) => s.id === shiftId))
          fail("INVALID_REFERENCE", "Choose an active department and shift.");
        rules.departmentShifts = [
          ...rules.departmentShifts.filter((s) => s.department !== department),
          { department, shiftId },
        ];
        await r.saveDocument("attendance_rules", "attendance_rules", rules);
        return { ok: true };
      });
    },
    overtime: async (ctx: CommandContext, input: z.infer<typeof overtimeInputSchema>) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.overtime.save", async (r) => {
        const rules = await attendanceRules(r);
        await r.saveDocument("attendance_rules", "attendance_rules", { ...rules, overtime: input });
        return { ok: true };
      });
    },
    lateEarly: async (ctx: CommandContext, input: z.infer<typeof lateEarlyInputSchema>) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.late_early.save", async (r) => {
        const rules = await attendanceRules(r);
        await r.saveDocument("attendance_rules", "attendance_rules", { ...rules, lateEarly: input });
        return { ok: true };
      });
    },
    site: async (ctx: CommandContext, input: z.infer<typeof officeSiteInputSchema>, id?: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.site.save", async (r) => {
        const rules = await attendanceRules(r),
          key = id ?? newId("site");
        if (id && !rules.sites.some((s) => s.id === id)) fail("NOT_FOUND", "Office site was not found.", 404);
        rules.sites = [...rules.sites.filter((s) => s.id !== key), { ...input, id: key }];
        await r.saveDocument("attendance_rules", "attendance_rules", rules);
        return { id: key };
      });
    },
    deleteSite: async (ctx: CommandContext, id: string) => {
      orgWide(ctx);
      return timeCommand(prisma, ctx, "attendance.site.delete", async (r) => {
        const rules = await attendanceRules(r);
        if (!rules.sites.some((s) => s.id === id)) fail("NOT_FOUND", "Office site was not found.", 404);
        rules.sites = rules.sites.filter((s) => s.id !== id);
        await r.saveDocument("attendance_rules", "attendance_rules", rules);
        return { ok: true };
      });
    },
    async address(ctx: CommandContext, query: string) {
      orgWide(ctx);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "GTFHR/1.0 office-location-configuration" }, signal: AbortSignal.timeout(5000) },
      ).catch(() => null);
      if (!response?.ok)
        fail(
          "ADDRESS_LOOKUP_UNAVAILABLE",
          "Address lookup is temporarily unavailable. Enter coordinates manually.",
          503,
        );
      const rows = z
        .array(z.object({ display_name: z.string(), lat: z.string(), lon: z.string() }))
        .parse(await response.json());
      return rows.map((v) => ({ label: v.display_name, latitude: Number(v.lat), longitude: Number(v.lon) }));
    },
  };
}

/** Report/payroll entry point with explicit authorization and employee selection. */
export async function employeeAttendanceMonth(
  prisma: PrismaClient | import("../time/time.repository.js").TimeClient,
  ctx: CommandContext,
  employeeId: string,
  month: string,
): Promise<AttendanceMonth> {
  const caps = ["report.read", "payroll.prepare", "payroll.approve"] as const;
  if (!caps.some((cap) => can(ctx.actor, cap))) fail("FORBIDDEN", "You cannot read organization attendance.", 403);
  const repo = createTimeRepository(prisma);
  await employeeOf(repo, employeeId);
  // BE-003: a department-scoped reader only reaches employees of their departments (404 outside, no probing).
  let inScope = false;
  for (const cap of caps) if (!inScope) inScope = await administers(repo, ctx.actor, cap, employeeId);
  if (!inScope) fail("EMPLOYEE_NOT_FOUND", "Employee was not found.", 404);
  return classifiedMonth(repo, employeeId, month);
}

async function classifiedMonth(repo: TimeRepository, employeeId: string, month: string): Promise<AttendanceMonth> {
  const dates = monthDates(month),
    today = todayInOrgZone();
  const [punches, regs, rules, calendar] = await Promise.all([
    repo.attendanceDays(employeeId, required(dates[0]), required(dates.at(-1))),
    repo.workflows({ kind: "regularization", employeeId }),
    attendanceRules(repo),
    employeeCalendar(repo, employeeId, required(dates[0]), required(dates.at(-1))),
  ]);
  const days: AttendanceDay[] = [];
  let marks = 0;
  for (const date of dates) {
    const p = punches.find((p) => p.date === date),
      cal = required(calendar.get(date)),
      reg = regs.find((r) => r.startDate === date && ["pending", "approved", "rejected"].includes(r.state));
    const firstIn = clockTime(p?.firstIn ?? null),
      lastOut = clockTime(p?.lastOut ?? null);
    const lateMinutes = firstIn
      ? Math.max(0, minutesOf(firstIn) - minutesOf(cal.shift.start) - cal.shift.graceMinutes)
      : 0;
    const earlyMinutes = lastOut
      ? Math.max(0, minutesOf(cal.shift.end) - minutesOf(lastOut) - rules.lateEarly.earlyGraceMinutes)
      : 0;
    if (rules.lateEarly.enabled && (lateMinutes > 0 || (earlyMinutes > 0 && rules.lateEarly.countEarlyGoing))) marks++;
    const deduction =
      rules.lateEarly.enabled &&
      marks > 0 &&
      marks % rules.lateEarly.marksPerHalfDay === 0 &&
      (lateMinutes > 0 || earlyMinutes > 0)
        ? ("half_day" as const)
        : null;
    const wfh = cal.leave?.state === "approved" && cal.type?.countsAsPresent === true;
    const overtimeMinutes =
      rules.overtime.enabled && lastOut
        ? Math.min(
            rules.overtime.dailyCapMinutes,
            Math.floor(
              Math.max(0, minutesOf(lastOut) - minutesOf(cal.shift.end) - rules.overtime.startsAfterMinutes) /
                rules.overtime.blockMinutes,
            ) * rules.overtime.blockMinutes,
          )
        : 0;
    const state: AttendanceDay["state"] =
      date > today
        ? "upcoming"
        : p?.firstIn && !p.lastOut && date < today
          ? "needs_review"
          : cal.leave?.state === "approved" && !wfh
            ? "leave"
            : cal.holiday
              ? "holiday"
              : cal.off
                ? "weekly_off"
                : !p?.firstIn
                  ? "absent"
                  : deduction
                    ? "half_day"
                    : lateMinutes > 0
                      ? "late"
                      : p.workedMinutes > 0 && p.workedMinutes < 240
                        ? "half_day"
                        : "present";
    days.push({
      id: p?.id ?? `${employeeId}:${date}`,
      date,
      state,
      firstIn,
      lastOut,
      workedMinutes: p?.workedMinutes ?? 0,
      overtimeMinutes,
      exception: state === "needs_review" ? "Missing check-out" : null,
      regularization: reg ? z.enum(["pending", "approved", "rejected"]).parse(reg.state) : null,
      shiftName: cal.off || cal.holiday ? null : cal.shift.name,
      lateMinutes,
      earlyMinutes,
      deduction,
      wfh,
      leaveCode: cal.leave?.state === "approved" ? (cal.type?.code ?? null) : null,
    });
  }
  const n = (s: AttendanceDay["state"]) => days.filter((d) => d.state === s).length,
    worked = days.filter((d) => d.workedMinutes > 0);
  return {
    month,
    days,
    summary: {
      present: n("present") + n("half_day"),
      late: n("late"),
      absent: n("absent"),
      leave: n("leave"),
      needsReview: n("needs_review"),
      averageWorkedMinutes: worked.length
        ? Math.round(worked.reduce((s, d) => s + d.workedMinutes, 0) / worked.length)
        : 0,
      overtimeMinutes: days.reduce((s, d) => s + d.overtimeMinutes, 0),
      overtimeCompensation: rules.overtime.enabled ? rules.overtime.compensation : null,
      wfh: days.filter((d) => d.wfh).length,
      lop: days.filter((d) => d.leaveCode === "LOP").length,
      earlyGoing: days.filter((d) => d.earlyMinutes > 0).length,
      lateDeductions: days.filter((d) => d.deduction).length,
      weeklyOffs: n("weekly_off"),
      holidays: n("holiday"),
      marksPerHalfDay: rules.lateEarly.enabled ? rules.lateEarly.marksPerHalfDay : null,
      workedOnOffDays: days.filter((d) => ["weekly_off", "holiday"].includes(d.state) && d.workedMinutes > 0).length,
    },
  };
}
