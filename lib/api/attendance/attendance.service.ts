import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  attendanceMonth,
  attendanceToday,
  captureAttendance,
  requestRegularization,
  teamAttendance,
} from "@/lib/mocks/handlers/attendance";
import {
  applyRosterPattern,
  cancelShiftSwap,
  decideShiftSwap,
  myRoster,
  requestShiftSwap,
  rosterPlanner,
  saveRoster,
  saveWeeklyOff,
} from "@/lib/mocks/handlers/roster";
import type { LocationCheck } from "@/types/location";
import type { DecisionInput } from "@/types/leave";
import {
  attendanceMonthSchema,
  attendanceTodaySchema,
  myRosterSchema,
  rosterPlannerSchema,
  teamAttendanceRowSchema,
  type RosterPatternInput,
  type RosterSaveInput,
  type ShiftSwapInput,
  type WeeklyOffInput,
} from "@/types/attendance";

export const getAttendanceToday = cache(async () =>
  callApi({
    schema: attendanceTodaySchema,
    live: { path: "/attendance/today" },
    mock: async () => attendanceToday(await mockActor()),
  }),
);

export const getAttendanceMonth = cache(async (month: string) =>
  callApi({
    schema: attendanceMonthSchema,
    live: { path: "/attendance/days", query: { month } },
    mock: async () => attendanceMonth(await mockActor(), month),
  }),
);

export const getTeamAttendance = cache(async () =>
  callApi({
    schema: z.array(teamAttendanceRowSchema),
    live: { path: "/attendance/team/today" },
    mock: async () => teamAttendance(await mockActor()),
  }),
);

export async function recordAttendance(
  direction: "check_in" | "check_out",
  idempotencyKey: string,
  location: LocationCheck | null = null,
) {
  return callApi({
    schema: z.object({ reference: z.string(), recordedAt: z.string(), direction: z.string() }),
    live: {
      method: "POST",
      path: "/attendance/events",
      body: { direction, source: "web_self_service", location },
      idempotencyKey,
    },
    mock: async () => captureAttendance(await mockActor(), direction, idempotencyKey, location),
  });
}

export async function submitRegularization(
  input: { date: string; proposedIn: string; proposedOut: string; reason: string },
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string(), approver: z.string() }),
    live: { method: "POST", path: "/attendance/regularizations", body: input, idempotencyKey },
    mock: async () => requestRegularization(await mockActor(), input, idempotencyKey),
  });
}

/* Shift roster -------------------------------------------------------------- */

export const getMyRoster = cache(async (view: "week" | "month", anchor: string) =>
  callApi({
    schema: myRosterSchema,
    live: { path: "/attendance/roster/me", query: { view, anchor } },
    mock: async () => myRoster(await mockActor(), view, anchor),
  }),
);

export const getRosterPlanner = cache(async (department?: string, weekStart?: string) =>
  callApi({
    schema: rosterPlannerSchema,
    live: { path: "/attendance/roster/planner", query: { department, weekStart } },
    mock: async () => rosterPlanner(await mockActor(), department, weekStart),
  }),
);

export async function saveRosterWeek(input: RosterSaveInput, cells: Record<string, (string | null)[]>, idempotencyKey: string) {
  return callApi({
    schema: z.object({ status: z.string(), version: z.number() }),
    live: { method: "PATCH", path: `/attendance/roster/${encodeURIComponent(input.department)}/${input.weekStart}`, ifMatch: input.version, body: { intent: input.intent, cells }, idempotencyKey },
    mock: async () => saveRoster(await mockActor(), input, cells, idempotencyKey),
  });
}

export async function applyRosterWeekPattern(input: RosterPatternInput) {
  return callApi({
    schema: z.object({ ok: z.boolean(), version: z.number() }),
    live: { method: "POST", path: `/attendance/roster/${encodeURIComponent(input.department)}/${input.weekStart}/pattern`, body: input },
    mock: async () => applyRosterPattern(await mockActor(), input),
  });
}

export async function saveWeeklyOffRule(input: WeeklyOffInput) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "PATCH", path: `/config/weekly-offs/${encodeURIComponent(input.department)}`, body: input },
    mock: async () => saveWeeklyOff(await mockActor(), input),
  });
}

export async function submitShiftSwap(input: ShiftSwapInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: "/attendance/roster/swaps", body: input, idempotencyKey },
    mock: async () => requestShiftSwap(await mockActor(), input, idempotencyKey),
  });
}
export async function decideSwap(input: DecisionInput) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: `/attendance/roster/swaps/${encodeURIComponent(input.id)}/decision`, ifMatch: input.version, body: { decision: input.decision, note: input.note } },
    mock: async () => decideShiftSwap(await mockActor(), input),
  });
}
export async function cancelSwap(id: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: `/attendance/roster/swaps/${encodeURIComponent(id)}/cancel`, body: {} },
    mock: async () => cancelShiftSwap(await mockActor(), id),
  });
}
