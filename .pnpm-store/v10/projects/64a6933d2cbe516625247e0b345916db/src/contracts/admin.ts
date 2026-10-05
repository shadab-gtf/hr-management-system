import { z } from "zod";
import { isoDateSchema, personRefSchema } from "./common.js";
import { announcementSchema } from "./workplace.js";

/* Onboarding --------------------------------------------------------------- */

export const onboardingTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.enum(["HR", "IT", "Finance", "Manager", "Employee"]),
  done: z.boolean(),
  due: isoDateSchema,
  blocking: z.boolean(),
});
export const onboardingCaseSchema = z.object({
  id: z.string(),
  person: personRefSchema,
  department: z.string(),
  joinedOn: isoDateSchema,
  manager: personRefSchema.nullable(),
  tasks: z.array(onboardingTaskSchema),
});

/* Reports ------------------------------------------------------------------ */

export const workforceReportSchema = z.object({
  generatedAt: z.string(),
  headcount: z.number().int(),
  byDepartment: z.array(z.object({ name: z.string(), count: z.number().int(), joiners: z.number().int() })),
  byLocation: z.array(z.object({ name: z.string(), count: z.number().int() })),
  byType: z.array(z.object({ name: z.string(), count: z.number().int() })),
  attendanceToday: z.object({ present: z.number().int(), onLeave: z.number().int(), notRecorded: z.number().int() }),
  leaveUtilization: z.array(z.object({ type: z.string(), usedDays: z.string(), entitledDays: z.string() })),
  tenure: z.array(z.object({ band: z.string(), count: z.number().int() })),
});

export const announcementInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(5, "Title needs at least 5 characters.").max(120),
  body: z.string().trim().min(10, "Write at least 10 characters.").max(2000),
  category: announcementSchema.shape.category,
  pinned: z.boolean().default(false),
  audience: z.string().trim().min(1).max(60).default("Everyone"),
  /** Local date-time (organization zone) or empty for "publish now". */
  publishAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time."), z.literal("")]).default(""),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export type OnboardingTask = z.infer<typeof onboardingTaskSchema>;
export type OnboardingCase = z.infer<typeof onboardingCaseSchema>;
export type WorkforceReport = z.infer<typeof workforceReportSchema>;
