import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { createDelegation, listDelegations, listLetters, requestLetter, requestPermission, revokeDelegation, trackedRequests, } from "@/lib/mocks/handlers/requests";
import { delegationSchema, letterRequestSchema, trackedRequestSchema, type LetterType } from "@/types/requests";
/** Request hub: every request the signed-in user raised, across modules. */
export const getTrackedRequests = cache(async () => callApi({ schema: z.array(trackedRequestSchema), live: { path: "/me/requests", list: true }, mock: async () => trackedRequests(await mockActor()) }));
export const getLetters = cache(async () => callApi({ schema: z.array(letterRequestSchema), live: { path: "/me/letters", list: true }, mock: async () => listLetters(await mockActor()) }));
export async function submitLetter(input: {
    type: LetterType;
    purpose: string;
    addressedTo: string;
}, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string() }),
        live: { method: "POST", path: "/me/letters", body: input, idempotencyKey },
        mock: async () => requestLetter(await mockActor(), input, idempotencyKey),
    });
}
export async function submitPermission(input: {
    date: string;
    from: string;
    to: string;
    reason: string;
}, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string(), minutes: z.number() }),
        live: { method: "POST", path: "/attendance/permissions", body: input, idempotencyKey },
        mock: async () => requestPermission(await mockActor(), input, idempotencyKey),
    });
}
export const getDelegations = cache(async () => callApi({
    schema: z.object({ given: z.array(delegationSchema), received: z.array(delegationSchema) }),
    live: { path: "/me/delegations" },
    mock: async () => listDelegations(await mockActor()),
}));
export async function addDelegation(input: {
    delegateId: string;
    startsOn: string;
    endsOn: string;
    workflows: ("leave" | "regularization" | "expense")[];
    reason: string;
}, idempotencyKey: string) {
    return callApi({
        schema: z.object({ ok: z.boolean() }),
        live: { method: "POST", path: "/me/delegations", body: input, idempotencyKey },
        mock: async () => createDelegation(await mockActor(), input, idempotencyKey),
    });
}
export async function endDelegation(id: string) {
    return callApi({
        schema: z.object({ ok: z.boolean() }),
        live: { method: "POST", path: `/me/delegations/${encodeURIComponent(id)}/revoke`, body: {} },
        mock: async () => revokeDelegation(await mockActor(), id),
    });
}
