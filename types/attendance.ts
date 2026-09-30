import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "@/types/common";
import { locationCheckSchema } from "@/types/location";

export const attendanceDayStateSchema = z.enum([
  "present",
  "late",
  "half_day",
  "absent",
  "leave",
  "holiday",
  "weekly_off",
  "needs_review",
  "upcoming",
]);

export const todayStateSchema = z.enum([
  "not_recorded",
  "checked_in",
  "checked_out",
  "needs_review",
  "unavailable",
]);

export const shiftSchema = z.object({
  name: z.string(),
  start: z.string(),
  end: z.string(),
  graceMinutes: z.number().int().nonnegative(),
});

export const attendanceDaySchema = z.object({
  id: z.string(),
  date: isoDateSchema,
  state: attendanceDayStateSchema,
  firstIn: z.string().nullable(),
  lastOut: z.string().nullable(),
  workedMinutes: z.number().int().nonnegative(),
  /** Counted under the HR overtime policy (blocks after the shift-end buffer). */
  overtimeMinutes: z.number().int().nonnegative(),
  exception: z.string().nullable(),
  regularization: z.enum(["pending", "approved", "rejected"]).nullable(),
  /** Rostered (or department) shift for the day; null on week-offs and holidays. */
  shiftName: z.string().nullable(),
  lateMinutes: z.number().int().nonnegative(),
  earlyMinutes: z.number().int().nonnegative(),
  /** Late/early policy: this mark triggered a half-day deduction. */
  deduction: z.enum(["half_day"]).nullable(),
  wfh: z.boolean(),
  /** Leave type code when on leave (e.g. LOP). */
  leaveCode: z.string().nullable(),
});

export const attendanceTodaySchema = z.object({
  businessDate: isoDateSchema,
  timezone: z.string(),
  state: todayStateSchema,
  shift: shiftSchema,
  checkedInAt: instantSchema.nullable(),
  checkedOutAt: instantSchema.nullable(),
  workedMinutes: z.number().int().nonnegative(),
  nextAction: z.enum(["check_in", "check_out"]).nullable(),
  /** Server-verified location evidence label for today's check-in, if shared. */
  checkInLocation: z.string().nullable(),
  /** Full location evidence for today's punches (own record only). */
  checkInEvidence: locationCheckSchema.nullable(),
  checkOutEvidence: locationCheckSchema.nullable(),
  lastUpdatedAt: instantSchema,
});

export const attendanceMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  days: z.array(attendanceDaySchema),
  summary: z.object({
    present: z.number().int(),
    late: z.number().int(),
    absent: z.number().int(),
    leave: z.number().int(),
    needsReview: z.number().int(),
    averageWorkedMinutes: z.number().int(),
    overtimeMinutes: z.number().int(),
    overtimeCompensation: z.enum(["comp_off", "paid"]).nullable(),
    wfh: z.number().int(),
    lop: z.number().int(),
    earlyGoing: z.number().int(),
    /** Half-day deductions from late/early marks (count of half days). */
    lateDeductions: z.number().int(),
    weeklyOffs: z.number().int(),
    holidays: z.number().int(),
    marksPerHalfDay: z.number().int().nullable(),
    workedOnOffDays: z.number().int(),
  }),
});

export const teamAttendanceRowSchema = z.object({
  person: personRefSchema,
  state: todayStateSchema,
  checkedInAt: instantSchema.nullable(),
  exception: z.string().nullable(),
});

/* Shift roster ------------------------------------------------------------ */

/** A roster cell: a shift id, "off" (week-off) or null (department default). */
export const rosterCellSchema = z.string().nullable();

export const rosterShiftOptionSchema = z.object({ id: z.string(), name: z.string(), start: z.string(), end: z.string(), short: z.string() });

export const rosterDaySchema = z.object({
  date: isoDateSchema,
  shift: rosterShiftOptionSchema.nullable(),
  weekOff: z.boolean(),
  holiday: z.string().nullable(),
  onLeave: z.string().nullable(),
  source: z.enum(["roster", "department", "default"]),
});

export const weeklyOffRuleSchema = z.object({
  department: z.string(),
  offWeekdays: z.array(z.number().int().min(0).max(6)),
  alternateSaturdays: z.boolean(),
  label: z.string(),
});

export const shiftSwapSchema = z.object({
  id: z.string(),
  reference: z.string(),
  requester: personRefSchema,
  colleague: personRefSchema,
  date: isoDateSchema,
  requesterShift: z.string(),
  colleagueShift: z.string(),
  reason: z.string(),
  state: z.enum(["pending", "approved", "rejected", "cancelled"]),
  submittedAt: instantSchema,
  decisionNote: z.string().nullable(),
  canDecide: z.boolean(),
  version: z.number().int(),
});

export const myRosterSchema = z.object({
  view: z.enum(["week", "month"]),
  anchor: isoDateSchema,
  label: z.string(),
  department: z.string(),
  days: z.array(rosterDaySchema),
  weeklyOff: weeklyOffRuleSchema,
  swaps: z.array(shiftSwapSchema),
  /** Colleagues (same department) and their shift per upcoming published day, for swap requests. */
  swapOptions: z.array(z.object({ date: isoDateSchema, mine: z.string(), colleagues: z.array(z.object({ id: z.string(), name: z.string(), shift: z.string() })) })),
});

export const rosterPlannerSchema = z.object({
  department: z.string(),
  departments: z.array(z.string()),
  weekStart: isoDateSchema,
  dates: z.array(isoDateSchema),
  status: z.enum(["none", "draft", "published", "changes"]),
  publishedAt: instantSchema.nullable(),
  publishedBy: z.string().nullable(),
  version: z.number().int(),
  shifts: z.array(rosterShiftOptionSchema),
  departmentShift: z.string(),
  rows: z.array(
    z.object({
      person: personRefSchema,
      cells: z.array(rosterCellSchema),
      /** What employees currently see for each day (published or default). */
      effective: z.array(z.string()),
      leave: z.array(z.string().nullable()),
    }),
  ),
  holidays: z.array(z.string().nullable()),
  weeklyOff: weeklyOffRuleSchema,
  swapQueue: z.array(shiftSwapSchema),
  canEditWeeklyOff: z.boolean(),
});

export const rosterSaveInputSchema = z.object({
  department: z.string().min(1),
  weekStart: isoDateSchema,
  intent: z.enum(["save", "publish"]),
  version: z.coerce.number().int(),
});
export const rosterPatternInputSchema = z.object({
  department: z.string().min(1),
  weekStart: isoDateSchema,
  pattern: z.enum(["rotate", "all_default", "copy_previous"]),
  first: z.string().default(""),
  second: z.string().default(""),
});
export const weeklyOffInputSchema = z.object({
  department: z.string().min(1),
  offWeekdays: z.array(z.coerce.number().int().min(0).max(6)).max(3, "At most 3 fixed week-off days."),
  alternateSaturdays: z.boolean(),
});
export const shiftSwapInputSchema = z.object({
  date: isoDateSchema,
  colleagueId: z.string().min(1, "Choose a colleague."),
  reason: z.string().trim().min(5, "Say why (at least 5 characters).").max(300),
});

export type RosterShiftOption = z.infer<typeof rosterShiftOptionSchema>;
export type RosterDay = z.infer<typeof rosterDaySchema>;
export type WeeklyOffRule = z.infer<typeof weeklyOffRuleSchema>;
export type ShiftSwap = z.infer<typeof shiftSwapSchema>;
export type MyRoster = z.infer<typeof myRosterSchema>;
export type RosterPlanner = z.infer<typeof rosterPlannerSchema>;
export type RosterSaveInput = z.infer<typeof rosterSaveInputSchema>;
export type RosterPatternInput = z.infer<typeof rosterPatternInputSchema>;
export type WeeklyOffInput = z.infer<typeof weeklyOffInputSchema>;
export type ShiftSwapInput = z.infer<typeof shiftSwapInputSchema>;

export type AttendanceDayState = z.infer<typeof attendanceDayStateSchema>;
export type TodayState = z.infer<typeof todayStateSchema>;
export type AttendanceDay = z.infer<typeof attendanceDaySchema>;
export type AttendanceToday = z.infer<typeof attendanceTodaySchema>;
export type AttendanceMonth = z.infer<typeof attendanceMonthSchema>;
export type TeamAttendanceRow = z.infer<typeof teamAttendanceRowSchema>;
