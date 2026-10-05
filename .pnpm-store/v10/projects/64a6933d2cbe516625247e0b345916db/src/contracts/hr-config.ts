import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "./common.js";
import { employmentTypeSchema } from "./employee.js";
import { holidaySchema } from "./leave.js";

/*
 * HR-owned configuration (policy.publish scope). These DTOs describe what HR
 * administers; the live service owns versioning, approval and effective dates.
 */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).");
const name = (label: string, max = 80) => z.string().trim().min(2, `${label} needs at least 2 characters.`).max(max);
const checkbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());

/* Holidays ----------------------------------------------------------------- */

export const holidayRecordSchema = holidaySchema.extend({
  id: z.string(),
  /** Empty = every location. */
  locations: z.array(z.string()),
});

export const holidayInputSchema = z.object({
  id: z.string().optional(),
  name: name("Holiday name"),
  date: isoDateSchema,
  kind: holidaySchema.shape.kind,
  locations: z.array(z.string().max(60)).max(20).default([]),
});

/* Events & celebrations ---------------------------------------------------- */

export const eventCategorySchema = z.enum(["town_hall", "celebration", "training", "offsite", "other"]);

export const companyEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: isoDateSchema,
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  venue: z.string(),
  description: z.string(),
  category: eventCategorySchema,
  /** "Everyone" or a department name. */
  audience: z.string(),
});

export const eventInputSchema = z
  .object({
    id: z.string().optional(),
    title: name("Title", 120),
    date: isoDateSchema,
    startTime: z.union([time, z.literal("")]).default(""),
    endTime: z.union([time, z.literal("")]).default(""),
    venue: z.string().trim().min(2, "Add a venue or “Online”.").max(120),
    description: z.string().trim().max(1000).default(""),
    category: eventCategorySchema,
    audience: z.string().trim().min(1).max(60).default("Everyone"),
    shareToFeed: checkbox.default(false),
  })
  .refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after the start time.",
  });

export const celebrationSettingsSchema = z.object({
  showWorkAnniversaries: z.boolean(),
  showNewJoiners: z.boolean(),
  /** Birthdays are private (security.md) and stay off unless consent exists. */
  showBirthdays: z.literal(false),
});
export const celebrationSettingsInputSchema = z.object({
  showWorkAnniversaries: checkbox,
  showNewJoiners: checkbox,
});

/* Leave policy ------------------------------------------------------------- */

export const leaveAccrualSchema = z.enum(["annual_upfront", "monthly", "none"]);
export const leaveGenderSchema = z.enum(["any", "female", "male"]);

export const leaveTypeConfigSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  /** Annual entitlement in days (exact decimal); null = unlimited/unpaid. */
  entitledDays: z.string().nullable(),
  allowHalfDay: z.boolean(),
  carryForwardDays: z.string(),
  countsAsPresent: z.boolean(),
  active: z.boolean(),
  inUse: z.boolean(),
  /** Policy engine rules (enforced on apply, encashment and year-end). */
  accrual: leaveAccrualSchema,
  encashable: z.boolean(),
  maxEncashDays: z.string(),
  minRetainDays: z.string(),
  maxConsecutiveDays: z.number().int().nullable(),
  minNoticeDays: z.number().int(),
  backdateDays: z.number().int(),
  sandwich: z.boolean(),
  negativeDays: z.string(),
  gender: leaveGenderSchema,
  employmentTypes: z.array(employmentTypeSchema),
  afterProbationOnly: z.boolean(),
  minServiceDays: z.number().int(),
  /** Supporting document required when a request is longer than this many days (0 = always). */
  documentAfterDays: z.number().int().nullable(),
  /** Credits expire after this many days (comp-off). */
  expiryDays: z.number().int().nullable(),
});

const days = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.5)?$/, "Use whole or half days, e.g. 12 or 7.5.");

const smallInt = (max: number, label: string) => z.coerce.number().int().min(0, `0 to ${max} ${label}.`).max(max, `0 to ${max} ${label}.`);
const optionalInt = (max: number, label: string) => z.union([z.literal(""), smallInt(max, label)]).default("");

export const leaveTypeInputSchema = z
  .object({
    id: z.string().optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "Use 2–4 letters, e.g. CL."),
    name: name("Name", 60),
    description: z.string().trim().max(200).default(""),
    unlimited: checkbox.default(false),
    entitledDays: z.union([days, z.literal("")]).default(""),
    carryForwardDays: z.union([days, z.literal("")]).default("0"),
    allowHalfDay: checkbox.default(false),
    countsAsPresent: checkbox.default(false),
    active: checkbox.default(false),
    accrual: leaveAccrualSchema.default("annual_upfront"),
    encashable: checkbox.default(false),
    maxEncashDays: z.union([days, z.literal("")]).default("0"),
    minRetainDays: z.union([days, z.literal("")]).default("0"),
    maxConsecutiveDays: optionalInt(365, "days"),
    minNoticeDays: smallInt(90, "days").default(0),
    backdateDays: smallInt(30, "days").default(0),
    sandwich: checkbox.default(false),
    negativeDays: z.union([days, z.literal("")]).default("0"),
    gender: leaveGenderSchema.default("any"),
    employmentTypes: z.array(employmentTypeSchema).min(1, "Pick at least one employment type.").default(["full_time", "contract", "intern"]),
    afterProbationOnly: checkbox.default(false),
    minServiceDays: smallInt(365, "days").default(0),
    documentAfterDays: optionalInt(60, "days"),
    expiryDays: optionalInt(365, "days"),
  })
  .refine((value) => !value.encashable || Number(value.maxEncashDays || "0") > 0, { path: ["maxEncashDays"], message: "Set how many days can be encashed a year." });

const months = z.coerce.number().int().min(0, "0 to 6 months.").max(6, "0 to 6 months.");
export const probationDefaultsSchema = z.object({ full_time: z.number().int(), contract: z.number().int(), intern: z.number().int() });
export const probationDefaultsInputSchema = z.object({ full_time: months, contract: months, intern: months });

/* Attendance rules --------------------------------------------------------- */

export const shiftConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string(),
  end: z.string(),
  graceMinutes: z.number().int(),
  breakMinutes: z.number().int(),
});

export const shiftInputSchema = z
  .object({
    id: z.string().optional(),
    name: name("Shift name", 60),
    start: time,
    end: time,
    graceMinutes: z.coerce.number().int().min(0, "0 or more.").max(120, "At most 120 minutes."),
    breakMinutes: z.coerce.number().int().min(0, "0 or more.").max(180, "At most 180 minutes."),
  })
  .refine((value) => value.end > value.start, { path: ["end"], message: "Overnight shifts need roster support — pick an end after the start." });

export const addressMatchSchema = z.object({ label: z.string(), latitude: z.number(), longitude: z.number() });
export type AddressMatch = z.infer<typeof addressMatchSchema>;

export const officeSiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  radiusMeters: z.number().int(),
});

export const officeSiteInputSchema = z.object({
  id: z.string().optional(),
  name: name("Site name", 60),
  latitude: z.coerce.number().min(-90, "Between −90 and 90.").max(90, "Between −90 and 90."),
  longitude: z.coerce.number().min(-180, "Between −180 and 180.").max(180, "Between −180 and 180."),
  radiusMeters: z.coerce.number().int().min(50, "At least 50 m.").max(5000, "At most 5 km."),
});

export const overtimePolicySchema = z.object({
  enabled: z.boolean(),
  /** Minutes after shift end before overtime starts counting. */
  startsAfterMinutes: z.number().int(),
  /** Overtime is counted in whole blocks of this size. */
  blockMinutes: z.number().int(),
  dailyCapMinutes: z.number().int(),
  compensation: z.enum(["comp_off", "paid"]),
  requiresApproval: z.boolean(),
});
export const overtimeInputSchema = z.object({
  enabled: checkbox.default(false),
  startsAfterMinutes: z.coerce.number().int().min(0, "0 or more.").max(180, "At most 180."),
  blockMinutes: z.coerce.number().int().min(15, "At least 15.").max(120, "At most 120."),
  dailyCapMinutes: z.coerce.number().int().min(30, "At least 30.").max(480, "At most 8 hours."),
  compensation: z.enum(["comp_off", "paid"]),
  requiresApproval: checkbox.default(false),
});
/** Late coming / early going: grace comes from the shift; N marks = a half-day deduction. */
export const lateEarlyPolicySchema = z.object({
  enabled: z.boolean(),
  earlyGraceMinutes: z.number().int(),
  marksPerHalfDay: z.number().int(),
  countEarlyGoing: z.boolean(),
});
export const lateEarlyInputSchema = z.object({
  enabled: checkbox.default(false),
  earlyGraceMinutes: z.coerce.number().int().min(0, "0 or more.").max(120, "At most 120."),
  marksPerHalfDay: z.coerce.number().int().min(1, "At least 1.").max(10, "At most 10."),
  countEarlyGoing: checkbox.default(false),
});
export const departmentShiftInputSchema = z.object({ department: z.string().min(1), shiftId: z.string().min(1) });

export const attendanceRulesSchema = z.object({
  shifts: z.array(shiftConfigSchema),
  defaultShiftId: z.string(),
  departmentShifts: z.array(z.object({ department: z.string(), shiftId: z.string() })),
  overtime: overtimePolicySchema,
  lateEarly: lateEarlyPolicySchema,
  sites: z.array(officeSiteSchema),
});

/* Organization ------------------------------------------------------------- */

export const departmentSchema = z.object({
  name: z.string(),
  costCenter: z.string(),
  head: personRefSchema.nullable(),
  headcount: z.number().int(),
});
export const departmentInputSchema = z.object({
  originalName: z.string().optional(),
  name: name("Department name", 60),
  costCenter: z.string().trim().regex(/^CC-\d{3}( .{1,40})?$/, "Use a code like “CC-260 Studio”."),
  headId: z.string().default(""),
});
export const locationRecordSchema = z.object({ name: z.string(), headcount: z.number().int() });
export const locationInputSchema = z.object({ name: name("Location name", 60) });

export const organizationConfigSchema = z.object({
  departments: z.array(departmentSchema),
  locations: z.array(locationRecordSchema),
  probationDefaults: probationDefaultsSchema,
});

/* Onboarding / offboarding ------------------------------------------------- */

export const taskOwnerSchema = z.enum(["HR", "IT", "Finance", "Manager", "Employee"]);

export const checklistTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: taskOwnerSchema,
  /** Days from joining (onboarding) or before the last working day (offboarding). */
  offsetDays: z.number().int(),
  blocking: z.boolean(),
});
export const checklistTaskInputSchema = z.object({
  list: z.enum(["onboarding", "offboarding"]),
  id: z.string().optional(),
  title: name("Task", 80),
  owner: taskOwnerSchema,
  offsetDays: z.coerce.number().int().min(-60, "Within 60 days.").max(60, "Within 60 days."),
  blocking: checkbox.default(false),
});
export const checklistsSchema = z.object({
  onboarding: z.array(checklistTaskSchema),
  offboarding: z.array(checklistTaskSchema),
});

export const exitReasonSchema = z.enum(["resignation", "termination", "contract_end", "retirement", "other"]);

export const offboardingCaseSchema = z.object({
  id: z.string(),
  person: personRefSchema,
  department: z.string(),
  lastWorkingDay: isoDateSchema,
  reason: exitReasonSchema,
  status: z.enum(["notice", "exited"]),
  accessRevoked: z.boolean(),
  tasks: z.array(z.object({ id: z.string(), title: z.string(), owner: taskOwnerSchema, done: z.boolean(), due: isoDateSchema, blocking: z.boolean() })),
});

/* Employee lifecycle commands ---------------------------------------------- */

export const employeeCreateInputSchema = z.object({
  name: z.string().trim().min(3, "Enter the full name.").max(80).regex(/^[\p{L} .'-]+$/u, "Letters, spaces, dots and hyphens only."),
  workEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid work email.").max(254, "Email address is too long.")),
  designation: name("Designation", 80),
  department: z.string().min(1, "Choose a department."),
  location: z.string().min(1, "Choose a location."),
  managerId: z.string().min(1, "Choose a reporting manager."),
  joinedOn: isoDateSchema,
  type: employmentTypeSchema,
  /** Empty = the policy default for the employment type. */
  probationMonths: z.union([months, z.literal("")]).default(""),
});

export const employeeJobInputSchema = z.object({
  employeeId: z.string().min(1),
  designation: name("Designation", 80),
  department: z.string().min(1, "Choose a department."),
  location: z.string().min(1, "Choose a location."),
  managerId: z.string().default(""),
  type: employmentTypeSchema,
  probationMonths: months,
  effectiveOn: isoDateSchema,
  reason: z.string().trim().min(3, "Say why (at least 3 characters).").max(300),
  expectedVersion: z.coerce.number().int(),
});

export const employeeExitInputSchema = z.object({
  employeeId: z.string().min(1),
  lastWorkingDay: isoDateSchema,
  reason: exitReasonSchema,
  note: z.string().trim().max(300).default(""),
});

/** Options HR forms need; server-projected (no private fields). */
export const hrFormOptionsSchema = z.object({
  departments: z.array(z.string()),
  locations: z.array(z.string()),
  managers: z.array(personRefSchema),
  today: isoDateSchema,
  probationDefaults: probationDefaultsSchema,
});

/* Service requests (HR / Finance queue) ------------------------------------ */

export const serviceRequestKindSchema = z.enum(["profile_change", "letter", "loan"]);
export const serviceRequestSchema = z.object({
  id: z.string(),
  kind: serviceRequestKindSchema,
  reference: z.string(),
  requester: personRefSchema,
  title: z.string(),
  detail: z.string(),
  /** Requested value for profile changes; masked for bank details. */
  proposed: z.string().nullable(),
  reason: z.string(),
  submittedAt: instantSchema,
  state: z.enum(["pending", "in_progress", "approved", "rejected"]),
  verifier: z.enum(["HR", "Finance"]),
  decisionNote: z.string().nullable(),
});
export const serviceDecisionInputSchema = z
  .object({
    requestId: z.string().min(1),
    kind: serviceRequestKindSchema,
    decision: z.enum(["approve", "reject", "start"]),
    note: z.string().trim().max(300).default(""),
  })
  .refine((value) => value.decision !== "reject" || value.note.length >= 3, {
    path: ["note"],
    message: "A reason is required when rejecting.",
  });

/* Notification preferences ------------------------------------------------- */

export const notificationTopicSchema = z.enum(["approval", "leave", "payroll", "helpdesk", "announcement"]);
export const notificationPreferencesSchema = z.object({
  topics: z.array(z.object({ topic: notificationTopicSchema, email: z.boolean(), push: z.boolean() })),
  quietHours: z.object({ enabled: z.boolean(), from: z.string(), to: z.string() }),
  /** Mock: email/push delivery needs the live service (VAPID, mail relay). */
  deliveryAvailable: z.boolean(),
});

export type HolidayRecord = z.infer<typeof holidayRecordSchema>;
export type HolidayInput = z.infer<typeof holidayInputSchema>;
export type CompanyEvent = z.infer<typeof companyEventSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type CelebrationSettings = z.infer<typeof celebrationSettingsSchema>;
export type LeaveTypeConfig = z.infer<typeof leaveTypeConfigSchema>;
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>;
export type ShiftConfig = z.infer<typeof shiftConfigSchema>;
export type ShiftInput = z.infer<typeof shiftInputSchema>;
export type OvertimePolicy = z.infer<typeof overtimePolicySchema>;
export type OvertimeInput = z.infer<typeof overtimeInputSchema>;
export type LateEarlyPolicy = z.infer<typeof lateEarlyPolicySchema>;
export type LateEarlyInput = z.infer<typeof lateEarlyInputSchema>;
export type LeaveAccrual = z.infer<typeof leaveAccrualSchema>;
export type LeaveGender = z.infer<typeof leaveGenderSchema>;
export type OfficeSite = z.infer<typeof officeSiteSchema>;
export type OfficeSiteInput = z.infer<typeof officeSiteInputSchema>;
export type AttendanceRules = z.infer<typeof attendanceRulesSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type DepartmentInput = z.infer<typeof departmentInputSchema>;
export type OrganizationConfig = z.infer<typeof organizationConfigSchema>;
export type TaskOwner = z.infer<typeof taskOwnerSchema>;
export type ChecklistTask = z.infer<typeof checklistTaskSchema>;
export type ChecklistTaskInput = z.infer<typeof checklistTaskInputSchema>;
export type Checklists = z.infer<typeof checklistsSchema>;
export type ExitReason = z.infer<typeof exitReasonSchema>;
export type OffboardingCase = z.infer<typeof offboardingCaseSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;
export type EmployeeJobInput = z.infer<typeof employeeJobInputSchema>;
export type EmployeeExitInput = z.infer<typeof employeeExitInputSchema>;
export type ProbationDefaults = z.infer<typeof probationDefaultsSchema>;
export type HrFormOptions = z.infer<typeof hrFormOptionsSchema>;
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export type ServiceRequestKind = z.infer<typeof serviceRequestKindSchema>;
export type ServiceDecisionInput = z.infer<typeof serviceDecisionInputSchema>;
export type NotificationTopic = z.infer<typeof notificationTopicSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
