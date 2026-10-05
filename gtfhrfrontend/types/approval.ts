import { z } from "zod";
import {
  decimalSchema,
  instantSchema,
  isoDateSchema,
  moneySchema,
  personRefSchema,
} from "@/types/common";

export const approvalKindSchema = z.enum(["leave", "regularization", "permission", "expense"]);

export const approvalItemSchema = z.object({
  id: z.string(),
  kind: approvalKindSchema,
  reference: z.string(),
  requester: personRefSchema,
  title: z.string(),
  summary: z.string(),
  submittedAt: instantSchema,
  state: z.enum(["pending", "approved", "rejected"]),
  version: z.number().int(),
  delegatedFrom: personRefSchema.nullable(),
  /** Kind-specific review context supplied by the server. */
  context: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("leave"),
      leaveType: z.string(),
      startDate: isoDateSchema,
      endDate: isoDateSchema,
      units: decimalSchema,
      availableBefore: decimalSchema,
      availableAfter: decimalSchema,
      policyVersion: z.string(),
      reason: z.string(),
      overlaps: z.array(z.string()),
    }),
    z.object({
      kind: z.literal("regularization"),
      date: isoDateSchema,
      recordedIn: z.string().nullable(),
      recordedOut: z.string().nullable(),
      proposedIn: z.string(),
      proposedOut: z.string(),
      reason: z.string(),
    }),
    z.object({
      kind: z.literal("permission"),
      date: isoDateSchema,
      from: z.string(),
      to: z.string(),
      minutes: z.number().int(),
      reason: z.string(),
    }),
    z.object({
      kind: z.literal("expense"),
      category: z.string(),
      amount: moneySchema,
      incurredOn: isoDateSchema,
      merchant: z.string(),
      receipts: z.number().int(),
      duplicateWarning: z.string().nullable(),
    }),
  ]),
  history: z.array(
    z.object({ at: instantSchema, actor: z.string(), event: z.string() }),
  ),
});

export const approvalDecisionInputSchema = z
  .object({
    approvalId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).default(""),
    expectedVersion: z.coerce.number().int(),
  })
  .refine((value) => value.decision === "approve" || value.note.length >= 3, {
    path: ["note"],
    message: "A reason is required when rejecting.",
  });

export type ApprovalKind = z.infer<typeof approvalKindSchema>;
export type ApprovalItem = z.infer<typeof approvalItemSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionInputSchema>;

/** Decisions handled on module pages, surfaced in the inbox as counts. */
export const workQueueItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  detail: z.string(),
  icon: z.enum(["calendarCheck", "swap", "moneyIn", "task", "userRemove", "calculator", "box", "flag", "userAdd", "briefcase", "clipboard"]),
  href: z.string(),
  count: z.number().int().positive(),
});
export type WorkQueueItem = z.infer<typeof workQueueItemSchema>;
