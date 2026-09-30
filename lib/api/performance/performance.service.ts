import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  acknowledgeReview,
  addOneOnOne,
  advancePhase,
  calibrateRating,
  checkInGoal,
  decideGoals,
  declineFeedbackRequest,
  deleteGoal,
  getAdminPerformance,
  getFeedbackHub,
  getMyPerformance,
  getTeamPerformance,
  giveFeedback,
  reassignReviewer,
  requestFeedback,
  saveCompetency,
  saveCycle,
  saveGoal,
  saveManagerReview,
  saveSelfReview,
  setCalibrationLock,
  submitGoals,
} from "@/lib/mocks/handlers/performance";
import {
  adminPerformanceSchema,
  feedbackHubSchema,
  myPerformanceSchema,
  teamPerformanceSchema,
  type AcknowledgeInput,
  type CalibrateInput,
  type CheckInInput,
  type CompetencyInput,
  type CycleInput,
  type FeedbackInput,
  type FeedbackRequestInput,
  type GoalDecisionInput,
  type GoalInput,
  type ManagerReviewInput,
  type OneOnOneInput,
  type PerfPhase,
  type ReassignInput,
  type ReviewInput,
} from "@/types/performance";

const ok = z.looseObject({});

/* Reads -------------------------------------------------------------------- */

export const getMyPerformanceView = cache(async (cycleId?: string) =>
  callApi({
    schema: myPerformanceSchema,
    live: { path: "/performance/me", query: { cycle: cycleId } },
    mock: async () => getMyPerformance(await mockActor(), cycleId),
  }),
);

export const getTeamPerformanceView = cache(async (cycleId?: string, reviewId?: string) =>
  callApi({
    schema: teamPerformanceSchema,
    live: { path: "/performance/team", query: { cycle: cycleId, review: reviewId } },
    mock: async () => getTeamPerformance(await mockActor(), cycleId, reviewId),
  }),
);

export const getAdminPerformanceView = cache(async (cycleId?: string) =>
  callApi({
    schema: adminPerformanceSchema,
    live: { path: "/performance/cycles/overview", query: { cycle: cycleId } },
    mock: async () => getAdminPerformance(await mockActor(), cycleId),
  }),
);

export const getFeedbackHubView = cache(async () =>
  callApi({
    schema: feedbackHubSchema,
    live: { path: "/performance/feedback" },
    mock: async () => getFeedbackHub(await mockActor()),
  }),
);

/* Commands ----------------------------------------------------------------- */

export async function writeGoal(input: GoalInput, idempotencyKey: string) {
  return callApi({
    schema: ok,
    live: { method: input.id ? "PATCH" : "POST", path: input.id ? `/performance/goals/${input.id}` : "/performance/goals", body: input, idempotencyKey },
    mock: async () => saveGoal(await mockActor(), input, idempotencyKey),
  });
}
export async function removeGoal(goalId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/goals/${goalId}/delete` }, mock: async () => deleteGoal(await mockActor(), goalId) });
}
export async function sendGoalsForApproval(cycleId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/cycles/${cycleId}/goal-sheet/submit` }, mock: async () => submitGoals(await mockActor(), cycleId) });
}
export async function recordCheckIn(input: CheckInInput, idempotencyKey: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/goals/${input.goalId}/check-ins`, body: input, idempotencyKey }, mock: async () => checkInGoal(await mockActor(), input, idempotencyKey) });
}
export async function writeSelfReview(input: ReviewInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: `/performance/reviews/${input.reviewId}/self`, body: input }, mock: async () => saveSelfReview(await mockActor(), input) });
}
export async function writeAcknowledgement(input: AcknowledgeInput) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/reviews/${input.reviewId}/acknowledge`, body: input }, mock: async () => acknowledgeReview(await mockActor(), input) });
}
export async function writeGoalDecision(input: GoalDecisionInput) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/goal-sheets/${input.sheetId}/decision`, body: input }, mock: async () => decideGoals(await mockActor(), input) });
}
export async function writeManagerReview(input: ManagerReviewInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: `/performance/reviews/${input.reviewId}/manager`, body: input }, mock: async () => saveManagerReview(await mockActor(), input) });
}
export async function writeCycle(input: CycleInput, idempotencyKey: string) {
  return callApi({
    schema: ok,
    live: { method: input.id ? "PATCH" : "POST", path: input.id ? `/performance/cycles/${input.id}` : "/performance/cycles", body: input, idempotencyKey },
    mock: async () => saveCycle(await mockActor(), input, idempotencyKey),
  });
}
export async function moveCyclePhase(cycleId: string, expectedPhase: PerfPhase) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/cycles/${cycleId}/advance`, body: { expectedPhase } }, mock: async () => advancePhase(await mockActor(), cycleId, expectedPhase) });
}
export async function writeCalibrationLock(cycleId: string, lock: boolean) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/cycles/${cycleId}/calibration/${lock ? "lock" : "reopen"}` }, mock: async () => setCalibrationLock(await mockActor(), cycleId, lock) });
}
export async function writeFinalRating(input: CalibrateInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: `/performance/reviews/${input.reviewId}/final-rating`, body: input }, mock: async () => calibrateRating(await mockActor(), input) });
}
export async function writeReviewer(input: ReassignInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: `/performance/reviews/${input.reviewId}/reviewer`, body: input }, mock: async () => reassignReviewer(await mockActor(), input) });
}
export async function writeCompetency(input: CompetencyInput) {
  return callApi({
    schema: ok,
    live: { method: input.id ? "PATCH" : "POST", path: input.id ? `/performance/competencies/${input.id}` : "/performance/competencies", body: input },
    mock: async () => saveCompetency(await mockActor(), input),
  });
}
export async function writeFeedback(input: FeedbackInput, idempotencyKey: string) {
  return callApi({ schema: ok, live: { method: "POST", path: "/performance/feedback", body: input, idempotencyKey }, mock: async () => giveFeedback(await mockActor(), input, idempotencyKey) });
}
export async function writeFeedbackRequest(input: FeedbackRequestInput, idempotencyKey: string) {
  return callApi({ schema: ok, live: { method: "POST", path: "/performance/feedback-requests", body: input, idempotencyKey }, mock: async () => requestFeedback(await mockActor(), input, idempotencyKey) });
}
export async function writeDeclineRequest(requestId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/performance/feedback-requests/${requestId}/decline` }, mock: async () => declineFeedbackRequest(await mockActor(), requestId) });
}
export async function writeOneOnOne(input: OneOnOneInput, idempotencyKey: string) {
  return callApi({ schema: ok, live: { method: "POST", path: "/performance/one-on-ones", body: input, idempotencyKey }, mock: async () => addOneOnOne(await mockActor(), input, idempotencyKey) });
}
