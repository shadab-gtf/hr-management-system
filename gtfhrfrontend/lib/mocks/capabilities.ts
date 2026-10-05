import { capabilitySchema, type Capability, type Role } from "@/types/session";

/**
 * Development-only capability fixtures. Live authorization is enforced by the HR API; this table mirrors
 * gtfhrbackend/src/core/security/capabilities.ts exactly so demo mode shows the same access.
 */
export const roleCapabilities: Record<Role, readonly Capability[]> = {
  /** Every capability, organization-wide. Maker ≠ checker still applies. */
  super_admin: capabilitySchema.options,
  employee: [
    "directory.read",
    "profile.read.self",
    "profile.change.request",
    "attendance.capture.self",
    "attendance.read.self",
    "attendance.regularize.request",
    "leave.request.self",
    "leave.cancel.self",
    "payslip.read.self",
    "document.upload",
    "document.read",
    "helpdesk.request.self",
    "expense.submit.self",
    "engage.post",
    "letter.request.self",
    "loan.request.self",
    "tax.declare.self",
    "timesheet.submit.self",
    "exit.request.self",
    "asset.read.self",
    "performance.self",
  ],
  manager: [
    "approval.decide",
    "attendance.read.team",
    "delegation.manage",
    "timesheet.approve",
    "roster.manage",
    "performance.review",
    "candidate.interview",
    "project.manage",
  ],
  hr_operator: [
    "employee.read",
    "employee.create",
    "employee.update",
    "approval.decide",
    "helpdesk.queue",
    "report.read",
    "announcement.publish",
    "onboarding.manage",
    "policy.publish",
    "event.manage",
    "letter.issue",
    "import.commit",
    "roster.manage",
    "project.manage",
    "settlement.prepare",
    "asset.manage",
    "performance.manage",
    "recruitment.manage",
    "survey.manage",
    "report.build",
    "access.manage",
    "audit.read",
  ],
  payroll_operator: [
    "payroll.prepare",
    "payroll.submit",
    "report.read",
    "compensation.manage",
    "statutory.manage",
    "settlement.prepare",
    "report.build",
  ],
  payroll_approver: [
    "payroll.approve",
    "payroll.publish",
    "payment.export",
    "report.read",
    "loan.approve",
    "statutory.manage",
    "settlement.approve",
    "report.build",
  ],
};

export function capabilitiesFor(roles: readonly Role[]): Capability[] {
  return [...new Set(roles.flatMap((role) => roleCapabilities[role]))];
}
