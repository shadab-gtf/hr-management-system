import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { decideStructureChange, proposeAssignment, proposeTemplateChange, salaryStructures } from "@/lib/mocks/handlers/salary-structures";
import { structuresSchema, type AssignmentProposal, type StructureProposal } from "@/types/statutory";

type CalcQuery = { ctc?: string; template?: string; state?: string; regime?: string };

export const getSalaryStructures = cache(async (ctc?: string, template?: string, state?: string, regime?: string) => {
  const query: CalcQuery = { ctc, template, state, regime };
  return callApi({
    schema: structuresSchema,
    live: { path: "/payroll/structures", query },
    mock: async () => salaryStructures(await mockActor(), query),
  });
});

export async function submitTemplateChange(input: StructureProposal) {
  return callApi({
    schema: z.object({ reference: z.string() }),
    live: { method: "POST", path: `/payroll/structures/${encodeURIComponent(input.templateId)}/changes`, body: input, idempotencyKey: input.idempotencyKey },
    mock: async () => proposeTemplateChange(await mockActor(), input),
  });
}

export async function submitAssignmentChange(input: AssignmentProposal) {
  return callApi({
    schema: z.object({ reference: z.string() }),
    live: { method: "POST", path: "/payroll/structures/assignments/changes", body: input, idempotencyKey: input.idempotencyKey },
    mock: async () => proposeAssignment(await mockActor(), input),
  });
}

export async function decideStructure(id: string, decision: "approve" | "reject" | "withdraw", note: string) {
  return callApi({
    schema: z.object({ state: z.string() }),
    live: { method: "POST", path: `/payroll/structures/changes/${encodeURIComponent(id)}/${decision}`, body: { note } },
    mock: async () => decideStructureChange(await mockActor(), id, decision, note),
  });
}
