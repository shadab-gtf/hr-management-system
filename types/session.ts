import { z } from "zod";

/** Canonical capability keys from system/brain/roles-permissions.md. */
export const capabilitySchema = z.enum([
  "directory.read",
  "profile.read.self",
  "profile.change.request",
  "employee.read",
  "employee.create",
  "employee.update",
  "attendance.capture.self",
  "attendance.read.self",
  "attendance.read.team",
  "attendance.regularize.request",
  "leave.request.self",
  "leave.cancel.self",
  "approval.decide",
  "payroll.prepare",
  "payroll.submit",
  "payroll.approve",
  "payroll.publish",
  "payment.export",
  "payslip.read.self",
  "document.upload",
  "document.read",
  "helpdesk.request.self",
  "helpdesk.queue",
  "expense.submit.self",
  "report.read",
]);

export const roleSchema = z.enum([
  "employee",
  "manager",
  "hr_operator",
  "payroll_operator",
  "payroll_approver",
]);

export const sessionSchema = z.object({
  userId: z.string(),
  employeeId: z.string(),
  displayName: z.string(),
  firstName: z.string(),
  initials: z.string(),
  designation: z.string(),
  department: z.string(),
  roles: z.array(roleSchema),
  capabilities: z.array(capabilitySchema),
  organization: z.object({
    name: z.string(),
    timezone: z.string(),
    currency: z.literal("INR"),
  }),
  unreadNotifications: z.number().int().nonnegative(),
  /** "mock" sessions are local demo identities, never authenticated users. */
  source: z.enum(["mock", "live"]),
});

export type Capability = z.infer<typeof capabilitySchema>;
export type Role = z.infer<typeof roleSchema>;
export type Session = z.infer<typeof sessionSchema>;

export const personaSchema = z.enum([
  "employee",
  "manager",
  "hr",
  "payroll",
  "finance",
]);
export type Persona = z.infer<typeof personaSchema>;

export interface PersonaOption {
  id: Persona;
  name: string;
  title: string;
  summary: string;
}
