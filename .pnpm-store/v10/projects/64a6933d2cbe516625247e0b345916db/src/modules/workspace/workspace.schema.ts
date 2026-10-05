import { z } from "zod";
export const idParams = z.record(z.string(), z.string().trim().min(1).max(100));
export const querySchema = z.record(z.string(), z.string().max(500));
export const emptyBody = z.object({}).default({});
export const privateProfileSchema = z.object({
  personalEmail: z.string().default(""),
  mobile: z.string().default(""),
  emergencyContact: z.string().default(""),
  address: z.string().default(""),
  bankAccountMasked: z.string().default(""),
});
export const profileRequestSchema = z.object({
  field: z.enum(["mobile", "personalEmail", "address", "emergencyContact", "bankAccount"]),
  value: z.string().trim().min(2).max(1000),
  reason: z.string().trim().min(5).max(500),
});
export const textReplySchema = z.object({ body: z.string().trim().min(2).max(2000) });
export const fileUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(["identity", "employment", "payroll", "policy", "other"]),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});
export const fileContentSchema = z.object({
  contentBase64: z
    .string()
    .min(4)
    .max(14 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((value) => value.length % 4 === 0, "Invalid base64 encoding."),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
});
export interface CommandContext {
  requestId: string;
  key: string | undefined;
  version: number | undefined;
}
