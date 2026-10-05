"use server";

import { apiConfig } from "@/lib/api/core/config";
import { getNotifications } from "@/lib/api/notifications/notifications.service";
import type { AppNotification } from "@/types/workplace";

/** Authenticated server-side proxy. Browser callers never receive bearer tokens. */
export async function notificationSnapshotAction(): Promise<Pick<AppNotification, "id" | "title" | "createdAt" | "read">[] | null> {
  if (apiConfig.mode !== "live") return null;
  const notifications = await getNotifications();
  return notifications.slice(0, 100).map(({ id, title, createdAt, read }) => ({ id, title, createdAt, read }));
}
