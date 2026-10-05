"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { comment, endPoll, publishPoll, publishPost, react, removePost, sendPraise, vote } from "@/lib/api/engage/engage.service";
import { close, createQuestion, deleteQuestion, discard, publish, reorderQuestion, submitSurveyResponse, upsertSurvey } from "@/lib/api/engage/surveys.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  commentInputSchema,
  pollInputSchema,
  postInputSchema,
  praiseInputSchema,
  questionInputSchema,
  reactionKindSchema,
  surveyAnswersSchema,
  surveyInputSchema,
  voteInputSchema,
  type SurveyAnswers,
} from "@/types/engage";
import type { ActionResult } from "@/types/action";

export async function createPostAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = postInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await publishPost(parsed.data, key.data);
    refresh();
    return success("Posted to Engage");
  } catch (error) {
    return failure(error);
  }
}

export async function commentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = commentInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await comment(parsed.data.postId, parsed.data.body, key.data);
    refresh();
    return success("Comment added");
  } catch (error) {
    return failure(error);
  }
}

const reactSchema = z.object({ postId: z.string().min(1), kind: reactionKindSchema });

/** Reactions are harmless UI preference state, so the client may show them optimistically. */
export async function reactAction(postId: string, kind: string): Promise<void> {
  const parsed = reactSchema.safeParse({ postId, kind });
  if (!parsed.success) return;
  await react(parsed.data.postId, parsed.data.kind);
  refresh();
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  try {
    await removePost(z.string().min(1).parse(postId));
    refresh();
    return success("Post removed");
  } catch (error) {
    return failure(error);
  }
}

/* Polls -------------------------------------------------------------------- */

const checked = (value: string | undefined) => value === "on" || value === "true";
const strings = (values: FormDataEntryValue[]) => values.filter((value): value is string => typeof value === "string");

export async function createPollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = pollInputSchema.safeParse({
    question: fields.question,
    options: strings(formData.getAll("option")),
    multiple: checked(fields.multiple),
    anonymous: checked(fields.anonymous),
    closesOn: fields.closesOn,
    department: fields.department ? fields.department : null,
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await publishPoll(parsed.data, key.data);
    refresh();
    return success("Poll published");
  } catch (error) {
    return failure(error);
  }
}

export async function voteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = voteInputSchema.safeParse({ pollId: formData.get("pollId"), optionIds: strings(formData.getAll("optionId")) });
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await vote(parsed.data.pollId, parsed.data.optionIds);
    refresh();
    return success(result.changed ? "Vote updated" : "Vote recorded");
  } catch (error) {
    return failure(error);
  }
}

export async function closePollAction(pollId: string): Promise<ActionResult> {
  try {
    await endPoll(z.string().min(1).parse(pollId));
    refresh();
    return success("Poll closed — results are final");
  } catch (error) {
    return failure(error);
  }
}

/* Praise ------------------------------------------------------------------- */

export async function givePraiseAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = praiseInputSchema.safeParse({
    recipientIds: strings(formData.getAll("recipientId")).filter(Boolean),
    badge: fields.badge,
    value: fields.value,
    message: fields.message,
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await sendPraise(parsed.data, key.data);
    refresh();
    return success("Praise shared on the wall and in the feed");
  } catch (error) {
    return failure(error);
  }
}

/* Surveys ------------------------------------------------------------------ */

export async function respondSurveyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const surveyId = z.string().min(1).safeParse(formData.get("surveyId"));
  if (!surveyId.success) return validationError(surveyId.error);
  const key = idempotencyKeySchema.safeParse(formData.get("idempotencyKey"));
  if (!key.success) return validationError(key.error);
  const answers: SurveyAnswers = {};
  for (const name of new Set(formData.keys())) {
    if (!name.startsWith("q_")) continue;
    const values = strings(formData.getAll(name));
    answers[name.slice(2)] = values.length === 1 ? (values[0] ?? "") : values;
  }
  const parsed = surveyAnswersSchema.safeParse(answers);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await submitSurveyResponse(surveyId.data, parsed.data, key.data);
    refresh();
    return success("Thanks — your response is in");
  } catch (error) {
    return failure(error);
  }
}

export async function saveSurveyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = surveyInputSchema.safeParse({
    ...(fields.surveyId ? { surveyId: fields.surveyId, version: fields.version } : {}),
    title: fields.title,
    description: fields.description ?? "",
    department: fields.department ? fields.department : null,
    opensOn: fields.opensOn,
    closesOn: fields.closesOn,
    anonymous: checked(fields.anonymous),
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await upsertSurvey(parsed.data, key.data);
    refresh();
    return success(parsed.data.surveyId ? "Survey settings saved" : "Draft survey created", result.id);
  } catch (error) {
    return failure(error);
  }
}

export async function addQuestionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = questionInputSchema.safeParse({
    surveyId: fields.surveyId,
    kind: fields.kind,
    prompt: fields.prompt,
    required: checked(fields.required),
    options: (fields.options ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await createQuestion(parsed.data, key.data);
    refresh();
    return success("Question added");
  } catch (error) {
    return failure(error);
  }
}

const idSchema = z.string().min(1).max(64);

async function run(label: string, command: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await command();
    refresh();
    return success(label);
  } catch (error) {
    return failure(error);
  }
}

export async function removeQuestionAction(surveyId: string, questionId: string): Promise<ActionResult> {
  return run("Question removed", () => deleteQuestion(idSchema.parse(surveyId), idSchema.parse(questionId)));
}
export async function moveQuestionAction(surveyId: string, questionId: string, direction: string): Promise<ActionResult> {
  return run("Question moved", () => reorderQuestion(idSchema.parse(surveyId), idSchema.parse(questionId), z.enum(["up", "down"]).parse(direction)));
}
export async function publishSurveyAction(surveyId: string): Promise<ActionResult> {
  return run("Survey published — the audience has been notified", () => publish(idSchema.parse(surveyId)));
}
export async function closeSurveyAction(surveyId: string): Promise<ActionResult> {
  return run("Survey closed — results are final", () => close(idSchema.parse(surveyId)));
}
export async function discardSurveyAction(surveyId: string): Promise<ActionResult> {
  return run("Draft discarded", () => discard(idSchema.parse(surveyId)));
}
