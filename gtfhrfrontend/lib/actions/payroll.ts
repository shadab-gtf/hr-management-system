"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addRunInput, deleteRunInput, holdRunSalary, payrollCommand, releaseRunSalary } from "@/lib/api/payroll/payroll.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { formatMoney } from "@/lib/utils/format";
import { payrollCommandSchema, payrollHoldFormSchema, payrollInputFormSchema, payrollReleaseFormSchema } from "@/types/payroll";
import type { ActionResult } from "@/types/action";

const schema = z
  .object({
    runId: z.string().min(1),
    command: payrollCommandSchema,
    expectedRevision: z.coerce.number().int(),
    note: z.string().trim().max(500).default(""),
    confirm: z.string().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((value) => value.command !== "reject" || value.note.length >= 5, {
    path: ["note"],
    message: "Explain what the operator needs to fix.",
  })
  .refine((value) => value.command === "reject" || value.confirm === "on", {
    path: ["confirm"],
    message: "Confirm that you reviewed the totals.",
  });

const messages = {
  submit: "Submitted for independent review",
  approve: "Payroll approved",
  reject: "Returned to the operator",
  publish: "Payslips published",
} as const;

export async function payrollCommandAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { runId, command, expectedRevision, note, idempotencyKey } = parsed.data;
  try {
    await payrollCommand(runId, command, { expectedRevision, note }, idempotencyKey);
    refresh();
    return success(messages[command]);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

/* Payroll inputs & salary holds ------------------------------------------- */

export async function addPayrollInputAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = payrollInputFormSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  const { runId, ...input } = parsed.data;
  try {
    const result = await addRunInput(runId, input, key.data);
    refresh();
    return success(`Input added · recalculated net ${formatMoney(result.net)}`);
  } catch (error) {
    return failure(error);
  }
}

export async function removePayrollInputAction(runId: string, inputId: string): Promise<ActionResult> {
  try {
    await deleteRunInput(runId, inputId);
    refresh();
    return success("Input removed and run recalculated");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function holdSalaryAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = payrollHoldFormSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await holdRunSalary(parsed.data.runId, parsed.data.employeeId, parsed.data.reason, key.data);
    refresh();
    return success("Salary put on hold");
  } catch (error) {
    return failure(error);
  }
}

export async function releaseSalaryAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = payrollReleaseFormSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await releaseRunSalary(parsed.data.runId, parsed.data.holdId, parsed.data.note);
    refresh();
    return success("Salary released for payment");
  } catch (error) {
    return failure(error);
  }
}
