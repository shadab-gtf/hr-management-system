export const SERVICE_NAME = "gtf-hr-api";
export const API_PREFIX = "/api/v1";
export const REQUEST_BODY_LIMIT = "1mb";

export const ROLES = ["employee", "manager", "hr_operator", "payroll_operator", "payroll_approver", "super_admin"] as const;
export type ApiRole = (typeof ROLES)[number];

export const EMPLOYMENT_STATUSES = ["onboarding", "active", "on_leave", "notice", "exited"] as const;
/** Order in which the directory status filter is offered to HR. */
export const DIRECTORY_STATUS_FILTERS = ["active", "on_leave", "onboarding", "notice", "exited"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "contract", "intern"] as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 } as const;
export const LOGIN_LOCKOUT = { maxFailedAttempts: 5, durationMs: 15 * 60 * 1000 } as const;
