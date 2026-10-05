"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { ApiProblem } from "@/lib/api/core/problem";
import {
  changeRole,
  completePasswordSetup,
  confirmMfaEnrollment,
  inviteAccount,
  issueInviteLink,
  removeMfaFactor,
  requestPasswordRecovery,
  setAccountDisabled,
  startMfaEnrollment,
  verifyMfaSignIn,
} from "@/lib/api/identity/identity.service";
import {
  failure,
  formObject,
  idempotencyKeySchema,
  success,
  validationError,
} from "@/lib/actions/result";
import { isoDateSchema } from "@/types/common";
import { roleSchema } from "@/types/session";
import type { ActionResult } from "@/types/action";
import type { CopyLinkResult, MfaEnrollmentResult } from "@/types/identity";

const employeeIdSchema = z
  .string()
  .regex(/^emp_[0-9]{4,}$/, "Choose an employee.");
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");
const safeNext = (value: string | undefined) =>
  value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";

/** First hop of X-Forwarded-For (set by the hosting proxy), used only as a hashed rate-limit key. */
async function clientIp(): Promise<string> {
  const list = await headers();
  return (
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    list.get("x-real-ip") ||
    "unknown"
  );
}

/* HR: access admin ------------------------------------------------------------ */

export async function inviteAccountAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = z
    .object({
      employeeId: employeeIdSchema,
      idempotencyKey: idempotencyKeySchema,
    })
    .safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await inviteAccount(
      parsed.data.employeeId,
      parsed.data.idempotencyKey,
    );
    refresh();
    const where =
      result.delivery === "sent"
        ? "Email sent"
        : result.delivery === "failed"
          ? "Delivery failed — see the outbox"
          : "Mail isn't configured — recorded in the outbox";
    return success(`Invite for ${result.loginId}: ${where}`, result.outboxId);
  } catch (error) {
    return accessFailure(error);
  }
}

export async function copyInviteLinkAction(
  employeeId: string,
): Promise<CopyLinkResult> {
  const parsed = employeeIdSchema.safeParse(employeeId);
  if (!parsed.success)
    return {
      status: "error",
      code: "VALIDATION_FAILED",
      message: "Choose an employee.",
    };
  try {
    const { link, expiresAt } = await issueInviteLink(parsed.data);
    refresh();
    return {
      status: "success",
      link,
      expiresAt,
      message: "Single-use link created. Share it only with this person.",
    };
  } catch (error) {
    const result = failure(error);
    return {
      status: "error",
      code: result.status === "error" ? result.code : "UNEXPECTED_ERROR",
      message: result.status === "error" ? result.message : "Try again.",
    };
  }
}

const roleChangeSchema = z.object({
  employeeId: employeeIdSchema,
  role: roleSchema,
  reason: z
    .string()
    .trim()
    .min(
      5,
      "Give a reason of at least 5 characters — it is recorded in the audit log.",
    )
    .max(500, "Keep the reason under 500 characters."),
  expiresOn: z.union([isoDateSchema, z.literal("")]).optional(),
  departmentIds: z
    .array(
      z
        .string()
        .regex(/^dep_[a-z0-9_]{1,56}$/, "Choose departments from the list."),
    )
    .max(50)
    .default([]),
  idempotencyKey: idempotencyKeySchema,
});

/** Plain-language explanations for the access rules the API enforces (docs/decisions BE-003). */
const accessProblemMessages: Record<string, string> = {
  SCOPE_TOO_WIDE:
    "Your own access is limited to certain departments, so you can only grant this role for those departments. Choose one or more of them.",
  ROLE_NOT_GRANTABLE:
    "You can only grant or remove roles you hold yourself. Super admin access can be changed only by a super admin.",
  ROLE_NOT_SCOPABLE:
    "Only HR and payroll roles can be limited to departments. Clear the departments for this role.",
  SELF_ACCESS_CHANGE:
    "You can't change your own access. Ask another administrator to do it.",
  OUT_OF_SCOPE: "This person is outside the departments you manage.",
  LAST_SUPER_ADMIN:
    "This is the last active super admin. Make someone else a super admin first.",
  LAST_HR:
    "This is the last active HR operator. Grant the role to someone else first.",
  MFA_REQUIRED:
    "Verify with your authenticator app (Settings → Security) before changing privileged access.",
  ORG_WIDE_ACCESS_REQUIRED:
    "This needs organization-wide access; your access is limited to certain departments.",
  UNKNOWN_DEPARTMENT:
    "One of the chosen departments no longer exists. Reload and choose again.",
  INVALID_EXPIRY: "Choose an expiry date in the future.",
  NOT_FOUND:
    "This person or role is no longer available to you. Reload the list.",
};

function accessFailure(error: unknown): ActionResult {
  const result = failure(error);
  if (result.status !== "error") return result;
  const message = accessProblemMessages[result.code];
  return message ? { ...result, message } : result;
}

async function roleAction(
  op: "grant" | "revoke",
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const departmentIds = formData
    .getAll("departmentIds")
    .filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
  const parsed = roleChangeSchema.safeParse({
    ...fields,
    departmentIds: [...new Set(departmentIds)],
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await changeRole(op, {
      ...parsed.data,
      expiresOn: parsed.data.expiresOn || null,
    });
    refresh();
    return success(
      op === "grant"
        ? "Role granted — it applies on their next page load"
        : "Role removed — it stops on their next page load",
    );
  } catch (error) {
    return accessFailure(error);
  }
}

export async function grantRoleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return roleAction("grant", formData);
}

export async function revokeRoleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return roleAction("revoke", formData);
}

export async function setAccountDisabledAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      employeeId: employeeIdSchema,
      disabled: z.enum(["true", "false"]),
      reason: z
        .string()
        .trim()
        .min(
          5,
          "Give a reason of at least 5 characters — it is recorded in the audit log.",
        )
        .max(500),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const disabled = parsed.data.disabled === "true";
    await setAccountDisabled({
      employeeId: parsed.data.employeeId,
      disabled,
      reason: parsed.data.reason,
    });
    refresh();
    return success(
      disabled ? "Account disabled and signed out" : "Account enabled",
    );
  } catch (error) {
    return accessFailure(error);
  }
}

/* Public: recovery and set password ------------------------------------------------ */

const genericAck =
  "If that email belongs to an active account, a reset link is on its way. Check your inbox in a few minutes.";

export async function forgotPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Enter your work email.")
        .max(254),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { deliver } = await requestPasswordRecovery({
      email: parsed.data.email,
      ip: await clientIp(),
    });
    if (deliver) after(deliver);
    return success(genericAck);
  } catch (error) {
    // Only configuration outages surface; nothing reveals whether the account exists.
    if (error instanceof ApiProblem && error.status >= 500)
      return failure(error);
    if (!(error instanceof ApiProblem))
      console.error("[gtf-identity] recovery failed", error);
    return success(genericAck);
  }
}

const setPasswordSchema = z
  .object({
    tokenHash: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
    type: z.enum(["invite", "recovery"]),
    ref: z.string().regex(/^(?:mail|lnk)_[a-z0-9-]{16,40}$/),
    password: z.string().min(1, "Enter a password.").max(1024),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match.",
  });

export async function setPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = setPasswordSchema.safeParse(fields);
  if (!parsed.success) {
    const linkBroken = parsed.error.issues.some((issue) =>
      ["tokenHash", "type", "ref"].includes(String(issue.path[0])),
    );
    if (linkBroken)
      return {
        status: "error",
        code: "LINK_INVALID",
        message:
          "This link is incomplete. Open it again from your email or ask for a new one.",
        retryable: false,
      };
    return validationError(parsed.error);
  }
  try {
    await completePasswordSetup({ ...parsed.data, ip: await clientIp() });
  } catch (error) {
    return failure(error);
  }
  redirect("/auth/set-password?done=1");
}

/* MFA ----------------------------------------------------------------------------- */

export async function startMfaEnrollmentAction(): Promise<MfaEnrollmentResult> {
  try {
    const result = await startMfaEnrollment();
    return { status: "success", ...result };
  } catch (error) {
    const result = failure(error);
    return {
      status: "error",
      code: result.status === "error" ? result.code : "UNEXPECTED_ERROR",
      message: result.status === "error" ? result.message : "Try again.",
    };
  }
}

export async function confirmMfaEnrollmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ factorId: z.string().uuid(), code: codeSchema })
    .safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await confirmMfaEnrollment(parsed.data);
    refresh();
    return success("Authenticator added. This session is now verified.");
  } catch (error) {
    return failure(error);
  }
}

export async function verifyMfaAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = z.object({ code: codeSchema }).safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await verifyMfaSignIn(parsed.data);
  } catch (error) {
    return failure(error);
  }
  redirect(safeNext(fields.next));
}

export async function removeMfaFactorAction(
  factorId: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(factorId);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await removeMfaFactor(parsed.data);
    refresh();
    return success("Authenticator removed");
  } catch (error) {
    return failure(error);
  }
}
