import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  createEmployee,
  employeeDetail,
  employeeFacets,
  hrFormOptions,
  listEmployees,
  requestProfileChange,
  startExit,
  updateEmployeeJob,
} from "@/lib/mocks/handlers/employees";
import { hrFormOptionsSchema, type EmployeeCreateInput, type EmployeeExitInput, type EmployeeJobInput } from "@/types/hr-config";
import {
  employeeDetailSchema,
  employeeFacetsSchema,
  employeeListSchema,
  type EmployeeFilters,
  type ProfileChangeField,
} from "@/types/employee";

export async function getEmployees(filters: EmployeeFilters) {
  return callApi({
    schema: employeeListSchema,
    live: { path: "/employees", query: { ...filters }, list: true },
    mock: async () => listEmployees(await mockActor(), filters),
  });
}

export const getEmployeeFacets = cache(async () =>
  callApi({
    schema: employeeFacetsSchema,
    live: { path: "/employees/facets" },
    mock: async () => employeeFacets(await mockActor()),
  }),
);

export const getEmployee = cache(async (id: string) =>
  callApi({
    schema: employeeDetailSchema,
    live: { path: `/employees/${encodeURIComponent(id)}` },
    mock: async () => employeeDetail(await mockActor(), id),
  }),
);

export async function submitProfileChange(
  input: { field: ProfileChangeField; value: string; reason: string },
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string(), verification: z.string() }),
    live: { method: "POST", path: "/me/profile/change-requests", body: input, idempotencyKey },
    mock: async () => requestProfileChange(await mockActor(), input, idempotencyKey),
  });
}

/* HR lifecycle (employee.create / employee.update) */

export const getHrFormOptions = cache(async () =>
  callApi({ schema: hrFormOptionsSchema, live: { path: "/employees/form-options" }, mock: async () => hrFormOptions(await mockActor()) }),
);

export async function addEmployee(input: EmployeeCreateInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({
      id: z.string(),
      code: z.string(),
      workEmail: z.string().email(),
      inviteDelivery: z.enum(["queued", "sent", "failed", "not_configured", "unavailable", "demo"]),
    }),
    live: { method: "POST", path: "/employees", body: input, idempotencyKey },
    mock: async () => ({
      ...(await createEmployee(await mockActor(), input, idempotencyKey)),
      workEmail: input.workEmail,
      inviteDelivery: "demo" as const,
    }),
  });
}

export async function changeEmployment(input: EmployeeJobInput) {
  const { expectedVersion, employeeId, ...body } = input;
  return callApi({
    schema: z.object({ id: z.string(), version: z.number().int() }),
    live: { method: "POST", path: `/employees/${encodeURIComponent(employeeId)}/assignments`, body, ifMatch: expectedVersion },
    mock: async () => updateEmployeeJob(await mockActor(), input),
  });
}

export async function beginExit(input: EmployeeExitInput) {
  const { employeeId, ...body } = input;
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: `/employees/${encodeURIComponent(employeeId)}/exit`, body },
    mock: async () => startExit(await mockActor(), input),
  });
}
