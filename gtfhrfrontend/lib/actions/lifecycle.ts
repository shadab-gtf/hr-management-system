"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  acknowledgeMyAsset,
  acknowledgeMyPolicy,
  addLine,
  assign,
  changeAssetStatus,
  checkIn,
  createSettlement,
  declineAssetRequest,
  decideOnResignation,
  decideOnSettlement,
  issueLetter,
  publishPolicyVersion,
  raiseAssetRequest,
  recalculate,
  recordExitInterview,
  recordPayment,
  removeLine,
  resign,
  sendPolicyReminder,
  submitForApproval,
  updateClearance,
  updateWaiver,
  withdrawMyResignation,
  writeAsset,
  writeLetterTemplate,
} from "@/lib/api/lifecycle/lifecycle.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  assetAssignInputSchema,
  assetInputSchema,
  assetRequestInputSchema,
  assetRequestRejectSchema,
  assetReturnInputSchema,
  assetStatusInputSchema,
  clearanceInputSchema,
  exitInterviewInputSchema,
  generateLetterInputSchema,
  letterTemplateInputSchema,
  policyPublishInputSchema,
  resignationDecisionSchema,
  resignationInputSchema,
  settlementDecisionInputSchema,
  settlementLineInputSchema,
  settlementPaymentInputSchema,
  settlementWaiverInputSchema,
} from "@/types/lifecycle";
import type { ActionResult } from "@/types/action";

/*
 * Lifecycle commands: validate, call the service (which re-checks access and
 * business rules), refresh the server view. Browser permissions are never trusted.
 */

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: z.ZodError } };

async function run<T, R>(schema: Parser<T>, raw: unknown, command: (input: T) => Promise<R>, message: string | ((input: T, result: R) => string), reference?: (result: R) => string | undefined): Promise<ActionResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await command(parsed.data);
    refresh();
    return success(typeof message === "function" ? message(parsed.data, result) : message, reference?.(result));
  } catch (error) {
    return failure(error);
  }
}

function keyed<T extends z.ZodType>(schema: T) {
  return z.object({ input: schema, key: idempotencyKeySchema });
}
const idSchema = z.string().min(1).max(120);
const versioned = z.object({ id: idSchema, version: z.coerce.number().int() });

/* Resignation */
export async function submitResignationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(keyed(resignationInputSchema), { input: fields, key: fields.idempotencyKey }, ({ input, key }) => resign(input, key), "Resignation submitted to your manager", (result) => result.reference);
}
export async function withdrawResignationAction(id: string, version: number): Promise<ActionResult> {
  return run(versioned, { id, version }, ({ id: rid, version: v }) => withdrawMyResignation(rid, v), "Resignation withdrawn");
}
export async function decideResignationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const labels = { accept: "Resignation accepted", reject: "Resignation not accepted", hold: "Put on hold for discussion" } as const;
  return run(resignationDecisionSchema, formObject(formData), decideOnResignation, (input, result) => (input.decision === "accept" && result.state === "pending_hr" ? "Accepted — sent to HR for the final decision" : labels[input.decision]));
}

/* Offboarding */
export async function setClearanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(clearanceInputSchema, formObject(formData), updateClearance, (input) => (input.status === "cleared" ? "Clearance recorded" : "Clearance reopened"));
}
export async function saveExitInterviewAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(exitInterviewInputSchema, formObject(formData), recordExitInterview, "Exit interview saved (confidential)");
}

/* Settlements */
export async function prepareSettlementAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(z.object({ employeeId: z.string().min(1, "Choose an employee."), key: idempotencyKeySchema }), { employeeId: fields.employeeId, key: fields.idempotencyKey }, ({ employeeId, key }) => createSettlement(employeeId, key), (_input, result) => `Settlement ${result.reference} prepared`, (result) => result.reference);
}
export async function recalculateSettlementAction(id: string, version: number): Promise<ActionResult> {
  return run(versioned, { id, version }, ({ id: sid, version: v }) => recalculate(sid, v), "Recalculated from current inputs");
}
export async function addSettlementLineAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(settlementLineInputSchema, formObject(formData), addLine, "Line added");
}
export async function removeSettlementLineAction(id: string, lineId: string): Promise<ActionResult> {
  return run(z.object({ id: idSchema, lineId: idSchema }), { id, lineId }, ({ id: sid, lineId: lid }) => removeLine(sid, lid), "Line removed");
}
export async function setNoticeWaiverAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(settlementWaiverInputSchema, formObject(formData), updateWaiver, (input) => (input.waive ? "Notice recovery waived" : "Notice recovery applied"));
}
export async function submitSettlementAction(id: string, version: number): Promise<ActionResult> {
  return run(versioned, { id, version }, ({ id: sid, version: v }) => submitForApproval(sid, v), "Submitted to Finance for approval");
}
export async function decideSettlementAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(settlementDecisionInputSchema, formObject(formData), decideOnSettlement, (input) => (input.decision === "approve" ? "Settlement approved" : "Sent back to the preparer"));
}
export async function markSettlementPaidAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(settlementPaymentInputSchema, formObject(formData), recordPayment, "Payment recorded");
}

/* Assets */
export async function saveAssetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(keyed(assetInputSchema), { input: { ...fields, id: fields.id || undefined }, key: fields.idempotencyKey }, ({ input, key }) => writeAsset(input, key), ({ input }, result) => (input.id ? `${result.tag} updated` : `${result.tag} added to inventory`));
}
export async function assignAssetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(assetAssignInputSchema, formObject(formData), assign, (_input, result) => `${result.tag} assigned to ${result.employee}`);
}
export async function returnAssetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(assetReturnInputSchema, formObject(formData), checkIn, (_input, result) => `${result.tag} checked in${result.status === "in_repair" ? " and sent for repair" : ""}`);
}
export async function setAssetStatusAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(assetStatusInputSchema, formObject(formData), changeAssetStatus, (_input, result) => `${result.tag} status updated`);
}
export async function acknowledgeAssetAction(assetId: string): Promise<ActionResult> {
  return run(idSchema, assetId, acknowledgeMyAsset, (_input, result) => `Receipt of ${result.tag} acknowledged`);
}
export async function requestAssetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(keyed(assetRequestInputSchema), { input: fields, key: fields.idempotencyKey }, ({ input, key }) => raiseAssetRequest(input, key), "Request sent to HR", (result) => result.reference);
}
export async function rejectAssetRequestAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(assetRequestRejectSchema, formObject(formData), (input) => declineAssetRequest(input.requestId, input.note), "Request declined");
}

/* Letters */
export async function saveLetterTemplateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(letterTemplateInputSchema, { ...fields, id: fields.id || undefined }, writeLetterTemplate, (input) => (input.id ? "Template saved as a new version" : "Template created"));
}
export async function generateLetterAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const schema = z.object({ input: generateLetterInputSchema.extend({ purpose: z.string().trim().max(200).default(""), addressedTo: z.string().trim().max(120).default("") }), key: idempotencyKeySchema });
  return run(schema, { input: fields, key: fields.idempotencyKey }, ({ input, key }) => issueLetter(input, key), (_input, result) => `Letter ${result.reference} issued to the employee's documents`, (result) => result.reference);
}

/* Policies */
export async function publishPolicyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(keyed(policyPublishInputSchema), { input: fields, key: fields.idempotencyKey }, ({ input, key }) => publishPolicyVersion(input, key), (_input, result) => `Published to ${result.audience} people`);
}
export async function remindPolicyAction(policyId: string): Promise<ActionResult> {
  return run(idSchema, policyId, sendPolicyReminder, (_input, result) => `Reminder sent to ${result.count} people (in-app, mock)`);
}
export async function acknowledgePolicyAction(policyId: string): Promise<ActionResult> {
  return run(idSchema, policyId, acknowledgeMyPolicy, (_input, result) => `Acknowledged ${result.title} ${result.version}`);
}
