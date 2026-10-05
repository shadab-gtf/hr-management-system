import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  acknowledgeAsset,
  acknowledgePolicy,
  addSettlementLine,
  assetInventory,
  assignAsset,
  decideResignation,
  decideSettlement,
  generateLetter,
  issuedLetter,
  letterStudio,
  markSettlementPaid,
  myAssets,
  myPolicies,
  offboardingBoard,
  policyBoard,
  prepareSettlement,
  publishPolicy,
  recalculateSettlement,
  rejectAssetRequest,
  remindPolicy,
  removeSettlementLine,
  requestAsset,
  resignationView,
  returnAsset,
  saveAsset,
  saveExitInterview,
  saveLetterTemplate,
  setAssetStatus,
  setClearance,
  setNoticeWaiver,
  settlementBoard,
  settlementDetail,
  submitResignation,
  submitSettlement,
  withdrawResignation,
} from "@/lib/mocks/handlers/lifecycle";
import {
  assetInventorySchema,
  issuedLetterSchema,
  letterStudioSchema,
  myAssetsSchema,
  myPolicySchema,
  offboardingBoardSchema,
  policyAckSchema,
  resignationViewSchema,
  settlementBoardSchema,
  settlementDetailSchema,
  type AssetAssignInput,
  type AssetInput,
  type AssetRequestInput,
  type AssetReturnInput,
  type AssetStatusInput,
  type ClearanceInput,
  type ExitInterviewInput,
  type LetterTemplateInput,
  type PolicyPublishInput,
  type ResignationDecision,
  type ResignationInput,
  type SettlementDecisionInput,
  type SettlementLineInput,
  type SettlementPaymentInput,
  type SettlementWaiverInput,
} from "@/types/lifecycle";

const ok = z.object({ ok: z.boolean() });
const refResult = z.object({ reference: z.string() });
const id = encodeURIComponent;

/* Resignation -------------------------------------------------------------- */

export const getResignationView = cache(async () =>
  callApi({ schema: resignationViewSchema, live: { path: "/me/resignation" }, mock: async () => resignationView(await mockActor()) }),
);

export async function resign(input: ResignationInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: "/me/resignation", body: input, idempotencyKey },
    mock: async () => submitResignation(await mockActor(), input, idempotencyKey),
  });
}

export async function withdrawMyResignation(resignationId: string, expectedVersion: number) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/resignations/${id(resignationId)}/withdraw`, body: {}, ifMatch: expectedVersion },
    mock: async () => withdrawResignation(await mockActor(), resignationId, expectedVersion),
  });
}

export async function decideOnResignation(input: ResignationDecision) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: `/resignations/${id(input.resignationId)}/decisions`, body: { decision: input.decision, lastWorkingDay: input.lastWorkingDay || undefined, note: input.note }, ifMatch: input.expectedVersion },
    mock: async () => decideResignation(await mockActor(), input),
  });
}

/* Offboarding -------------------------------------------------------------- */

export const getOffboardingBoard = cache(async () =>
  callApi({ schema: offboardingBoardSchema, live: { path: "/lifecycle/offboarding/board" }, mock: async () => offboardingBoard(await mockActor()) }),
);

export async function updateClearance(input: ClearanceInput) {
  return callApi({
    schema: ok,
    live: { method: "PATCH", path: `/lifecycle/offboarding/${id(input.employeeId)}/clearances/${input.department}`, body: { status: input.status, note: input.note } },
    mock: async () => setClearance(await mockActor(), input),
  });
}

export async function recordExitInterview(input: ExitInterviewInput) {
  return callApi({
    schema: ok,
    live: { method: "POST", path: `/lifecycle/offboarding/${id(input.employeeId)}/exit-interview`, body: input },
    mock: async () => saveExitInterview(await mockActor(), input),
  });
}

/* Settlements -------------------------------------------------------------- */

export const getSettlementBoard = cache(async () =>
  callApi({ schema: settlementBoardSchema, live: { path: "/settlements" }, mock: async () => settlementBoard(await mockActor()) }),
);

export const getSettlement = cache(async (settlementId: string) =>
  callApi({ schema: settlementDetailSchema, live: { path: `/settlements/${id(settlementId)}` }, mock: async () => settlementDetail(await mockActor(), settlementId) }),
);

export async function createSettlement(employeeId: string, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), reference: z.string() }),
    live: { method: "POST", path: "/settlements", body: { employeeId }, idempotencyKey },
    mock: async () => prepareSettlement(await mockActor(), employeeId, idempotencyKey),
  });
}

export async function recalculate(settlementId: string, expectedVersion: number) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(settlementId)}/recalculate`, body: {}, ifMatch: expectedVersion },
    mock: async () => recalculateSettlement(await mockActor(), settlementId, expectedVersion),
  });
}

export async function addLine(input: SettlementLineInput) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(input.settlementId)}/lines`, body: { kind: input.kind, label: input.label, amount: { amount: input.amount, currency: "INR" }, reason: input.reason }, ifMatch: input.expectedVersion },
    mock: async () => addSettlementLine(await mockActor(), input),
  });
}

export async function removeLine(settlementId: string, lineId: string) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(settlementId)}/lines/${id(lineId)}/remove`, body: {} },
    mock: async () => removeSettlementLine(await mockActor(), settlementId, lineId),
  });
}

export async function updateWaiver(input: SettlementWaiverInput) {
  return callApi({
    schema: refResult,
    live: { method: "PATCH", path: `/settlements/${id(input.settlementId)}/notice-waiver`, body: { waive: input.waive, reason: input.reason }, ifMatch: input.expectedVersion },
    mock: async () => setNoticeWaiver(await mockActor(), input),
  });
}

export async function submitForApproval(settlementId: string, expectedVersion: number) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(settlementId)}/submit`, body: {}, ifMatch: expectedVersion },
    mock: async () => submitSettlement(await mockActor(), settlementId, expectedVersion),
  });
}

export async function decideOnSettlement(input: SettlementDecisionInput) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(input.settlementId)}/decisions`, body: { decision: input.decision, reason: input.note }, ifMatch: input.expectedVersion },
    mock: async () => decideSettlement(await mockActor(), input),
  });
}

export async function recordPayment(input: SettlementPaymentInput) {
  return callApi({
    schema: refResult,
    live: { method: "POST", path: `/settlements/${id(input.settlementId)}/payment`, body: { utr: input.utr, paidOn: input.paidOn }, ifMatch: input.expectedVersion },
    mock: async () => markSettlementPaid(await mockActor(), input),
  });
}

/* Assets ------------------------------------------------------------------- */

export const getAssetInventory = cache(async () =>
  callApi({ schema: assetInventorySchema, live: { path: "/assets" }, mock: async () => assetInventory(await mockActor()) }),
);
export const getMyAssets = cache(async () =>
  callApi({ schema: myAssetsSchema, live: { path: "/me/assets" }, mock: async () => myAssets(await mockActor()) }),
);

export async function writeAsset(input: AssetInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), tag: z.string() }),
    live: input.id ? { method: "PATCH", path: `/assets/${id(input.id)}`, body: input } : { method: "POST", path: "/assets", body: input, idempotencyKey },
    mock: async () => saveAsset(await mockActor(), input, idempotencyKey),
  });
}
export async function assign(input: AssetAssignInput) {
  return callApi({
    schema: z.object({ tag: z.string(), employee: z.string() }),
    live: { method: "POST", path: `/assets/${id(input.assetId)}/assignments`, body: { employeeId: input.employeeId, requestId: input.requestId || undefined, note: input.note } },
    mock: async () => assignAsset(await mockActor(), input),
  });
}
export async function checkIn(input: AssetReturnInput) {
  return callApi({
    schema: z.object({ tag: z.string(), status: z.string() }),
    live: { method: "POST", path: `/assets/${id(input.assetId)}/return`, body: { condition: input.condition, note: input.note }, ifMatch: input.expectedVersion },
    mock: async () => returnAsset(await mockActor(), input),
  });
}
export async function changeAssetStatus(input: AssetStatusInput) {
  return callApi({
    schema: z.object({ tag: z.string(), status: z.string() }),
    live: { method: "PATCH", path: `/assets/${id(input.assetId)}/status`, body: { status: input.status, note: input.note } },
    mock: async () => setAssetStatus(await mockActor(), input),
  });
}
export async function acknowledgeMyAsset(assetId: string) {
  return callApi({
    schema: z.object({ tag: z.string() }),
    live: { method: "POST", path: `/me/assets/${id(assetId)}/acknowledge`, body: {} },
    mock: async () => acknowledgeAsset(await mockActor(), assetId),
  });
}
export async function raiseAssetRequest(input: AssetRequestInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string() }),
    live: { method: "POST", path: "/me/asset-requests", body: input, idempotencyKey },
    mock: async () => requestAsset(await mockActor(), input, idempotencyKey),
  });
}
export async function declineAssetRequest(requestId: string, note: string) {
  return callApi({
    schema: z.object({ reference: z.string() }),
    live: { method: "POST", path: `/asset-requests/${id(requestId)}/decisions`, body: { decision: "reject", reason: note } },
    mock: async () => rejectAssetRequest(await mockActor(), requestId, note),
  });
}

/* Letters ------------------------------------------------------------------ */

export const getLetterStudio = cache(async (templateId?: string, employeeId?: string, purpose?: string, addressedTo?: string) =>
  callApi({
    schema: letterStudioSchema,
    live: { path: "/letter-templates/studio", query: { templateId, employeeId, purpose, addressedTo } },
    mock: async () => letterStudio(await mockActor(), { templateId, employeeId, purpose, addressedTo }),
  }),
);

export const getIssuedLetter = cache(async (letterId: string) =>
  callApi({ schema: issuedLetterSchema, live: { path: `/letters/${id(letterId)}` }, mock: async () => issuedLetter(await mockActor(), letterId) }),
);

export async function writeLetterTemplate(input: LetterTemplateInput) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: input.id ? { method: "PATCH", path: `/letter-templates/${id(input.id)}`, body: input } : { method: "POST", path: "/letter-templates", body: input },
    mock: async () => saveLetterTemplate(await mockActor(), input),
  });
}

export async function issueLetter(input: { templateId: string; employeeId: string; purpose: string; addressedTo: string }, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), reference: z.string() }),
    live: { method: "POST", path: "/letters", body: input, idempotencyKey },
    mock: async () => generateLetter(await mockActor(), input, idempotencyKey),
  });
}

/* Policies ----------------------------------------------------------------- */

export const getPolicyBoard = cache(async () =>
  callApi({ schema: z.array(policyAckSchema), live: { path: "/policies", list: true }, mock: async () => policyBoard(await mockActor()) }),
);
export const getMyPolicies = cache(async () =>
  callApi({ schema: z.array(myPolicySchema), live: { path: "/me/policies", list: true }, mock: async () => myPolicies(await mockActor()) }),
);

export async function publishPolicyVersion(input: PolicyPublishInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), audience: z.number().int() }),
    live: { method: "POST", path: "/policies", body: input, idempotencyKey },
    mock: async () => publishPolicy(await mockActor(), input, idempotencyKey),
  });
}
export async function sendPolicyReminder(policyId: string) {
  return callApi({
    schema: z.object({ count: z.number().int() }),
    live: { method: "POST", path: `/policies/${id(policyId)}/reminders`, body: {} },
    mock: async () => remindPolicy(await mockActor(), policyId),
  });
}
export async function acknowledgeMyPolicy(policyId: string) {
  return callApi({
    schema: z.object({ title: z.string(), version: z.string() }),
    live: { method: "POST", path: `/me/policies/${id(policyId)}/acknowledgements`, body: {} },
    mock: async () => acknowledgePolicy(await mockActor(), policyId),
  });
}
