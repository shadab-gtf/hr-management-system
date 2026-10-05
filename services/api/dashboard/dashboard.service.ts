import "server-only";
import { cache } from "react";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { homeInsights, whoIsOut } from "@/lib/mocks/handlers/dashboard";
import { whoIsOutSchema } from "@/types/home-widgets";
import { homeInsightsSchema } from "@/types/dashboard";

/** Role-scoped home insights (tasks, celebrations, team/HR/payroll summaries). */
export const getHomeInsights = cache(async () =>
  callApi({
    schema: homeInsightsSchema,
    live: { path: "/me/home" },
    mock: async () => homeInsights(await mockActor()),
  }),
);

/** Approved leave today and this week, scoped to team / department / organization. */
export const getWhoIsOut = cache(async () =>
  callApi({ schema: whoIsOutSchema, live: { path: "/me/home/who-is-out" }, mock: async () => whoIsOut(await mockActor()) }),
);
