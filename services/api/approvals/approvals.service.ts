import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { decideApproval, listApprovals } from "@/lib/mocks/handlers/approvals";
import { workQueue } from "@/lib/mocks/handlers/work-queue";
import { approvalItemSchema, workQueueItemSchema, type ApprovalDecisionInput } from "@/types/approval";

export const getApprovals = cache(async (state: "pending" | "decided") =>
  callApi({
    schema: z.array(approvalItemSchema),
    live: { path: "/approvals", query: { state } },
    mock: async () => listApprovals(await mockActor(), state),
  }),
);

/** Pending decisions that live on module pages (comp-off, timesheets, exits…). */
export const getWorkQueue = cache(async () =>
  callApi({
    schema: z.array(workQueueItemSchema),
    live: { path: "/me/work-queue" },
    mock: async () => workQueue(await mockActor()),
  }),
);

export async function decide(input: ApprovalDecisionInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string(), at: z.string() }),
    live: {
      method: "POST",
      path: `/approvals/${encodeURIComponent(input.approvalId)}/decisions`,
      ifMatch: input.expectedVersion,
      idempotencyKey,
      body: { decision: input.decision, reason: input.note },
    },
    mock: async () => decideApproval(await mockActor(), input),
  });
}
