import { z } from "zod";
import { notificationTopicSchema } from "../../contracts/hr-config.js";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const preferencesInput = z.object({
  topics: z.record(notificationTopicSchema, z.object({ email: z.boolean(), push: z.boolean() })),
  quietHours: z.object({ enabled: z.boolean(), from: time, to: time }),
});
export const channelsInput = z.object({
  topics: z.record(
    notificationTopicSchema,
    z.object({ email: z.boolean(), push: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() }),
  ),
  quietHours: z.object({ enabled: z.boolean(), from: time, to: time }),
  digest: z.object({ mode: z.enum(["instant", "daily"]), time }),
});
export const storedPhoneSchema = z.object({
  number: z.string(),
  verified: z.boolean(),
  verifiedAt: z.string().nullable(),
  hash: z.string().nullable(),
  expiresAt: z.string().nullable(),
  attempts: z.number(),
  sentAt: z.string(),
});
