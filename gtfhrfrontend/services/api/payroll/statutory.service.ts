import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  recordChallan,
  savePfSettings,
  savePtSlabs,
  saveStatutoryProfile,
  statutoryEmployees,
  statutoryFile,
  statutoryHub,
  statutorySetup,
  verifyBankAccount,
  type StatutoryFile,
} from "@/lib/mocks/handlers/statutory";
import {
  statutoryEmployeesSchema,
  statutoryHubSchema,
  statutorySetupSchema,
  type ChallanInput,
  type PfSettingsInput,
  type PtSlabsInput,
  type StatutoryProfileInput,
} from "@/types/statutory";

export const getStatutoryHub = cache(async (month: string | undefined) =>
  callApi({
    schema: statutoryHubSchema,
    live: { path: "/payroll/statutory", query: { month } },
    mock: async () => statutoryHub(await mockActor(), month),
  }),
);

export const getStatutorySetup = cache(async () =>
  callApi({ schema: statutorySetupSchema, live: { path: "/payroll/statutory/setup" }, mock: async () => statutorySetup(await mockActor()) }),
);

export const getStatutoryEmployees = cache(async () =>
  callApi({ schema: statutoryEmployeesSchema, live: { path: "/payroll/statutory/employees" }, mock: async () => statutoryEmployees(await mockActor()) }),
);

export async function createChallan(input: ChallanInput) {
  return callApi({
    schema: z.object({ reference: z.string(), status: z.string() }),
    live: { method: "POST", path: "/payroll/statutory/challans", body: input, idempotencyKey: input.idempotencyKey },
    mock: async () => recordChallan(await mockActor(), input),
  });
}

export async function updatePfSettings(input: PfSettingsInput) {
  return callApi({
    schema: z.object({ version: z.number() }),
    live: { method: "PATCH", path: "/payroll/statutory/settings", body: input, ifMatch: input.expectedVersion },
    mock: async () => savePfSettings(await mockActor(), input),
  });
}

export async function updatePtSlabs(input: PtSlabsInput) {
  return callApi({
    schema: z.object({ version: z.number() }),
    live: { method: "PATCH", path: `/payroll/statutory/pt/${input.state}`, body: input, ifMatch: input.expectedVersion },
    mock: async () => savePtSlabs(await mockActor(), input),
  });
}

export async function updateStatutoryProfile(input: StatutoryProfileInput) {
  return callApi({
    schema: z.object({ employeeId: z.string() }),
    live: { method: "PATCH", path: `/payroll/statutory/employees/${encodeURIComponent(input.employeeId)}`, body: input },
    mock: async () => saveStatutoryProfile(await mockActor(), input),
  });
}

export async function decideBankAccount(employeeId: string, decision: "verified" | "failed") {
  return callApi({
    schema: z.object({ status: z.string() }),
    live: { method: "POST", path: `/payroll/statutory/employees/${encodeURIComponent(employeeId)}/bank-verification`, body: { decision } },
    mock: async () => verifyBankAccount(await mockActor(), employeeId, decision),
  });
}

/** Return files (ECR, ESI, PT, LWF, 24Q). Live mode produces them as report jobs. */
export async function exportStatutoryFile(file: StatutoryFile, month: string, entity: string | undefined) {
  if (apiConfig.mode === "mock") return statutoryFile(await mockActor(), file, month, entity);
  return callApi({ schema: z.object({ fileName: z.string(), body: z.string(), contentType: z.string() }), live: { path: `/payroll/statutory/files/${encodeURIComponent(file)}`, query: { month, entity } }, mock: async () => statutoryFile(await mockActor(), file, month, entity) });
}
