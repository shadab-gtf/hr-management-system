import { z } from "zod";
export {
  challanInputSchema,
  pfSettingsInputSchema,
  ptSlabsInputSchema,
  statutoryProfileInputSchema,
} from "../../contracts/statutory.js";
export const fyQuery = z.object({
  fy: z
    .string()
    .regex(/^\d{4}(?:-\d{2})?$/)
    .optional(),
});
export const fyParams = z.object({ fy: z.string().regex(/^\d{4}(?:-\d{2})?$/) });
export const stateParams = z.object({ state: z.string().regex(/^[A-Z]{2}$/) });
export const bankDecisionSchema = z.object({ decision: z.enum(["verified", "failed"]) });
export const fileParams = z.object({
  file: z
    .enum(["ecr", "esi", "pt", "lwf", "24q", "24Q", "tds", "ecr.txt", "esi.csv", "pt.csv", "lwf.csv", "24q.csv"])
    .transform((value) => value.split(".")[0] ?? value),
});
export const fileQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  entity: z.string().max(40).optional(),
});
