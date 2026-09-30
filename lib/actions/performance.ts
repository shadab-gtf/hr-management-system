"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  moveCyclePhase,
  recordCheckIn,
  removeGoal,
  sendGoalsForApproval,
  writeAcknowledgement,
  writeCalibrationLock,
  writeCompetency,
  writeCycle,
  writeDeclineRequest,
  writeFeedback,
  writeFeedbackRequest,
  writeFinalRating,
  writeGoal,
  writeGoalDecision,
  writeManagerReview,
  writeOneOnOne,
  writeReviewer,
  writeSelfReview,
} from "@/lib/api/performance/performance.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  acknowledgeInputSchema,
  calibrateInputSchema,
  checkInInputSchema,
  competencyInputSchema,
  cycleInputSchema,
  feedbackInputSchema,
  feedbackRequestInputSchema,
  goalDecisionSchema,
  goalInputSchema,
  managerReviewInputSchema,
  oneOnOneInputSchema,
  perfPhaseSchema,
  perfWindowPhases,
  reassignInputSchema,
  reviewInputSchema,
} from "@/types/performance";
import type { ActionResult } from "@/types/action";

/*
 * Performance commands. Each validates input, then calls the service, which
 * re-checks capability and row scope; the browser's view is never trusted.
 */

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: z.ZodError } };

async function run<T>(schema: Parser<T>, raw: unknown, command: (input: T) => Promise<unknown>, message: string | ((input: T) => string)): Promise<ActionResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await command(parsed.data);
    refresh();
    return success(typeof message === "function" ? message(parsed.data) : message);
  } catch (error) {
    return failure(error);
  }
}

async function runKeyed<T>(schema: Parser<T>, fields: Record<string, string | undefined>, command: (input: T, key: string) => Promise<unknown>, message: string | ((input: T) => string)): Promise<ActionResult> {
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  return run(schema, fields, (input) => command(input, key.data), message);
}

const idSchema = z.string().min(1).max(120);

/** Collects `prefix.<id>` rating/comment pairs from a review form. */
function ratingEntries(fields: Record<string, string>, ratingPrefix: string, commentPrefix: string) {
  const ids = new Set<string>();
  for (const name of Object.keys(fields)) {
    if (name.startsWith(`${ratingPrefix}.`)) ids.add(name.slice(ratingPrefix.length + 1));
    if (name.startsWith(`${commentPrefix}.`)) ids.add(name.slice(commentPrefix.length + 1));
  }
  return [...ids].map((targetId) => ({ targetId, rating: fields[`${ratingPrefix}.${targetId}`] ?? "", comment: fields[`${commentPrefix}.${targetId}`] ?? "" }));
}
function reviewFields(fields: Record<string, string>) {
  return {
    ...fields,
    goals: ratingEntries(fields, "goalRating", "goalComment"),
    competencies: ratingEntries(fields, "compRating", "compComment"),
    strengths: fields.strengths ?? "",
    improvements: fields.improvements ?? "",
  };
}

/* Goals ---------------------------------------------------------------- */

export async function saveGoalAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return runKeyed(goalInputSchema, { ...fields, id: fields.id || undefined }, writeGoal, (input) => (input.id ? "Goal updated" : "Goal added to your sheet"));
}
export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
  return run(idSchema, goalId, removeGoal, "Goal removed");
}
export async function submitGoalsAction(cycleId: string): Promise<ActionResult> {
  return run(idSchema, cycleId, sendGoalsForApproval, "Goals sent to your manager for approval");
}
export async function checkInAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runKeyed(checkInInputSchema, formObject(formData), recordCheckIn, (input) => `Check-in saved · ${input.progress}%`);
}
export async function decideGoalsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(goalDecisionSchema, formObject(formData), writeGoalDecision, (input) => (input.decision === "approve" ? "Goals approved" : "Goals sent back with your comment"));
}

/* Reviews -------------------------------------------------------------- */

export async function saveSelfReviewAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(reviewInputSchema, reviewFields(formObject(formData)), writeSelfReview, (input) => (input.intent === "submit" ? "Self review submitted to your manager" : "Draft saved"));
}
export async function saveManagerReviewAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(managerReviewInputSchema, reviewFields(formObject(formData)), writeManagerReview, (input) => (input.intent === "submit" ? "Manager review submitted" : "Draft saved"));
}
export async function acknowledgeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(acknowledgeInputSchema, formObject(formData), writeAcknowledgement, "Review acknowledged");
}

/* HR cycles & calibration ---------------------------------------------- */

export async function saveCycleAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const raw = {
    ...fields,
    id: fields.id || undefined,
    departments: formData.getAll("departments").filter((value): value is string => typeof value === "string"),
    scale: [0, 1, 2, 3, 4].map((i) => ({ label: fields[`scale.${i}.label`] ?? "", description: fields[`scale.${i}.description`] ?? "" })),
    guideline: [0, 1, 2, 3, 4].map((i) => fields[`guideline.${i}`] ?? ""),
    phaseDates: Object.fromEntries(perfWindowPhases.map((phase) => [phase, { start: fields[`phaseDates.${phase}.start`] ?? "", end: fields[`phaseDates.${phase}.end`] ?? "" }])),
  };
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  return run(cycleInputSchema, raw, (input) => writeCycle(input, key.data), fields.id ? "Cycle updated" : "Cycle created as a draft");
}
export async function advancePhaseAction(cycleId: string, expectedPhase: string): Promise<ActionResult> {
  return run(z.object({ cycleId: idSchema, expectedPhase: perfPhaseSchema }), { cycleId, expectedPhase }, (input) => moveCyclePhase(input.cycleId, input.expectedPhase), "Phase advanced");
}
export async function lockCalibrationAction(cycleId: string, lock: boolean): Promise<ActionResult> {
  return run(z.object({ cycleId: idSchema, lock: z.boolean() }), { cycleId, lock }, (input) => writeCalibrationLock(input.cycleId, input.lock), lock ? "Calibration locked" : "Calibration reopened");
}
export async function calibrateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(calibrateInputSchema, formObject(formData), writeFinalRating, (input) => `Final rating set to ${input.finalRating}`);
}
export async function reassignReviewerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(reassignInputSchema, formObject(formData), writeReviewer, "Reviewer reassigned");
}
export async function saveCompetencyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(competencyInputSchema, { ...fields, id: fields.id || undefined }, writeCompetency, (input) => (input.id ? "Competency updated" : "Competency added"));
}

/* Feedback ------------------------------------------------------------- */

export async function giveFeedbackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runKeyed(feedbackInputSchema, formObject(formData), writeFeedback, (input) => (input.visibility === "public" ? "Praise shared" : "Feedback sent privately"));
}
export async function requestFeedbackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runKeyed(feedbackRequestInputSchema, formObject(formData), writeFeedbackRequest, "Feedback request sent");
}
export async function declineRequestAction(requestId: string): Promise<ActionResult> {
  return run(idSchema, requestId, writeDeclineRequest, "Request declined");
}
export async function addOneOnOneAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return runKeyed(oneOnOneInputSchema, formObject(formData), writeOneOnOne, "1:1 notes saved");
}
