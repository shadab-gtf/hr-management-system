import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { form16, form16Status, generateForm16 } from "@/lib/mocks/handlers/statutory";
import { form16Schema, form16StatusSchema } from "@/types/statutory";

/** Own Form 16, or (statutory.manage) another employee's. */
export const getForm16 = cache(async (fy: string | undefined, employeeId: string | undefined) =>
  callApi({
    schema: form16Schema,
    live: { path: employeeId ? `/payroll/form-16/${encodeURIComponent(employeeId)}` : "/me/tax/form-16", query: { fy } },
    mock: async () => form16(await mockActor(), fy, employeeId),
  }),
);

export const getForm16Status = cache(async (fy: string | undefined) =>
  callApi({ schema: form16StatusSchema, live: { path: "/payroll/form-16", query: { fy } }, mock: async () => form16Status(await mockActor(), fy) }),
);

export async function runForm16Generation(fy: string) {
  return callApi({
    schema: z.object({ fy: z.string() }),
    live: { method: "POST", path: `/payroll/form-16/${encodeURIComponent(fy)}/generate` },
    mock: async () => generateForm16(await mockActor(), fy),
  });
}
