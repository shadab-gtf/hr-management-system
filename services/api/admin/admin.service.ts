import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { callApi } from "@/lib/api/core/transport";
import { problem } from "@/lib/api/core/problem";
import { mockActor } from "@/lib/api/session/session.service";
import { attendanceMonthCsv, completeExit, employeeCsv, offboardingCases, onboardingCases, setOffboardingTask, setOnboardingTask, workforceReport } from "@/lib/mocks/handlers/admin";
import { decideServiceRequest, listServiceRequests } from "@/lib/mocks/handlers/service-requests";
import { onboardingCaseSchema, workforceReportSchema } from "@/types/admin";
import { offboardingCaseSchema, serviceRequestSchema, type ServiceDecisionInput } from "@/types/hr-config";

export const getOnboarding = cache(async () =>
  callApi({ schema: z.array(onboardingCaseSchema), live: { path: "/lifecycle/onboarding", list: true }, mock: async () => onboardingCases(await mockActor()) }),
);

export async function updateOnboardingTask(employeeId: string, taskId: string, done: boolean) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "PATCH", path: `/lifecycle/onboarding/${encodeURIComponent(employeeId)}/tasks/${encodeURIComponent(taskId)}`, body: { done } },
    mock: async () => setOnboardingTask(await mockActor(), employeeId, taskId, done),
  });
}

export const getOffboarding = cache(async () =>
  callApi({ schema: z.array(offboardingCaseSchema), live: { path: "/lifecycle/offboarding", list: true }, mock: async () => offboardingCases(await mockActor()) }),
);

export async function updateOffboardingTask(employeeId: string, taskId: string, done: boolean) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "PATCH", path: `/lifecycle/offboarding/${encodeURIComponent(employeeId)}/tasks/${encodeURIComponent(taskId)}`, body: { done } },
    mock: async () => setOffboardingTask(await mockActor(), employeeId, taskId, done),
  });
}

export async function closeExit(employeeId: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/lifecycle/offboarding/${encodeURIComponent(employeeId)}/complete`, body: {} },
    mock: async () => completeExit(await mockActor(), employeeId),
  });
}

export const getServiceRequests = cache(async (view: "open" | "closed") =>
  callApi({ schema: z.array(serviceRequestSchema), live: { path: "/service-requests", query: { view }, list: true }, mock: async () => listServiceRequests(await mockActor(), view) }),
);

export async function decideService(input: ServiceDecisionInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: `/service-requests/${input.kind}/${encodeURIComponent(input.requestId)}/decisions`, body: { decision: input.decision, reason: input.note }, idempotencyKey },
    mock: async () => decideServiceRequest(await mockActor(), input),
  });
}

export const getWorkforceReport = cache(async () =>
  callApi({ schema: workforceReportSchema, live: { path: "/reports/workforce" }, mock: async () => workforceReport(await mockActor()) }),
);

/** CSV export. Live mode streams from the report job artifact endpoint. */
export async function exportEmployeesCsv(): Promise<string> {
  if (apiConfig.mode === "mock") return employeeCsv(await mockActor());
  throw problem(501, "EXPORT_VIA_JOB", "Exports run as report jobs on the live service.");
}

export async function exportAttendanceMonth(month: string) {
  if (apiConfig.mode === "mock") return attendanceMonthCsv(await mockActor(), month);
  throw problem(501, "EXPORT_VIA_JOB", "Exports run as report jobs on the live service.");
}
