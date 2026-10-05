import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  addQuestion,
  closeSurvey,
  discardSurvey,
  moveQuestion,
  publishSurvey,
  removeQuestion,
  respondToSurvey,
  saveSurvey,
  surveyAdmin,
  surveyDetail,
  surveyResults,
  surveyResultsCsv,
  surveysForYou,
} from "@/lib/mocks/handlers/engage-surveys";
import { surveyAdminSchema, surveyDetailSchema, surveyResultsSchema, surveysForYouSchema, type QuestionInput, type SurveyAnswers, type SurveyInput } from "@/types/engage";

const ok = z.object({ ok: z.boolean() });
const path = (id: string) => `/engage/surveys/${encodeURIComponent(id)}`;

export const getSurveysForYou = cache(async () =>
  callApi({ schema: surveysForYouSchema, live: { path: "/me/surveys" }, mock: async () => surveysForYou(await mockActor()) }),
);

export const getSurveyAdmin = cache(async () =>
  callApi({ schema: surveyAdminSchema, live: { path: "/engage/surveys" }, mock: async () => surveyAdmin(await mockActor()) }),
);

export const getSurveyDetail = cache(async (surveyId: string) =>
  callApi({ schema: surveyDetailSchema, live: { path: path(surveyId) }, mock: async () => surveyDetail(await mockActor(), surveyId) }),
);

export const getSurveyResults = cache(async (surveyId: string) =>
  callApi({ schema: surveyResultsSchema, live: { path: `${path(surveyId)}/results` }, mock: async () => surveyResults(await mockActor(), surveyId) }),
);

export async function submitSurveyResponse(surveyId: string, answers: SurveyAnswers, idempotencyKey: string) {
  return callApi({
    schema: ok,
    live: { method: "POST", path: `${path(surveyId)}/responses`, body: { answers }, idempotencyKey },
    mock: async () => respondToSurvey(await mockActor(), surveyId, answers, idempotencyKey),
  });
}

export async function upsertSurvey(input: SurveyInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: input.surveyId
      ? { method: "PATCH", path: path(input.surveyId), body: input, idempotencyKey, ...(input.version !== undefined ? { ifMatch: input.version } : {}) }
      : { method: "POST", path: "/engage/surveys", body: input, idempotencyKey },
    mock: async () => saveSurvey(await mockActor(), input, idempotencyKey),
  });
}

export async function createQuestion(input: QuestionInput, idempotencyKey: string) {
  return callApi({
    schema: ok,
    live: { method: "POST", path: `${path(input.surveyId)}/questions`, body: input, idempotencyKey },
    mock: async () => addQuestion(await mockActor(), input, idempotencyKey),
  });
}

export async function deleteQuestion(surveyId: string, questionId: string) {
  return callApi({
    schema: ok,
    live: { method: "POST", path: `${path(surveyId)}/questions/${encodeURIComponent(questionId)}/archive`, body: {} },
    mock: async () => removeQuestion(await mockActor(), surveyId, questionId),
  });
}

export async function reorderQuestion(surveyId: string, questionId: string, direction: "up" | "down") {
  return callApi({
    schema: ok,
    live: { method: "POST", path: `${path(surveyId)}/questions/${encodeURIComponent(questionId)}/move`, body: { direction } },
    mock: async () => moveQuestion(await mockActor(), surveyId, questionId, direction),
  });
}

export async function publish(surveyId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `${path(surveyId)}/publish`, body: {} }, mock: async () => publishSurvey(await mockActor(), surveyId) });
}

export async function close(surveyId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `${path(surveyId)}/close`, body: {} }, mock: async () => closeSurvey(await mockActor(), surveyId) });
}

export async function discard(surveyId: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `${path(surveyId)}/archive`, body: {} }, mock: async () => discardSurvey(await mockActor(), surveyId) });
}

export async function exportSurveyResults(surveyId: string) {
  const csv = await callApi({ schema: z.string(), live: { path: `${path(surveyId)}/results/export` }, mock: async () => surveyResultsCsv(await mockActor(), surveyId).csv });
  const safeId = surveyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "export";
  return { csv, fileName: `survey-${safeId}-results.csv` };
}
