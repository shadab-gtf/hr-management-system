import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import {
  addPayrollInput,
  bankAdviceCsv,
  holdSalary,
  payrollOverview,
  payrollRegisterCsv,
  payrollRun,
  releaseSalary,
  removePayrollInput,
  runPayrollCommand,
} from "@/lib/mocks/handlers/payroll";
import { moneySchema } from "@/types/common";
import {
  payrollOverviewSchema,
  payrollRunDetailSchema,
  type PayrollCommand,
  type PayrollInputForm,
} from "@/types/payroll";

export const getPayrollOverview = cache(async () =>
  callApi({
    schema: payrollOverviewSchema,
    live: { path: "/payroll/overview" },
    mock: async () => payrollOverview(await mockActor()),
  }),
);

export const getPayrollRun = cache(async (id: string) =>
  callApi({
    schema: payrollRunDetailSchema,
    live: { path: `/payroll/runs/${encodeURIComponent(id)}` },
    mock: async () => payrollRun(await mockActor(), id),
  }),
);

const commandPaths: Record<PayrollCommand, string> = {
  submit: "submit-review",
  approve: "approve",
  reject: "reject",
  publish: "publish",
};

export async function payrollCommand(
  id: string,
  command: PayrollCommand,
  input: { expectedRevision: number; note?: string },
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ state: z.string(), at: z.string() }),
    live: {
      method: "POST",
      path: `/payroll/runs/${encodeURIComponent(id)}/${commandPaths[command]}`,
      ifMatch: input.expectedRevision,
      idempotencyKey,
      body: { note: input.note },
    },
    mock: async () => runPayrollCommand(await mockActor(), id, command, input),
  });
}

/** Payroll register CSV. Live mode generates it as a report job artifact. */
export async function exportPayrollRegister(runId: string) {
  if (apiConfig.mode === "mock") return payrollRegisterCsv(await mockActor(), runId);
  throw problem(501, "EXPORT_VIA_JOB", "Exports run as report jobs on the live service.");
}

/* Payroll inputs, holds and bank advice ----------------------------------- */

export async function addRunInput(runId: string, input: Omit<PayrollInputForm, "runId">, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), net: moneySchema }),
    live: { method: "POST", path: `/payroll/runs/${encodeURIComponent(runId)}/inputs`, body: input, idempotencyKey },
    mock: async () => addPayrollInput(await mockActor(), input, runId, idempotencyKey),
  });
}

export async function deleteRunInput(runId: string, inputId: string) {
  return callApi({
    schema: z.object({ removed: z.string() }),
    live: { method: "POST", path: `/payroll/runs/${encodeURIComponent(runId)}/inputs/${encodeURIComponent(inputId)}/remove` },
    mock: async () => removePayrollInput(await mockActor(), runId, inputId),
  });
}

export async function holdRunSalary(runId: string, employeeId: string, reason: string, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: `/payroll/runs/${encodeURIComponent(runId)}/holds`, body: { employeeId, reason }, idempotencyKey },
    mock: async () => holdSalary(await mockActor(), runId, employeeId, reason),
  });
}

export async function releaseRunSalary(runId: string, holdId: string, note: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: `/payroll/runs/${encodeURIComponent(runId)}/holds/${encodeURIComponent(holdId)}/release`, body: { note } },
    mock: async () => releaseSalary(await mockActor(), runId, holdId, note),
  });
}

/** NEFT bank advice CSV. Live mode generates it as a controlled payment-export job. */
export async function exportBankAdvice(runId: string) {
  if (apiConfig.mode === "mock") return bankAdviceCsv(await mockActor(), runId);
  throw problem(501, "EXPORT_VIA_JOB", "Bank files are produced by the payment export job on the live service.");
}
