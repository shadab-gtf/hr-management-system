import { z } from "zod";
import * as p from "../../contracts/performance.js";
export const reviewRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  cycleId: z.string(),
  reviewerId: z.string().nullable(),
  originalReviewerId: z.string().nullable(),
  version: z.number().int(),
  sheet: p.perfSheetSchema,
  goals: z.array(p.perfGoalSchema),
  self: p.perfSelfPartSchema,
  manager: p.perfManagerPartSchema,
  finalRating: z.number().int().nullable(),
  finalReason: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  acknowledgementComment: z.string().nullable(),
});
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
const optionalId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null);
const rating = z
  .union([
    z.number().int().min(1).max(5),
    z
      .string()
      .regex(/^[1-5]$/)
      .transform(Number),
    z.null(),
  ])
  .optional()
  .transform((v) => v ?? null);
export const reviewInput = p.reviewInputSchema.extend({
  goals: z.array(p.ratingEntryInputSchema.extend({ rating })),
  competencies: z.array(p.ratingEntryInputSchema.extend({ rating })),
});
export const managerInput = reviewInput.extend({
  overallRating: rating,
  summary: z.string().max(2000),
  promotion: p.perfPromotionSchema,
  incrementPercent: z
    .string()
    .regex(/^\d{1,2}(\.\d{1,2})?$/)
    .nullable(),
});
export const goalInput = p.goalInputSchema.extend({ objectiveId: optionalId });
export const feedbackInput = p.feedbackInputSchema.extend({ competencyId: optionalId, requestId: optionalId });
export const requestInput = p.feedbackRequestInputSchema.extend({ goalId: optionalId });
export const competencyInput = p.competencyInputSchema.extend({
  behaviours: z.array(z.string().min(1).max(160)).min(1).max(6),
});
