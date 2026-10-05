import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { listPayslips, payslipDetail } from "@/lib/mocks/handlers/payroll";
import { payslipDetailSchema, payslipSummarySchema } from "@/types/payroll";

/** Own, published payslips only. */
export const getPayslips = cache(async () =>
  callApi({
    schema: z.array(payslipSummarySchema),
    live: { path: "/me/payslips" },
    mock: async () => listPayslips(await mockActor()),
  }),
);

export const getPayslip = cache(async (id: string) =>
  callApi({
    schema: payslipDetailSchema,
    live: { path: `/me/payslips/${encodeURIComponent(id)}` },
    mock: async () => payslipDetail(await mockActor(), id),
  }),
);
