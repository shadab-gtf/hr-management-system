import { z } from "zod";
import { structureProposalSchema, assignmentProposalSchema } from "../../contracts/statutory.js";
export { structureProposalSchema, assignmentProposalSchema };
export const calcQuerySchema = z.object({
  ctc: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/)
    .optional(),
  template: z.string().max(40).optional(),
  state: z.string().max(8).optional(),
  regime: z.enum(["new", "old"]).optional(),
});
export const compensationUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  records: z
    .array(
      z.object({
        employeeCode: z.string().trim().min(1).max(32),
        effectiveFrom: z.iso.date(),
        annualCtc: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
        reason: z.string().trim().min(3).max(300),
      }),
    )
    .min(1)
    .max(5000),
});
export const batchDecisionSchema = z
  .object({ decision: z.enum(["submit", "approve", "reject"]), reason: z.string().trim().max(300).default("") })
  .refine((value) => value.decision !== "reject" || value.reason.length >= 3, {
    path: ["reason"],
    message: "Add a rejection reason.",
  });
export const changeDecisionParams = z.object({
  id: z.string().min(1).max(40),
  decision: z.enum(["approve", "reject", "withdraw"]),
});
export const compensationFileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  base64: z
    .string()
    .min(4)
    .max(7_000_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
