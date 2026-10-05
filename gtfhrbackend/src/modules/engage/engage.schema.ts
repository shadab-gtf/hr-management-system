import { z } from "zod";
import {
  postSchema,
  pollInputSchema,
  surveyDetailSchema,
  surveyAnswersSchema,
  praiseInputSchema,
} from "../../contracts/engage.js";
export const storedPost = postSchema;
export const storedPoll = z.object({
  id: z.string(),
  input: pollInputSchema,
  authorId: z.string(),
  createdAt: z.string(),
  closedEarly: z.boolean(),
});
export const storedBallot = z.object({ optionIds: z.array(z.string()) });
export const storedPraise = praiseInputSchema.extend({
  id: z.string(),
  giverId: z.string(),
  postId: z.string(),
  createdAt: z.string(),
});
export const storedSurvey = surveyDetailSchema;
export const storedResponse = z.object({
  answers: surveyAnswersSchema,
  department: z.string(),
  author: z.string().nullable(),
});
