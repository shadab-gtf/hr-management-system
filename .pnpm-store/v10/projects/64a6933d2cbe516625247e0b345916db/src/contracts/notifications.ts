import { z } from "zod";
import { instantSchema } from "./common.js";
import { notificationTopicSchema } from "./hr-config.js";

/*
 * Channel extensions to the notification preferences in types/hr-config.ts:
 * SMS and WhatsApp per topic, a verified mobile number, and a digest option.
 * In-app is always on. Delivery is not connected in the mock backend.
 */

export const channelSchema = z.enum(["email", "push", "sms", "whatsapp"]);

export const channelPreferencesSchema = z.object({
  topics: z.array(
    z.object({
      topic: notificationTopicSchema,
      email: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
      whatsapp: z.boolean(),
    }),
  ),
  quietHours: z.object({ enabled: z.boolean(), from: z.string(), to: z.string() }),
  digest: z.object({ mode: z.enum(["instant", "daily"]), time: z.string() }),
  phone: z.object({
    /** Masked for display, e.g. +91 98XXXXX210. */
    masked: z.string().nullable(),
    verified: z.boolean(),
    verifiedAt: instantSchema.nullable(),
    pending: z.object({ masked: z.string(), expiresAt: instantSchema, attemptsLeft: z.number().int() }).nullable(),
    /** Mock only: the code a real SMS gateway would send. Never present in live mode. */
    devCode: z.string().nullable(),
  }),
  /** Mock: email, push, SMS and WhatsApp gateways are not connected. */
  deliveryAvailable: z.boolean(),
});

export const indianMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^(\+91|0091|0)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number starting with 6–9."));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

export type Channel = z.infer<typeof channelSchema>;
export type ChannelPreferences = z.infer<typeof channelPreferencesSchema>;
