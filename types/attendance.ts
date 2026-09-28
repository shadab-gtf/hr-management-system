import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "@/types/common";

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
  exception: z.string().nullable(),
  regularization: z.enum(["pending", "approved", "rejected"]).nullable(),
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
  }),
});

export const teamAttendanceRowSchema = z.object({
  person: personRefSchema,
  state: todayStateSchema,
  checkedInAt: instantSchema.nullable(),
  exception: z.string().nullable(),
});

export type AttendanceDayState = z.infer<typeof attendanceDayStateSchema>;
export type TodayState = z.infer<typeof todayStateSchema>;
export type AttendanceDay = z.infer<typeof attendanceDaySchema>;
export type AttendanceToday = z.infer<typeof attendanceTodaySchema>;
export type AttendanceMonth = z.infer<typeof attendanceMonthSchema>;
export type TeamAttendanceRow = z.infer<typeof teamAttendanceRowSchema>;
