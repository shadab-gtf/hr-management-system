import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema, toneSchema } from "./common.js";

/* Unified request hub ------------------------------------------------------ */

export const requestModuleSchema = z.enum([
  "leave",
  "regularization",
  "permission",
  "expense",
  "helpdesk",
  "letter",
  "profile",
  "loan",
  "resignation",
  "asset",
]);

export const trackedRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  module: requestModuleSchema,
  title: z.string(),
  detail: z.string(),
  submittedAt: instantSchema,
  status: z.object({ label: z.string(), tone: toneSchema }),
  open: z.boolean(),
  href: z.string(),
});

/* Letters ------------------------------------------------------------------ */

export const letterTypeSchema = z.enum([
  "address_proof",
  "employment_verification",
  "salary_certificate",
  "visa_letter",
  "experience_letter",
]);
export const letterRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  type: letterTypeSchema,
  purpose: z.string(),
  state: z.enum(["pending", "in_progress", "issued", "rejected"]),
  requestedAt: instantSchema,
  issuedAt: instantSchema.nullable(),
});
export const letterInputSchema = z.object({
  type: letterTypeSchema,
  purpose: z.string().trim().min(5, "Tell HR what the letter is for.").max(300),
  addressedTo: z.string().trim().max(120).default(""),
});

/* Permission (short absence) ---------------------------------------------- */

export const permissionInputSchema = z.object({
  date: isoDateSchema,
  from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 14:00."),
  to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 16:00."),
  reason: z.string().trim().min(5, "Add a short reason.").max(300),
});

/* Delegation --------------------------------------------------------------- */

export const delegationSchema = z.object({
  id: z.string(),
  delegate: personRefSchema,
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  workflows: z.array(z.enum(["leave", "regularization", "expense"])),
  reason: z.string(),
  state: z.enum(["scheduled", "active", "ended", "revoked"]),
});
export const delegationInputSchema = z
  .object({
    delegateId: z.string().min(1, "Choose a colleague."),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
    workflows: z.array(z.enum(["leave", "regularization", "expense"])).min(1, "Choose at least one workflow."),
    reason: z.string().trim().min(3, "Add a reason.").max(200),
  })
  .refine((value) => value.endsOn >= value.startsOn, { path: ["endsOn"], message: "End date must be after the start." });

/* Org chart & directory ---------------------------------------------------- */

export const orgNodeSchema = z.object({
  person: personRefSchema,
  managerId: z.string().nullable(),
  department: z.string(),
  location: z.string(),
  code: z.string(),
  directCount: z.number().int(),
  totalCount: z.number().int(),
});

export const directoryCardSchema = z.object({
  person: personRefSchema,
  code: z.string(),
  department: z.string(),
  location: z.string(),
  workEmail: z.string(),
  workPhone: z.string().nullable(),
  manager: personRefSchema.nullable(),
  joinedOn: isoDateSchema,
  starred: z.boolean(),
});

/* Helpdesk thread ---------------------------------------------------------- */

export const ticketMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  fromHr: z.boolean(),
  body: z.string(),
  at: instantSchema,
});

export type RequestModule = z.infer<typeof requestModuleSchema>;
export type TrackedRequest = z.infer<typeof trackedRequestSchema>;
export type LetterType = z.infer<typeof letterTypeSchema>;
export type LetterRequest = z.infer<typeof letterRequestSchema>;
export type Delegation = z.infer<typeof delegationSchema>;
export type OrgNode = z.infer<typeof orgNodeSchema>;
export type DirectoryCard = z.infer<typeof directoryCardSchema>;
export type TicketMessage = z.infer<typeof ticketMessageSchema>;
