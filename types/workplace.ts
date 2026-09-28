import { z } from "zod";
import {
  instantSchema,
  isoDateSchema,
  moneySchema,
  personRefSchema,
} from "@/types/common";

/* Documents ---------------------------------------------------------------- */

export const scanStateSchema = z.enum(["scanning", "clean", "rejected"]);
export const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["identity", "employment", "payroll", "policy", "other"]),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeBytes: z.number().int(),
  uploadedAt: instantSchema,
  uploadedBy: z.string(),
  scanState: scanStateSchema,
});

/* Helpdesk ----------------------------------------------------------------- */

export const ticketCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  confidential: z.boolean(),
  description: z.string(),
});
export const ticketStateSchema = z.enum([
  "open",
  "in_progress",
  "awaiting_you",
  "resolved",
  "closed",
]);
export const ticketSchema = z.object({
  id: z.string(),
  reference: z.string(),
  subject: z.string(),
  category: z.string(),
  confidential: z.boolean(),
  state: ticketStateSchema,
  priority: z.enum(["low", "normal", "high"]),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  assignee: z.string().nullable(),
  lastMessage: z.string(),
});
export const ticketInputSchema = z.object({
  categoryId: z.string().min(1, "Choose a category."),
  subject: z
    .string()
    .trim()
    .min(5, "Subject needs at least 5 characters.")
    .max(120, "Keep the subject under 120 characters."),
  description: z
    .string()
    .trim()
    .min(10, "Describe the request in at least 10 characters.")
    .max(2000),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

/* Expenses ----------------------------------------------------------------- */

export const expenseStateSchema = z.enum([
  "draft",
  "submitted",
  "manager_approved",
  "finance_approved",
  "rejected",
  "reimbursed",
]);
export const expenseCategorySchema = z.enum([
  "travel",
  "meals",
  "client_meeting",
  "internet",
  "equipment",
  "other",
]);
export const expenseClaimSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  category: expenseCategorySchema,
  amount: moneySchema,
  incurredOn: isoDateSchema,
  merchant: z.string(),
  state: expenseStateSchema,
  submittedAt: instantSchema.nullable(),
  receipts: z.number().int(),
  settlementReference: z.string().nullable(),
});
export const expenseInputSchema = z.object({
  title: z.string().trim().min(3, "Add a title.").max(120),
  category: expenseCategorySchema,
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50."),
  incurredOn: isoDateSchema,
  merchant: z.string().trim().min(2, "Add the merchant or vendor.").max(120),
});

/* Announcements & notifications ------------------------------------------- */

export const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: z.enum(["policy", "event", "celebration", "it", "general"]),
  publishedAt: instantSchema,
  author: z.string(),
  pinned: z.boolean(),
});

export const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  createdAt: instantSchema,
  read: z.boolean(),
  kind: z.enum(["approval", "leave", "payroll", "helpdesk", "system"]),
});

/* Dashboard ---------------------------------------------------------------- */

export const celebrationSchema = z.object({
  person: personRefSchema,
  kind: z.enum(["birthday", "work_anniversary", "new_joiner"]),
  date: isoDateSchema,
  detail: z.string(),
});

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
  due: isoDateSchema.nullable(),
  tone: z.enum(["neutral", "warning", "danger", "info"]),
});

export type ScanState = z.infer<typeof scanStateSchema>;
export type HrDocument = z.infer<typeof documentSchema>;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;
export type TicketState = z.infer<typeof ticketStateSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketInput = z.infer<typeof ticketInputSchema>;
export type ExpenseState = z.infer<typeof expenseStateSchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type ExpenseClaim = z.infer<typeof expenseClaimSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type AppNotification = z.infer<typeof notificationSchema>;
export type Celebration = z.infer<typeof celebrationSchema>;
export type HomeTask = z.infer<typeof taskSchema>;
