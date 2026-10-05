import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { directoryCard, orgChart, starredIds, toggleStar } from "@/lib/mocks/handlers/people";
import { directoryCardSchema, orgNodeSchema } from "@/types/requests";

export const getOrgChart = cache(async () =>
  callApi({ schema: z.array(orgNodeSchema), live: { path: "/org/chart" }, mock: async () => orgChart(await mockActor()) }),
);

export const getDirectoryCard = cache(async (id: string) =>
  callApi({
    schema: directoryCardSchema,
    live: { path: `/directory/${encodeURIComponent(id)}` },
    mock: async () => directoryCard(await mockActor(), id),
  }),
);

export const getStarred = cache(async () =>
  callApi({ schema: z.array(z.string()), live: { path: "/me/starred" }, mock: async () => starredIds(await mockActor()) }),
);

export async function star(id: string) {
  return callApi({
    schema: z.object({ starred: z.boolean() }),
    live: { method: "POST", path: `/me/starred/${encodeURIComponent(id)}/toggle`, body: {} },
    mock: async () => toggleStar(await mockActor(), id),
  });
}
