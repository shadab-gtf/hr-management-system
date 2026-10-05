import { z } from "zod";
import { roleSchema } from "../../contracts/session.js";
export const roleInput = z.object({
  role: roleSchema,
  reason: z.string().trim().min(5).max(500),
  expiresOn: z.iso.date().nullish(),
});
export const disableInput = z.object({ reason: z.string().trim().min(5).max(500) });
export const recoveryInput = z.object({ email: z.email().toLowerCase().max(254) });
export const passwordSetupInput = z.object({
  ref: z.string().min(1).max(40),
  tokenHash: z.string().min(32).max(200),
  type: z.enum(["invite", "recovery"]),
  password: z.string().min(15).max(128),
});
export const totpInput = z.object({ factorId: z.uuid().optional(), code: z.string().regex(/^\d{6}$/) });
