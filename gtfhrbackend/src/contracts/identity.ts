import { z } from "zod";
import { instantSchema, isoDateSchema } from "./common.js";
import { roleSchema } from "./session.js";

/*
 * Identity & access contracts (ADR-026/027, pwd.md). Accounts are Supabase Auth
 * users linked 1:1 to an employee; passwords are never part of any contract.
 */

/** Privileged roles need an AAL2 (MFA) session before their capabilities apply. */
export const privilegedRoles = ["hr_operator", "payroll_operator", "payroll_approver", "super_admin"] as const;

/** Roles that may be limited to departments; employee (self), manager (own team) and super admin never are. */
export const scopableRoles = ["hr_operator", "payroll_operator", "payroll_approver"] as const;

export const roleLabels: Record<z.infer<typeof roleSchema>, string> = {
  employee: "Employee",
  manager: "Manager",
  hr_operator: "HR operator",
  payroll_operator: "Payroll operator",
  payroll_approver: "Payroll approver",
  super_admin: "Super admin",
};

export const accountStatusSchema = z.enum(["not_invited", "invited", "active", "disabled"]);
export const mfaStateSchema = z.enum(["enrolled", "not_enrolled", "unknown"]);

export const departmentRefSchema = z.object({ id: z.string(), name: z.string() });

export const roleGrantSchema = z.object({
  role: roleSchema,
  /** Departments this grant is limited to; empty = organization-wide. */
  departments: z.array(departmentRefSchema),
  grantedAt: instantSchema,
  expiresAt: instantSchema.nullable(),
  grantedBy: z.string().nullable(),
  reason: z.string().nullable(),
});

export const identityAccountSchema = z.object({
  employeeId: z.string(),
  code: z.string(),
  name: z.string(),
  designation: z.string(),
  department: z.string(),
  /** Work email; this is the login ID. */
  email: z.string(),
  employmentStatus: z.enum(["onboarding", "active", "on_leave", "notice", "exited"]),
  status: accountStatusSchema,
  roles: z.array(roleGrantSchema),
  lastSignInAt: instantSchema.nullable(),
  invitedAt: instantSchema.nullable(),
  mfa: mfaStateSchema,
  /** Holds a privileged role, so MFA is required. */
  mfaRequired: z.boolean(),
  /** A set-password link may still be issued (never signed in, link not used). */
  canCopyInvite: z.boolean(),
});

export const mailStatusSchema = z.enum(["queued", "sent", "failed", "not_configured", "copied"]);
export const mailTemplateSchema = z.enum(["invite", "recovery", "password_changed", "mfa_changed", "access_changed"]);

export const mailOutboxItemSchema = z.object({
  id: z.string(),
  employeeId: z.string().nullable(),
  to: z.string(),
  template: mailTemplateSchema,
  subject: z.string(),
  /** Body with every token removed. */
  bodyRedacted: z.string(),
  status: mailStatusSchema,
  error: z.string().nullable(),
  createdAt: instantSchema,
  sentAt: instantSchema.nullable(),
  linkExpiresAt: instantSchema.nullable(),
  linkUsedAt: instantSchema.nullable(),
});

export const accessOverviewSchema = z.object({
  accounts: z.array(identityAccountSchema),
  outbox: z.array(mailOutboxItemSchema),
  /** SUPABASE_SECRET_KEY present: invites, disable and MFA status work. */
  adminReady: z.boolean(),
  /** Resend configured: mail is delivered, otherwise it stays in the outbox. */
  mailReady: z.boolean(),
  mfaEnforced: z.boolean(),
  viewer: z.object({
    employeeId: z.string(),
    canGrantPrivileged: z.boolean(),
    isSuperAdmin: z.boolean(),
    /** Roles this viewer may grant, and where: "all" = organization-wide, else these department ids only. */
    grantable: z.array(z.object({ role: roleSchema, scope: z.union([z.literal("all"), z.array(z.string())]) })),
  }),
  /** Active departments, for the scope picker. */
  departments: z.array(departmentRefSchema),
  /** "database" = real Supabase accounts; "mock" = demo listing only. */
  source: z.enum(["database", "mock"]),
});

export const auditEntrySchema = z.object({
  id: z.string(),
  at: instantSchema,
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  /** Compact JSON of the recorded details (already minimal by design). */
  details: z.string(),
});

export const auditFiltersSchema = z.object({
  actor: z.string().max(20).optional(),
  entity: z.string().max(60).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});

export const auditPageSchema = z.object({
  items: z.array(auditEntrySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  entities: z.array(z.string()),
  actors: z.array(z.object({ id: z.string(), name: z.string() })),
  source: z.enum(["database", "mock"]),
});

export const mfaFactorSchema = z.object({
  id: z.string(),
  friendlyName: z.string().nullable(),
  status: z.enum(["verified", "unverified"]),
  createdAt: instantSchema,
});

export const securityOverviewSchema = z.object({
  loginId: z.string(),
  lastSignInAt: instantSchema.nullable(),
  currentLevel: z.enum(["aal1", "aal2"]).nullable(),
  factors: z.array(mfaFactorSchema),
  mfaEnforced: z.boolean(),
  /** Privileged roles held but inactive until this session reaches AAL2. */
  pendingRoles: z.array(roleSchema),
  source: z.enum(["database", "mock"]),
});

export const mfaGateSchema = z.object({
  required: z.boolean(),
  satisfied: z.boolean(),
  hasVerifiedFactor: z.boolean(),
  pendingRoles: z.array(roleSchema),
});

export const inviteResultSchema = z.object({
  employeeId: z.string(),
  loginId: z.string(),
  outboxId: z.string(),
  delivery: mailStatusSchema,
  linkType: z.enum(["invite", "recovery"]),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type MfaState = z.infer<typeof mfaStateSchema>;
export type RoleGrant = z.infer<typeof roleGrantSchema>;
export type IdentityAccount = z.infer<typeof identityAccountSchema>;
export type MailStatus = z.infer<typeof mailStatusSchema>;
export type MailTemplate = z.infer<typeof mailTemplateSchema>;
export type MailOutboxItem = z.infer<typeof mailOutboxItemSchema>;
export type AccessOverview = z.infer<typeof accessOverviewSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditFilters = z.infer<typeof auditFiltersSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type MfaFactor = z.infer<typeof mfaFactorSchema>;
export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
export type MfaGate = z.infer<typeof mfaGateSchema>;
export type InviteResult = z.infer<typeof inviteResultSchema>;

/** Result of starting TOTP enrollment: shown once to the account owner only. */
export type MfaEnrollmentResult =
  | { status: "success"; factorId: string; qrCode: string; secret: string }
  | { status: "error"; message: string; code: string };

/** Result of issuing a copyable set-password link (HR, never-activated accounts). */
export type CopyLinkResult =
  | { status: "success"; link: string; expiresAt: string; message: string }
  | { status: "error"; message: string; code: string };
