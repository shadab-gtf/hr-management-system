"use server";

import { apiConfig } from "@/lib/api/core/config";
import { ApiProblem } from "@/lib/api/core/problem";
import { getNotifications } from "@/lib/api/notifications/notifications.service";
import { getRealtimeTicket } from "@/lib/api/realtime/realtime.service";
import type { AppNotification } from "@/types/workplace";

/** Authenticated server-side proxy. Browser callers never receive bearer tokens. */
export async function notificationSnapshotAction(): Promise<
  Pick<AppNotification, "id" | "title" | "createdAt" | "read">[] | null
> {
  if (apiConfig.mode !== "live") return null;
  const notifications = await getNotifications();
  return notifications
    .slice(0, 100)
    .map(({ id, title, createdAt, read }) => ({ id, title, createdAt, read }));
}

export type RealtimeTicketResult =
  | { status: "ok"; ticket: string; url: string; expiresAt: string }
  /** The session is gone (signed out, disabled, expired): the page should re-check the session. */
  | { status: "unauthorized" }
  /** Mock mode, rate limited or the API is unreachable: fall back to polling and retry later. */
  | { status: "unavailable" };

/** Exchanges the httpOnly session for a single-use WebSocket ticket; the access token never leaves the server. */
export async function realtimeTicketAction(): Promise<RealtimeTicketResult> {
  if (apiConfig.mode !== "live") return { status: "unavailable" };
  try {
    const { ticket, url, expiresAt } = await getRealtimeTicket();
    return { status: "ok", ticket, url, expiresAt };
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 401)
      return { status: "unauthorized" };
    return { status: "unavailable" };
  }
}
