import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { listAnnouncements, publishAnnouncement, removeAnnouncement, updateAnnouncement } from "@/lib/mocks/handlers/announcements";
import type { AnnouncementInput } from "@/types/admin";
import { announcementSchema } from "@/types/workplace";

/** "admin" adds scheduled and other-audience items for announcement.publish holders. */
export const getAnnouncements = cache(async (view: "feed" | "admin" = "feed") =>
  callApi({
    schema: z.array(announcementSchema),
    live: { path: "/announcements", query: { view }, list: true },
    mock: async () => listAnnouncements(await mockActor(), view),
  }),
);

export async function createAnnouncement(input: AnnouncementInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), scheduled: z.boolean() }),
    live: { method: "POST", path: "/announcements", body: input, idempotencyKey },
    mock: async () => publishAnnouncement(await mockActor(), input, idempotencyKey),
  });
}

export async function editAnnouncement(input: AnnouncementInput & { id: string }) {
  return callApi({
    schema: z.object({ id: z.string(), scheduled: z.boolean() }),
    live: { method: "PATCH", path: `/announcements/${encodeURIComponent(input.id)}`, body: input },
    mock: async () => updateAnnouncement(await mockActor(), input),
  });
}

export async function deleteAnnouncement(id: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/announcements/${encodeURIComponent(id)}/archive`, body: {} },
    mock: async () => removeAnnouncement(await mockActor(), id),
  });
}
