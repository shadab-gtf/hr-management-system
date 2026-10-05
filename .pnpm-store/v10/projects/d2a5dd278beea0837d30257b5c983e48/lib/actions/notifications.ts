"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  deletePhone,
  markAllNotificationsRead,
  markNotificationRead,
  requestPhoneCode,
  updateChannelPreferences,
  verifyPhoneCode,
} from "@/lib/api/notifications/notifications.service";
import { failure, formObject, success, validationError } from "@/lib/actions/result";
import { indianMobileSchema, otpSchema } from "@/types/notifications";
import { notificationTopicSchema, type NotificationTopic } from "@/types/hr-config";
import type { ActionResult } from "@/types/action";

export async function markNotificationsReadAction(): Promise<void> {
  await markAllNotificationsRead();
  refresh();
}

/** Marks one notification read (the toast "view" path and inbox rows). */
export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const parsed = z.string().min(1).max(64).safeParse(id);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await markNotificationRead(parsed.data);
    refresh();
    return success("Marked as read");
  } catch (error) {
    return failure(error);
  }
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time.");
const settingsSchema = z.object({
  quietHours: z.object({ enabled: z.boolean(), from: time, to: time }),
  digest: z.object({ mode: z.enum(["instant", "daily"]), time }),
});

/** All channels per topic (email, push, SMS, WhatsApp) plus quiet hours and digest. */
export async function saveChannelPreferencesAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const topics = Object.fromEntries(
    notificationTopicSchema.options.map((topic) => [
      topic,
      { email: fields[`email.${topic}`] === "on", push: fields[`push.${topic}`] === "on", sms: fields[`sms.${topic}`] === "on", whatsapp: fields[`whatsapp.${topic}`] === "on" },
    ]),
  ) as Record<NotificationTopic, { email: boolean; push: boolean; sms: boolean; whatsapp: boolean }>;
  const parsed = settingsSchema.safeParse({
    quietHours: { enabled: fields.quietEnabled === "on", from: fields.quietFrom, to: fields.quietTo },
    digest: { mode: fields.digest === "daily" ? "daily" : "instant", time: fields.digestTime || "18:00" },
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateChannelPreferences({ topics, ...parsed.data });
    refresh();
    return success("Notification preferences saved");
  } catch (error) {
    return failure(error);
  }
}

export async function requestPhoneCodeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ phone: indianMobileSchema }).safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await requestPhoneCode(parsed.data.phone);
    refresh();
    return success(`Code sent to ${result.masked}`);
  } catch (error) {
    return failure(error);
  }
}

export async function verifyPhoneCodeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ code: otpSchema }).safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await verifyPhoneCode(parsed.data.code);
    refresh();
    return success("Mobile number verified");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function removePhoneAction(): Promise<ActionResult> {
  try {
    await deletePhone();
    refresh();
    return success("Mobile number removed; SMS and WhatsApp are off");
  } catch (error) {
    return failure(error);
  }
}
