import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  channelPreferences,
  confirmPhoneVerification,
  listNotifications,
  markNotificationsRead,
  notificationPreferences,
  removePhone,
  saveChannelPreferences,
  saveNotificationPreferences,
  startPhoneVerification,
} from "@/lib/mocks/handlers/notifications";
import { channelPreferencesSchema } from "@/types/notifications";
import { notificationPreferencesSchema, type NotificationTopic } from "@/types/hr-config";
import { notificationSchema } from "@/types/workplace";

export const getNotifications = cache(async () =>
  callApi({
    schema: z.array(notificationSchema),
    live: { path: "/me/notifications" },
    mock: async () => listNotifications(await mockActor()),
  }),
);

export async function markAllNotificationsRead() {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: "/me/notifications/read-all", body: {} },
    mock: async () => markNotificationsRead(await mockActor()),
  });
}

export const getNotificationPreferences = cache(async () =>
  callApi({ schema: notificationPreferencesSchema, live: { path: "/me/notification-preferences" }, mock: async () => notificationPreferences(await mockActor()) }),
);

export async function updateNotificationPreferences(input: { topics: Record<NotificationTopic, { email: boolean; push: boolean }>; quietHours: { enabled: boolean; from: string; to: string } }) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "PATCH", path: "/me/notification-preferences", body: input },
    mock: async () => saveNotificationPreferences(await mockActor(), input),
  });
}

/* Channel preferences (SMS, WhatsApp, digest) and mobile verification. */

export const getChannelPreferences = cache(async () =>
  callApi({ schema: channelPreferencesSchema, live: { path: "/me/notification-preferences/channels" }, mock: async () => channelPreferences(await mockActor()) }),
);

export async function updateChannelPreferences(input: Parameters<typeof saveChannelPreferences>[1]) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "PATCH", path: "/me/notification-preferences/channels", body: input },
    mock: async () => saveChannelPreferences(await mockActor(), input),
  });
}

export async function requestPhoneCode(number: string) {
  return callApi({
    schema: z.object({ ok: z.boolean(), masked: z.string() }),
    live: { method: "POST", path: "/me/phone/verification", body: { number } },
    mock: async () => startPhoneVerification(await mockActor(), number),
  });
}

export async function verifyPhoneCode(code: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: "/me/phone/verification/confirm", body: { code } },
    mock: async () => confirmPhoneVerification(await mockActor(), code),
  });
}

export async function deletePhone() {
  return callApi({ schema: z.object({ ok: z.boolean() }), live: { method: "POST", path: "/me/phone/delete", body: {} }, mock: async () => removePhone(await mockActor()) });
}
