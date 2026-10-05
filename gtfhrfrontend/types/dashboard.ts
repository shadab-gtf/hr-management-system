import { z } from "zod";
import { payrollRunStateSchema } from "@/types/payroll";
import { companyEventSchema } from "@/types/hr-config";
import { celebrationSchema, taskSchema } from "@/types/workplace";

/** Role-scoped home insights. Sections are absent (null) outside the actor's scope. */
export const homeInsightsSchema = z.object({
  tasks: z.array(taskSchema),
  celebrations: z.array(celebrationSchema),
  events: z.array(companyEventSchema),
  team: z
    .object({
      size: z.number().int(),
      checkedIn: z.number().int(),
      onLeave: z.number().int(),
      pendingApprovals: z.number().int(),
    })
    .nullable(),
  workforce: z
    .object({
      headcount: z.number().int(),
      joinersThisMonth: z.number().int(),
      onNotice: z.number().int(),
      openTickets: z.number().int(),
      byDepartment: z.array(z.object({ name: z.string(), count: z.number().int() })),
    })
    .nullable(),
  payroll: z
    .object({
      runId: z.string(),
      periodLabel: z.string(),
      state: payrollRunStateSchema,
      employeeCount: z.number().int(),
    })
    .nullable(),
});

export type HomeInsights = z.infer<typeof homeInsightsSchema>;
