import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { problem } from "@/lib/api/core/problem";
import { mockActor } from "@/lib/api/session/session.service";
import * as mock from "@/lib/mocks/handlers/recruitment";
import {
  candidateDetailSchema,
  candidateListItemSchema,
  jobDetailSchema,
  jobSummarySchema,
  myInterviewsSchema,
  myReferralSchema,
  offerSchema,
  publicJobSchema,
  recruitmentOptionsSchema,
  recruitmentStatsSchema,
  requisitionSchema,
  resumeDownloadSchema,
  resumeMetaSchema,
  type ApplyInput,
  type CandidateInput,
  type CandidateNoteInput,
  type CandidateSource,
  type ConvertInput,
  type EraseInput,
  type InterviewInput,
  type JobInput,
  type JobStateInput,
  type OfferApprovalInput,
  type OfferInput,
  type OfferResponseInput,
  type RecruitmentStage,
  type ReferralInput,
  type RequisitionDecisionInput,
  type RequisitionInput,
  type ResumeUpload,
  type ScorecardInput,
  type StageMoveInput,
} from "@/types/recruitment";

/* Reads ---------------------------------------------------------------------- */

export const getRecruitmentStats = cache(async () =>
  callApi({
    schema: recruitmentStatsSchema,
    live: { path: "/recruitment/stats" },
    mock: async () => mock.recruitmentStats(await mockActor()),
  }),
);

export const getJobs = cache(async () =>
  callApi({
    schema: z.array(jobSummarySchema),
    live: { path: "/recruitment/jobs" },
    mock: async () => mock.listJobs(await mockActor()),
  }),
);

export const getJob = cache(async (jobId: string) =>
  callApi({
    schema: jobDetailSchema,
    live: { path: `/recruitment/jobs/${encodeURIComponent(jobId)}` },
    mock: async () => mock.jobDetail(await mockActor(), jobId),
  }),
);

export const getRequisitions = cache(async () =>
  callApi({
    schema: z.array(requisitionSchema),
    live: { path: "/recruitment/requisitions" },
    mock: async () => mock.listRequisitions(await mockActor()),
  }),
);

export interface CandidateFilters {
  q?: string | undefined;
  jobId?: string | undefined;
  stage?: RecruitmentStage | undefined;
  source?: CandidateSource | undefined;
  retention?: boolean | undefined;
}

export const getCandidates = cache(async (filters: CandidateFilters) =>
  callApi({
    schema: z.array(candidateListItemSchema),
    live: {
      path: "/recruitment/candidates",
      query: {
        q: filters.q,
        jobId: filters.jobId,
        stage: filters.stage,
        source: filters.source,
        retentionDue: filters.retention,
      },
    },
    mock: async () => mock.listCandidates(await mockActor(), filters),
  }),
);

export const getCandidate = cache(async (candidateId: string) =>
  callApi({
    schema: candidateDetailSchema,
    live: {
      path: `/recruitment/candidates/${encodeURIComponent(candidateId)}`,
    },
    mock: async () => mock.candidateDetail(await mockActor(), candidateId),
  }),
);

export const getOfferLetter = cache(async (candidateId: string) =>
  callApi({
    schema: offerSchema,
    live: {
      path: `/recruitment/candidates/${encodeURIComponent(candidateId)}/offer`,
    },
    mock: async () => mock.offerLetter(await mockActor(), candidateId),
  }),
);

export const getMyInterviews = cache(async () =>
  callApi({
    schema: myInterviewsSchema,
    live: { path: "/recruitment/me/interviews" },
    mock: async () => mock.myInterviews(await mockActor()),
  }),
);

export const getRecruitmentOptions = cache(async () =>
  callApi({
    schema: recruitmentOptionsSchema,
    live: { path: "/recruitment/options" },
    mock: async () => mock.recruitmentOptions(await mockActor()),
  }),
);

export const getMyReferrals = cache(async () =>
  callApi({
    schema: z.array(myReferralSchema),
    live: { path: "/recruitment/me/referrals" },
    mock: async () => mock.myReferrals(await mockActor()),
  }),
);

/* Public careers (unauthenticated) ------------------------------------------- */

export const getPublicJobs = cache(async () =>
  callApi({
    schema: z.array(publicJobSchema),
    live: { path: "/public/careers/jobs" },
    mock: () => mock.publicJobs(),
  }),
);

export const getPublicJob = cache(async (jobId: string) =>
  callApi({
    schema: publicJobSchema,
    live: { path: `/public/careers/jobs/${encodeURIComponent(jobId)}` },
    mock: () => mock.publicJob(jobId),
  }),
);

/* Commands ------------------------------------------------------------------- */

export async function downloadCandidateResume(candidateId: string) {
  return callApi({
    schema: resumeDownloadSchema,
    live: {
      path: `/recruitment/candidates/${encodeURIComponent(candidateId)}/resume`,
    },
    mock: () => {
      throw problem(
        404,
        "DEMO_FILE_UNAVAILABLE",
        "Demo resumes contain metadata only. Connect the live HR service to upload and download files.",
      );
    },
  });
}

const referenceResult = z.object({ reference: z.string() });

export async function submitApplication(
  input: ApplyInput,
  resume: ResumeUpload,
  idempotencyKey: string,
) {
  return callApi({
    schema: referenceResult,
    live: {
      method: "POST",
      path: `/public/careers/jobs/${encodeURIComponent(input.jobId)}/applications`,
      body: { ...input, resume },
      idempotencyKey,
    },
    mock: () =>
      mock.applyToJob(input, resumeMetaSchema.parse(resume), idempotencyKey),
  });
}

export async function submitReferral(
  input: ReferralInput,
  resume: ResumeUpload | null,
  idempotencyKey: string,
) {
  return callApi({
    schema: referenceResult,
    live: {
      method: "POST",
      path: `/recruitment/jobs/${encodeURIComponent(input.jobId)}/referrals`,
      body: { ...input, resume },
      idempotencyKey,
    },
    mock: async () =>
      mock.referCandidate(
        await mockActor(),
        input,
        resume ? resumeMetaSchema.parse(resume) : null,
        idempotencyKey,
      ),
  });
}

export async function submitRequisition(
  input: RequisitionInput,
  idempotencyKey: string,
) {
  return callApi({
    schema: referenceResult,
    live: {
      method: "POST",
      path: "/recruitment/requisitions",
      body: {
        ...input,
        budgetMin: { amount: `${input.budgetMin}.00`, currency: "INR" },
        budgetMax: { amount: `${input.budgetMax}.00`, currency: "INR" },
      },
      idempotencyKey,
    },
    mock: async () =>
      mock.raiseRequisition(await mockActor(), input, idempotencyKey),
  });
}

export async function decideRequisition(input: RequisitionDecisionInput) {
  return callApi({
    schema: z.object({ reference: z.string(), jobId: z.string().nullable() }),
    live: {
      method: "POST",
      path: `/recruitment/requisitions/${encodeURIComponent(input.requisitionId)}/decision`,
      body: { decision: input.decision, note: input.note },
      ifMatch: input.expectedVersion,
    },
    mock: async () => mock.decideRequisition(await mockActor(), input),
  });
}

export async function saveJob(input: JobInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), reference: z.string() }),
    live: input.jobId
      ? {
          method: "PATCH",
          path: `/recruitment/jobs/${encodeURIComponent(input.jobId)}`,
          body: input,
          ifMatch: input.expectedVersion,
        }
      : {
          method: "POST",
          path: "/recruitment/jobs",
          body: input,
          idempotencyKey,
        },
    mock: async () => mock.saveJob(await mockActor(), input, idempotencyKey),
  });
}

export async function changeJobState(input: JobStateInput) {
  return callApi({
    schema: z.object({ id: z.string(), state: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/jobs/${encodeURIComponent(input.jobId)}/state`,
      body: { to: input.to },
      ifMatch: input.expectedVersion,
    },
    mock: async () => mock.changeJobState(await mockActor(), input),
  });
}

export async function addCandidate(
  input: CandidateInput,
  resume: ResumeUpload | null,
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ id: z.string(), reference: z.string() }),
    live: {
      method: "POST",
      path: "/recruitment/candidates",
      body: { ...input, resume },
      idempotencyKey,
    },
    mock: async () =>
      mock.addCandidate(
        await mockActor(),
        input,
        resume ? resumeMetaSchema.parse(resume) : null,
        idempotencyKey,
      ),
  });
}

export async function moveStage(input: StageMoveInput) {
  return callApi({
    schema: z.object({ id: z.string(), stage: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/candidates/${encodeURIComponent(input.candidateId)}/stage`,
      body: { to: input.to, reason: input.reason },
      ifMatch: input.expectedVersion,
    },
    mock: async () => mock.moveStage(await mockActor(), input),
  });
}

export async function addNote(input: CandidateNoteInput) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/candidates/${encodeURIComponent(input.candidateId)}/notes`,
      body: { body: input.body },
    },
    mock: async () => mock.addCandidateNote(await mockActor(), input),
  });
}

export async function eraseCandidate(input: EraseInput) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/candidates/${encodeURIComponent(input.candidateId)}/erase`,
    },
    mock: async () => mock.eraseCandidate(await mockActor(), input),
  });
}

export async function scheduleInterview(
  input: InterviewInput,
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ id: z.string(), round: z.number() }),
    live: {
      method: "POST",
      path: `/recruitment/candidates/${encodeURIComponent(input.candidateId)}/interviews`,
      body: input,
      idempotencyKey,
    },
    mock: async () =>
      mock.scheduleInterview(await mockActor(), input, idempotencyKey),
  });
}

export async function submitScorecard(
  input: ScorecardInput,
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ id: z.string(), state: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/interviews/${encodeURIComponent(input.interviewId)}/scorecards`,
      body: input,
      idempotencyKey,
    },
    mock: async () =>
      mock.submitScorecard(await mockActor(), input, idempotencyKey),
  });
}

export async function createOffer(input: OfferInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/candidates/${encodeURIComponent(input.candidateId)}/offers`,
      body: { ...input, ctc: { amount: `${input.ctc}.00`, currency: "INR" } },
      idempotencyKey,
    },
    mock: async () =>
      mock.createOffer(await mockActor(), input, idempotencyKey),
  });
}

export async function decideOffer(input: OfferApprovalInput) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/offers/${encodeURIComponent(input.offerId)}/approval`,
      body: { decision: input.decision, note: input.note },
      ifMatch: input.expectedVersion,
    },
    mock: async () => mock.decideOfferApproval(await mockActor(), input),
  });
}

export async function respondToOffer(input: OfferResponseInput) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/offers/${encodeURIComponent(input.offerId)}/response`,
      body: { response: input.response, note: input.note },
      ifMatch: input.expectedVersion,
    },
    mock: async () => mock.respondToOffer(await mockActor(), input),
  });
}

export async function convertOffer(
  input: ConvertInput,
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ employeeId: z.string(), code: z.string() }),
    live: {
      method: "POST",
      path: `/recruitment/offers/${encodeURIComponent(input.offerId)}/convert`,
      idempotencyKey,
    },
    mock: async () =>
      mock.convertToEmployee(await mockActor(), input, idempotencyKey),
  });
}
