import "server-only";
import { ApiProblem, problem } from "@/lib/api/core/problem";
import { db, nextId, nowInstant } from "@/lib/mocks/store";
import type { MockSurvey, MockSurveyQuestion } from "@/lib/mocks/seed/engage-plus";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { departmentNames } from "@/lib/mocks/handlers/config";
import { toPoll } from "@/lib/mocks/handlers/engage";
import { notify } from "@/lib/mocks/handlers/notifications";
import { idempotent, me, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { diffDays } from "@/lib/utils/date";
import { surveyQuestionKinds } from "@/types/engage-labels";
import type { QuestionInput, SurveyAdmin, SurveyAnswers, SurveyDetail, SurveyForYou, SurveyInput, SurveyResults, SurveyState, SurveySummary } from "@/types/engage";

const MAX_QUESTIONS = 20;

function invalid(fieldErrors: Record<string, string>, message = "Check the highlighted fields.") {
  return problem(422, "VALIDATION_FAILED", message, { fieldErrors });
}

export function surveyState(survey: MockSurvey, today = db().today): SurveyState {
  if (!survey.publishedAt) return "draft";
  if (survey.closedAt || today > survey.closesOn) return "closed";
  if (today < survey.opensOn) return "scheduled";
  return "open";
}

function audience(survey: MockSurvey): SeedEmployee[] {
  return db().employees.filter((employee) => employee.status !== "exited" && (survey.department === null || employee.department === survey.department));
}

function summary(survey: MockSurvey, actor: MockActor): SurveySummary {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    state: surveyState(survey),
    anonymous: survey.anonymous,
    department: survey.department,
    opensOn: survey.opensOn,
    closesOn: survey.closesOn,
    minResponses: survey.minResponses,
    questionCount: survey.questions.length,
    responseCount: survey.responses.length,
    eligibleCount: audience(survey).length,
    responded: survey.respondentIds.includes(actor.employeeId),
    createdBy: refById(survey.createdBy),
    version: survey.version,
  };
}

function detail(survey: MockSurvey, actor: MockActor): SurveyDetail {
  return { ...summary(survey, actor), questions: survey.questions.map((question) => ({ ...question })), audit: [...survey.audit].reverse() };
}

function findSurvey(id: string) {
  const survey = db().engageSurveys.find((item) => item.id === id);
  if (!survey) throw problem(404, "NOT_FOUND", "That survey no longer exists.");
  return survey;
}

function editableDraft(id: string) {
  const survey = findSurvey(id);
  if (surveyState(survey) !== "draft") throw problem(409, "SURVEY_PUBLISHED", "Published surveys can’t be edited — this keeps every response comparable.");
  return survey;
}

function record(survey: MockSurvey, actor: MockActor, event: string) {
  survey.audit.push({ at: nowInstant(), actor: me(actor).name, event });
  survey.version += 1;
}

/* Employee side ----------------------------------------------------------- */

export function surveysForYou(actor: MockActor): SurveyForYou[] {
  requireCapability(actor, "directory.read");
  const department = me(actor).department;
  return db()
    .engageSurveys.filter((survey) => surveyState(survey) === "open" && (survey.department === null || survey.department === department))
    .sort((a, b) => a.closesOn.localeCompare(b.closesOn))
    .map((survey) => ({ ...summary(survey, actor), questions: survey.questions.map((question) => ({ ...question })) }));
}

function readAnswer(question: MockSurveyQuestion, raw: SurveyAnswers[string] | undefined): number | string | string[] | undefined {
  const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((value) => value.trim()).filter(Boolean);
  const field = `q_${question.id}`;
  if (values.length === 0) {
    if (question.required) throw invalid({ [field]: "This question needs an answer." });
    return undefined;
  }
  switch (question.kind) {
    case "rating":
    case "enps": {
      const max = question.kind === "rating" ? 5 : 10;
      const min = question.kind === "rating" ? 1 : 0;
      const value = Number(values[0]);
      if (values.length !== 1 || !Number.isInteger(value) || value < min || value > max) throw invalid({ [field]: `Pick a score from ${min} to ${max}.` });
      return value;
    }
    case "single":
      if (values.length !== 1 || !question.options.includes(values[0] ?? "")) throw invalid({ [field]: "Pick one of the options." });
      return values[0];
    case "multiple":
      if (values.some((value) => !question.options.includes(value))) throw invalid({ [field]: "Pick from the listed options." });
      return [...new Set(values)];
    case "text": {
      const text = values.join(" ");
      if (text.length > 1000) throw invalid({ [field]: "Keep it under 1000 characters." });
      return text;
    }
  }
}

export function respondToSurvey(actor: MockActor, surveyId: string, answers: SurveyAnswers, key: string | undefined) {
  requireCapability(actor, "engage.post");
  return idempotent(key, () => {
    const survey = findSurvey(surveyId);
    const employee = me(actor);
    if (surveyState(survey) !== "open") throw problem(409, "SURVEY_CLOSED", "This survey isn’t accepting responses.");
    if (survey.department !== null && survey.department !== employee.department) throw problem(403, "FORBIDDEN", "This survey is for another department.");
    if (survey.respondentIds.includes(actor.employeeId)) throw problem(409, "ALREADY_RESPONDED", "You’ve already responded to this survey.");
    const stored: MockSurvey["responses"][number]["answers"] = {};
    const errors: Record<string, string> = {};
    for (const question of survey.questions) {
      try {
        const value = readAnswer(question, answers[question.id]);
        if (value !== undefined) stored[question.id] = value;
      } catch (error) {
        if (error instanceof ApiProblem) Object.assign(errors, error.fieldErrors);
        else throw error;
      }
    }
    if (Object.keys(errors).length) throw invalid(errors, "Answer the required questions.");
    survey.respondentIds.push(actor.employeeId);
    survey.responses.push({ id: nextId("sr"), employeeId: survey.anonymous ? null : actor.employeeId, department: employee.department, submittedAt: nowInstant(), answers: stored });
    return { ok: true };
  });
}

/* HR side ----------------------------------------------------------------- */

export function surveyAdmin(actor: MockActor): SurveyAdmin {
  requireCapability(actor, "survey.manage");
  const store = db();
  const order: Record<SurveyState, number> = { open: 0, scheduled: 1, draft: 2, closed: 3 };
  return {
    surveys: store.engageSurveys.map((survey) => summary(survey, actor)).sort((a, b) => order[a.state] - order[b.state] || b.opensOn.localeCompare(a.opensOn)),
    polls: store.engagePolls.map((poll) => toPoll(poll, actor)).sort((a, b) => (a.state === b.state ? b.createdAt.localeCompare(a.createdAt) : a.state === "open" ? -1 : 1)),
    departments: departmentNames(),
  };
}

export function surveyDetail(actor: MockActor, surveyId: string): SurveyDetail {
  requireCapability(actor, "survey.manage");
  return detail(findSurvey(surveyId), actor);
}

function checkSettings(input: SurveyInput, today: string, isNew: boolean) {
  if (input.department !== null && !departmentNames().includes(input.department)) throw invalid({ department: "Choose a department from the list." });
  if (isNew && input.opensOn < today) throw invalid({ opensOn: "Pick today or a later date." });
  if (diffDays(input.opensOn, input.closesOn) > 90) throw invalid({ closesOn: "Surveys can run for at most 90 days." });
}

export function saveSurvey(actor: MockActor, input: SurveyInput, key: string | undefined) {
  requireCapability(actor, "survey.manage");
  return idempotent(key, () => {
    const store = db();
    if (input.surveyId) {
      const survey = editableDraft(input.surveyId);
      versionCheck(survey.version, input.version);
      checkSettings(input, store.today, false);
      Object.assign(survey, { title: input.title, description: input.description, department: input.department, opensOn: input.opensOn, closesOn: input.closesOn, anonymous: input.anonymous });
      record(survey, actor, "Settings updated");
      return { id: survey.id };
    }
    checkSettings(input, store.today, true);
    const id = nextId("sv");
    store.engageSurveys.unshift({
      id,
      title: input.title,
      description: input.description,
      questions: [],
      department: input.department,
      opensOn: input.opensOn,
      closesOn: input.closesOn,
      anonymous: input.anonymous,
      minResponses: 5,
      createdBy: actor.employeeId,
      createdAt: nowInstant(),
      publishedAt: null,
      closedAt: null,
      respondentIds: [],
      responses: [],
      audit: [{ at: nowInstant(), actor: me(actor).name, event: "Survey created as draft" }],
      version: 1,
    });
    return { id };
  });
}

export function addQuestion(actor: MockActor, input: QuestionInput, key: string | undefined) {
  requireCapability(actor, "survey.manage");
  return idempotent(key, () => {
    const survey = editableDraft(input.surveyId);
    if (survey.questions.length >= MAX_QUESTIONS) throw problem(422, "TOO_MANY_QUESTIONS", `Keep surveys to ${MAX_QUESTIONS} questions or fewer.`);
    const choice = input.kind === "single" || input.kind === "multiple";
    survey.questions.push({ id: nextId("sq"), kind: input.kind, prompt: input.prompt, required: input.required, options: choice ? input.options : [] });
    record(survey, actor, `Question added (${surveyQuestionKinds[input.kind]})`);
    return { ok: true };
  });
}

export function removeQuestion(actor: MockActor, surveyId: string, questionId: string) {
  requireCapability(actor, "survey.manage");
  const survey = editableDraft(surveyId);
  const index = survey.questions.findIndex((question) => question.id === questionId);
  if (index === -1) throw problem(404, "NOT_FOUND", "That question was already removed.");
  survey.questions.splice(index, 1);
  record(survey, actor, "Question removed");
  return { ok: true };
}

export function moveQuestion(actor: MockActor, surveyId: string, questionId: string, direction: "up" | "down") {
  requireCapability(actor, "survey.manage");
  const survey = editableDraft(surveyId);
  const index = survey.questions.findIndex((question) => question.id === questionId);
  const target = direction === "up" ? index - 1 : index + 1;
  const [moved] = survey.questions.splice(index, 1);
  if (index === -1 || !moved || target < 0 || target > survey.questions.length) {
    if (moved) survey.questions.splice(index, 0, moved);
    throw problem(409, "CANNOT_MOVE", "That question can’t move further.");
  }
  survey.questions.splice(target, 0, moved);
  survey.version += 1;
  return { ok: true };
}

export function publishSurvey(actor: MockActor, surveyId: string) {
  requireCapability(actor, "survey.manage");
  const store = db();
  const survey = editableDraft(surveyId);
  if (survey.questions.length === 0) throw problem(422, "NO_QUESTIONS", "Add at least one question before publishing.");
  if (survey.closesOn < store.today) throw problem(422, "DATES_PASSED", "The close date has passed — edit the dates first.");
  if (survey.opensOn < store.today) survey.opensOn = store.today;
  survey.publishedAt = nowInstant();
  const people = audience(survey);
  record(survey, actor, `Published to ${survey.department ?? "all employees"} (${people.length} people${survey.anonymous ? `, anonymous, minimum ${survey.minResponses} responses` : ""})`);
  if (surveyState(survey) === "open") for (const person of people) notify(person.id, "system", "New survey for you", `${survey.title} — open until ${survey.closesOn}.`, "/engage/polls");
  return { ok: true };
}

export function closeSurvey(actor: MockActor, surveyId: string) {
  requireCapability(actor, "survey.manage");
  const survey = findSurvey(surveyId);
  const state = surveyState(survey);
  if (state !== "open" && state !== "scheduled") throw problem(409, "NOT_OPEN", "Only open or scheduled surveys can be closed.");
  survey.closedAt = nowInstant();
  record(survey, actor, `Closed early with ${survey.responses.length} responses`);
  return { ok: true };
}

export function discardSurvey(actor: MockActor, surveyId: string) {
  requireCapability(actor, "survey.manage");
  const survey = editableDraft(surveyId);
  const store = db();
  store.engageSurveys.splice(store.engageSurveys.indexOf(survey), 1);
  return { ok: true };
}

/* Results ----------------------------------------------------------------- */

/** One decimal place from integers, e.g. 42 / 10 → "4.2". */
function oneDecimal(sum: number, count: number): string | null {
  if (count === 0) return null;
  const tenths = Math.round((sum * 10) / count);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
const percent = (part: number, whole: number) => (whole ? Math.round((part * 100) / whole) : 0);

function enpsOf(scores: number[]) {
  const promoters = scores.filter((score) => score >= 9).length;
  const detractors = scores.filter((score) => score <= 6).length;
  return { score: scores.length ? Math.round(((promoters - detractors) * 100) / scores.length) : 0, promoters, passives: scores.length - promoters - detractors, detractors, responses: scores.length };
}

export function surveyResults(actor: MockActor, surveyId: string): SurveyResults {
  requireCapability(actor, "survey.manage");
  const survey = findSurvey(surveyId);
  if (surveyState(survey) === "draft") throw problem(409, "NOT_PUBLISHED", "Publish the survey to collect results.");
  const responses = survey.responses;
  const eligible = audience(survey);
  const suppressed = survey.anonymous && responses.length < survey.minResponses;
  const enpsQuestion = survey.questions.find((question) => question.kind === "enps");
  const ratingQuestion = survey.questions.find((question) => question.kind === "rating");
  const numbers = (questionId: string, list = responses) =>
    list.flatMap((response) => {
      const value = response.answers[questionId];
      return typeof value === "number" ? [value] : [];
    });

  const questions = suppressed
    ? []
    : survey.questions.map((question) => {
        const answeredList = responses.filter((response) => response.answers[question.id] !== undefined);
        const answered = answeredList.length;
        if (question.kind === "rating" || question.kind === "enps") {
          const scores = numbers(question.id);
          const scale = question.kind === "rating" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
          return {
            id: question.id,
            kind: question.kind,
            prompt: question.prompt,
            answered,
            average: oneDecimal(scores.reduce((sum, value) => sum + value, 0), scores.length),
            distribution: scale.map((score) => {
              const count = scores.filter((value) => value === score).length;
              return { label: String(score), count, percent: percent(count, answered) };
            }),
            texts: [],
          };
        }
        if (question.kind === "text")
          return {
            id: question.id,
            kind: question.kind,
            prompt: question.prompt,
            answered,
            average: null,
            distribution: [],
            texts: answeredList.map((response, index) => ({
              id: `${question.id}_${index}`,
              body: String(response.answers[question.id]),
              author: survey.anonymous ? null : (refById(response.employeeId)?.name ?? null),
            })),
          };
        return {
          id: question.id,
          kind: question.kind,
          prompt: question.prompt,
          answered,
          average: null,
          distribution: question.options.map((option) => {
            const count = answeredList.filter((response) => {
              const value = response.answers[question.id];
              return Array.isArray(value) ? value.includes(option) : value === option;
            }).length;
            return { label: option, count, percent: percent(count, answered) };
          }),
          texts: [],
        };
      });

  const departments = [...new Set(eligible.map((employee) => employee.department))].sort().map((name) => {
    const list = responses.filter((response) => response.department === name);
    const hidden = survey.anonymous && list.length < survey.minResponses;
    const scores = enpsQuestion ? numbers(enpsQuestion.id, list) : [];
    const ratings = ratingQuestion ? numbers(ratingQuestion.id, list) : [];
    return {
      name,
      eligible: eligible.filter((employee) => employee.department === name).length,
      responses: hidden ? 0 : list.length,
      suppressed: hidden,
      enps: hidden || !enpsQuestion || scores.length === 0 ? null : enpsOf(scores).score,
      averageRating: hidden ? null : oneDecimal(ratings.reduce((sum, value) => sum + value, 0), ratings.length),
    };
  });

  return {
    survey: detail(survey, actor),
    responseRate: Math.min(100, percent(responses.length, eligible.length)),
    suppressed,
    enps: suppressed || !enpsQuestion ? null : enpsOf(numbers(enpsQuestion.id)),
    questions,
    departments,
  };
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Aggregated results only; free text and anything below the threshold stay out. */
export function surveyResultsCsv(actor: MockActor, surveyId: string) {
  const results = surveyResults(actor, surveyId);
  const rows: (string | number)[][] = [["section", "question", "type", "answer", "count", "percent"]];
  rows.push(["summary", "Responses", "count", "", results.survey.responseCount, results.responseRate]);
  rows.push(["summary", "Eligible employees", "count", "", results.survey.eligibleCount, ""]);
  if (results.suppressed) rows.push(["summary", `Results hidden: fewer than ${results.survey.minResponses} responses`, "note", "", "", ""]);
  if (results.enps) rows.push(["summary", "eNPS", "score", `promoters ${results.enps.promoters} / passives ${results.enps.passives} / detractors ${results.enps.detractors}`, results.enps.score, ""]);
  for (const question of results.questions) {
    if (question.kind === "text") {
      rows.push(["question", question.prompt, surveyQuestionKinds[question.kind], "Free-text answers (not exported)", question.answered, ""]);
      continue;
    }
    if (question.average) rows.push(["question", question.prompt, surveyQuestionKinds[question.kind], "Average", question.average, ""]);
    for (const bucket of question.distribution) rows.push(["question", question.prompt, surveyQuestionKinds[question.kind], bucket.label, bucket.count, bucket.percent]);
  }
  for (const department of results.departments)
    rows.push(["department", department.name, "breakdown", department.suppressed ? `suppressed (fewer than ${results.survey.minResponses})` : `eNPS ${department.enps ?? "—"}; avg rating ${department.averageRating ?? "—"}`, department.suppressed ? "" : department.responses, department.suppressed ? "" : percent(department.responses, department.eligible)]);
  const slug = results.survey.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "survey";
  return { csv: rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), fileName: `${slug}-results.csv` };
}
