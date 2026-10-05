"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failure, formObject, success, validationError } from "@/lib/actions/result";
import {
  createChallan,
  decideBankAccount,
  updatePfSettings,
  updatePtSlabs,
  updateStatutoryProfile,
} from "@/lib/api/payroll/statutory.service";
import { decideStructure, submitAssignmentChange, submitTemplateChange } from "@/lib/api/payroll/structures.service";
import { runForm16Generation } from "@/lib/api/salary/form16.service";
import {
  assignmentProposalSchema,
  challanInputSchema,
  pfSettingsInputSchema,
  ptSlabsInputSchema,
  statutoryProfileInputSchema,
  structureProposalSchema,
} from "@/types/statutory";
import type { ActionResult } from "@/types/action";

export async function recordChallanAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = challanInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await createChallan(parsed.data);
    refresh();
    return success(result.status === "late" ? "Challan recorded — paid after the due date" : "Challan recorded", result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function savePfSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = pfSettingsInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updatePfSettings(parsed.data);
    refresh();
    return success("PF / ESI settings saved — open runs recalculated");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function savePtSlabsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const rows = Array.from({ length: 6 }, (_, index) => ({
    from: fields[`rows.${index}.from`] ?? "",
    to: fields[`rows.${index}.to`] ?? "",
    monthly: fields[`rows.${index}.monthly`] ?? "",
    february: fields[`rows.${index}.february`] ?? "",
  }));
  const parsed = ptSlabsInputSchema.safeParse({ state: fields.state, expectedVersion: fields.expectedVersion, rows });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updatePtSlabs(parsed.data);
    refresh();
    return success("Professional tax slabs saved");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function saveStatutoryProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = statutoryProfileInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateStatutoryProfile(parsed.data);
    refresh();
    return success("Statutory details saved");
  } catch (error) {
    return failure(error);
  }
}

export async function verifyBankAction(employeeId: string, decision: "verified" | "failed"): Promise<ActionResult> {
  try {
    await decideBankAccount(employeeId, decision);
    refresh();
    return success(decision === "verified" ? "Bank account verified" : "Bank account marked failed");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function generateForm16Action(fy: string): Promise<ActionResult> {
  try {
    await runForm16Generation(fy);
    refresh();
    return success("Form 16 generated for all eligible employees");
  } catch (error) {
    return failure(error);
  }
}

export async function proposeTemplateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = structureProposalSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await submitTemplateChange(parsed.data);
    refresh();
    return success("Sent to Finance for approval", result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function proposeAssignmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = assignmentProposalSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await submitAssignmentChange(parsed.data);
    refresh();
    return success("Sent to Finance for approval", result.reference);
  } catch (error) {
    return failure(error);
  }
}

const decisionSchema = z.object({
  changeId: z.string().min(1),
  decision: z.enum(["approve", "reject", "withdraw"]),
  note: z.string().trim().max(300).default(""),
});

export async function decideStructureAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await decideStructure(parsed.data.changeId, parsed.data.decision, parsed.data.note);
    refresh();
    return success(result.state === "approved" ? "Structure change approved and published" : result.state === "rejected" ? "Change rejected" : "Change withdrawn");
  } catch (error) {
    refresh();
    return failure(error);
  }
}
