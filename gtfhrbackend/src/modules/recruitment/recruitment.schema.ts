import { z } from "zod";
import * as r from "../../contracts/recruitment.js";
import { moneySchema } from "../../contracts/common.js";
const amount = z.union([moneySchema.transform((v) => v.amount), z.string().regex(/^\d{1,9}(\.\d{1,2})?$/)]);
export const requisitionInput = z
  .object({ ...r.requisitionInputSchema.shape, budgetMin: amount, budgetMax: amount })
  .refine((v) => Number(v.budgetMax) >= Number(v.budgetMin) && (v.justification !== "backfill" || !!v.backfillFor), {
    message: "Check the budget and backfill details.",
  });
export const jobInput = z
  .object({
    ...r.jobInputSchema.shape,
    skills: z.array(z.string().min(1).max(40)).min(1).max(12),
    publishToCareers: z.boolean(),
    ctcMin: amount,
    ctcMax: amount,
  })
  .refine((v) => v.experienceMax >= v.experienceMin && Number(v.ctcMax) >= Number(v.ctcMin), {
    message: "Maximum experience and CTC must be at least the minimum.",
  });
export const resumeUpload = r.resumeMetaSchema
  .extend({
    contentBase64: z
      .string()
      .min(4)
      .max(6990508)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .refine((value) => value.length % 4 === 0),
  })
  .superRefine((value, ctx) => {
    const bytes = Buffer.from(value.contentBase64, "base64");
    const valid =
      bytes.length === value.sizeBytes &&
      bytes.length <= 5 * 1024 * 1024 &&
      (value.mime === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : value.mime === "application/msword"
          ? bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))
          : bytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex")));
    if (!valid)
      ctx.addIssue({
        code: "custom",
        path: ["contentBase64"],
        message: "The resume content does not match its declared size or file type.",
      });
  });
export const candidateInput = z
  .object({
    ...r.candidateInputSchema.shape,
    allowDuplicate: z.boolean().default(false),
    resume: resumeUpload.nullable().default(null),
  })
  .refine((v) => v.source !== "referral" || !!v.referrerId, { message: "Choose the referring employee." });
export const applyInput = r.applyInputSchema.extend({ resume: resumeUpload });
export const referralInput = r.referralInputSchema.extend({ resume: resumeUpload.nullable().default(null) });
export const offerInput = r.offerInputSchema.extend({ ctc: amount });
export const decisionInput = z
  .object({ decision: z.enum(["approve", "reject"]), note: z.string().max(400).default("") })
  .refine((v) => v.decision !== "reject" || v.note.length >= 5, { message: "Provide a rejection reason." });
export const responseInput = z
  .object({ response: z.enum(["accepted", "declined"]), note: z.string().max(400).default("") })
  .refine((v) => v.response !== "declined" || v.note.length >= 3, { message: "Provide a decline reason." });
export const stageInput = z
  .object({ to: r.recruitmentStageSchema.exclude(["hired"]), reason: z.string().max(400).default("") })
  .refine((v) => v.to !== "rejected" || v.reason.length >= 5, { message: "Provide a rejection reason." });
export const candidateRecord = r.candidateDetailSchema.extend({
  stageChangedAt: z.string(),
  resumeFileId: z.string().nullable().default(null),
});
export type CandidateRecord = z.infer<typeof candidateRecord>;
