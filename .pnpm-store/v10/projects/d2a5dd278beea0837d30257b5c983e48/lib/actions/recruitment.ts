"use server";

import { refresh } from "next/cache";
import { ApiProblem } from "@/lib/api/core/problem";
import type { z } from "zod";
import * as api from "@/lib/api/recruitment/recruitment.service";
import {
  failure,
  formObject,
  idempotencyKeySchema,
  success,
  validationError,
} from "@/lib/actions/result";
import {
  applyInputSchema,
  candidateInputSchema,
  candidateNoteInputSchema,
  convertInputSchema,
  eraseInputSchema,
  interviewInputSchema,
  jobInputSchema,
  jobStateInputSchema,
  offerApprovalInputSchema,
  offerInputSchema,
  offerResponseInputSchema,
  referralInputSchema,
  requisitionDecisionSchema,
  requisitionInputSchema,
  resumeMetaSchema,
  scorecardCriteria,
  scorecardInputSchema,
  stageMoveInputSchema,
  stageLabels,
  type ResumeUpload,
  type ResumeDownloadResult,
} from "@/types/recruitment";
import type { ActionResult } from "@/types/action";

type Parsed<T> =
  { ok: true; data: T; key: string } | { ok: false; result: ActionResult };

export async function downloadResumeAction(
  candidateId: string,
): Promise<ResumeDownloadResult> {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(candidateId))
    return { ok: false, message: "Choose a valid candidate." };
  try {
    return { ok: true, file: await api.downloadCandidateResume(candidateId) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ApiProblem
          ? error.message
          : "The resume could not be downloaded. Try again.",
    };
  }
}

function parse<S extends z.ZodType>(
  schema: S,
  fields: Record<string, unknown>,
  needsKey = true,
): Parsed<z.infer<S>> {
  const parsed = schema.safeParse(fields);
  if (!parsed.success)
    return { ok: false, result: validationError(parsed.error) };
  if (!needsKey) return { ok: true, data: parsed.data, key: "" };
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return { ok: false, result: validationError(key.error) };
  return { ok: true, data: parsed.data, key: key.data };
}

/** Validate the multipart file before passing bounded bytes to the private upload API. */
async function resumeOf(
  formData: FormData,
  required: boolean,
): Promise<
  { ok: true; meta: ResumeUpload | null } | { ok: false; result: ActionResult }
> {
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    if (!required) return { ok: true, meta: null };
    return {
      ok: false,
      result: {
        status: "error",
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields.",
        fieldErrors: {
          resume: "Attach your resume (PDF or Word, up to 5 MB).",
        },
        retryable: false,
      },
    };
  }
  const parsed = resumeMetaSchema.safeParse({
    name: file.name.slice(0, 160),
    sizeBytes: file.size,
    mime: file.type,
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ??
      "Upload a PDF or Word document up to 5 MB.";
    return {
      ok: false,
      result: {
        status: "error",
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields.",
        fieldErrors: { resume: message },
        retryable: false,
      },
    };
  }
  return {
    ok: true,
    meta: {
      ...parsed.data,
      contentBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    },
  };
}

async function run(task: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const result = await task();
    refresh();
    return result;
  } catch (error) {
    return failure(error);
  }
}

/* Public careers ------------------------------------------------------------- */

export async function applyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  // Honeypot: real people never fill the hidden "website" field.
  if (fields.website) return success("Application received");
  const input = parse(applyInputSchema, fields);
  if (!input.ok) return input.result;
  const resume = await resumeOf(formData, true);
  if (!resume.ok) return resume.result;
  const meta = resume.meta;
  if (!meta) return failure(null);
  return run(async () => {
    const result = await api.submitApplication(input.data, meta, input.key);
    return success("Application received — thank you!", result.reference);
  });
}

export async function referAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const input = parse(referralInputSchema, fields);
  if (!input.ok) return input.result;
  const resume = await resumeOf(formData, false);
  if (!resume.ok) return resume.result;
  return run(async () => {
    const result = await api.submitReferral(input.data, resume.meta, input.key);
    return success(
      "Referral submitted — HR will take it from here",
      result.reference,
    );
  });
}

/* Requisitions --------------------------------------------------------------- */

export async function raiseRequisitionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(requisitionInputSchema, formObject(formData));
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.submitRequisition(input.data, input.key);
    return success("Requisition sent to HR for approval", result.reference);
  });
}

export async function decideRequisitionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(requisitionDecisionSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.decideRequisition(input.data);
    return success(
      result.jobId
        ? "Approved — a draft job opening was created"
        : "Requisition rejected",
      result.reference,
    );
  });
}

/* Jobs ----------------------------------------------------------------------- */

export async function saveJobAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const input = parse(jobInputSchema, {
    ...fields,
    jobId: fields.jobId || undefined,
  });
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.saveJob(input.data, input.key);
    return success(
      input.data.jobId ? "Job updated" : "Draft job created",
      result.reference,
    );
  });
}

export async function changeJobStateAction(
  jobId: string,
  to: "published" | "on_hold" | "closed",
  expectedVersion: number,
): Promise<ActionResult> {
  const input = parse(
    jobStateInputSchema,
    { jobId, to, expectedVersion },
    false,
  );
  if (!input.ok) return input.result;
  const labels = {
    published: "Job published",
    on_hold: "Job put on hold",
    closed: "Job closed",
  } as const;
  return run(async () => {
    await api.changeJobState(input.data);
    return success(labels[to]);
  });
}

/* Candidates ----------------------------------------------------------------- */

export async function addCandidateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(candidateInputSchema, formObject(formData));
  if (!input.ok) return input.result;
  const resume = await resumeOf(formData, false);
  if (!resume.ok) return resume.result;
  return run(async () => {
    const result = await api.addCandidate(input.data, resume.meta, input.key);
    return success("Candidate added to Applied", result.reference);
  });
}

export async function moveStageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(stageMoveInputSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    await api.moveStage(input.data);
    return success(
      input.data.to === "rejected"
        ? "Candidate rejected"
        : `Moved to ${stageLabels[input.data.to]}`,
    );
  });
}

export async function addNoteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(candidateNoteInputSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    await api.addNote(input.data);
    return success("Note added");
  });
}

export async function eraseCandidateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(eraseInputSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    await api.eraseCandidate(input.data);
    return success("Personal data erased");
  });
}

/* Interviews ----------------------------------------------------------------- */

export async function scheduleInterviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const panelIds = formData
    .getAll("panelIds")
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  const input = parse(interviewInputSchema, { ...fields, panelIds });
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.scheduleInterview(input.data, input.key);
    return success(`Round ${result.round} scheduled — panel notified`);
  });
}

export async function submitScorecardAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fields = formObject(formData);
  const ratings = Object.fromEntries(
    scorecardCriteria.map((criterion) => [
      criterion.key,
      fields[`rating_${criterion.key}`] ?? "",
    ]),
  );
  const input = parse(scorecardInputSchema, { ...fields, ratings });
  if (!input.ok) {
    // Surface nested rating errors on the flat field names used by the form.
    if (input.result.status === "error" && input.result.fieldErrors)
      input.result.fieldErrors = Object.fromEntries(
        Object.entries(input.result.fieldErrors).map(([key, message]) => [
          key.startsWith("ratings.") ? `rating_${key.slice(8)}` : key,
          message,
        ]),
      );
    return input.result;
  }
  return run(async () => {
    await api.submitScorecard(input.data, input.key);
    return success("Scorecard submitted");
  });
}

/* Offers --------------------------------------------------------------------- */

export async function createOfferAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(offerInputSchema, formObject(formData));
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.createOffer(input.data, input.key);
    return success(
      result.state === "pending_approval"
        ? "Offer is above budget — sent to Finance for approval"
        : "Offer extended",
      result.reference,
    );
  });
}

export async function decideOfferAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(offerApprovalInputSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.decideOffer(input.data);
    return success(
      input.data.decision === "approve"
        ? "Offer approved and extended"
        : "Offer sent back to HR",
      result.reference,
    );
  });
}

export async function respondOfferAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(offerResponseInputSchema, formObject(formData), false);
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.respondToOffer(input.data);
    return success(
      input.data.response === "accepted"
        ? "Offer marked accepted"
        : "Offer marked declined",
      result.reference,
    );
  });
}

export async function convertOfferAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = parse(convertInputSchema, formObject(formData));
  if (!input.ok) return input.result;
  return run(async () => {
    const result = await api.convertOffer(input.data, input.key);
    return success(
      "Employee record created — onboarding has started",
      result.code,
    );
  });
}
