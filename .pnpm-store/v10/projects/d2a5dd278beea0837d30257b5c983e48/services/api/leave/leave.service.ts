import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { allHolidays, cancelLeave, leaveCalendar, leaveOverview, submitLeave } from "@/lib/mocks/handlers/leave";
import { adjustBalance, cancelCompOff, cancelEncashment, claimCompOff, commitYearEnd, compOffPage, decideCompOff, decideEncashment, leaveLedgerFor, ledgerPeople, requestEncashment, yearEnd, } from "@/lib/mocks/handlers/leave-ledger";
import { personRefSchema } from "@/types/common";
import { compOffPageSchema, holidaySchema, leaveCalendarSchema, leaveLedgerSchema, leaveOverviewSchema, yearEndSchema, type BalanceAdjustmentInput, type CompOffClaimInput, type DecisionInput, type EncashInput, type LeaveRequestInput, } from "@/types/leave";
const refResult = z.object({ reference: z.string(), state: z.string() }).loose();
export const getLeaveOverview = cache(async () => callApi({
    schema: leaveOverviewSchema,
    live: { path: "/leave/overview" },
    mock: async () => leaveOverview(await mockActor()),
}));
export async function submitLeaveRequest(input: LeaveRequestInput & {
    attachmentName?: string | null;
}, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string(), units: z.string(), state: z.string() }),
        live: {
            method: "POST",
            path: "/leave/requests",
            idempotencyKey,
            body: {
                leaveTypeId: input.leaveTypeId,
                startDate: input.startDate,
                endDate: input.endDate,
                portion: input.portion,
                reason: input.reason,
                attachmentName: input.attachmentName ?? null,
            },
        },
        mock: async () => submitLeave(await mockActor(), input, idempotencyKey),
    });
}
export async function cancelLeaveRequest(id: string, expectedVersion: number) {
    return callApi({
        schema: z.object({ reference: z.string(), state: z.string() }),
        live: {
            method: "POST",
            path: `/leave/requests/${encodeURIComponent(id)}/cancel`,
            ifMatch: expectedVersion,
            body: {},
        },
        mock: async () => cancelLeave(await mockActor(), id, expectedVersion),
    });
}
export const getLeaveCalendar = cache(async (month: string) => callApi({
    schema: leaveCalendarSchema,
    live: { path: "/leave/calendar", query: { month } },
    mock: async () => leaveCalendar(await mockActor(), month),
}));
/** Full-year holiday list for the employee's calendar. */
export const getHolidays = cache(async () => callApi({
    schema: z.array(holidaySchema),
    live: { path: "/calendar/holidays" },
    mock: async () => allHolidays(await mockActor()),
}));
/* Ledger ------------------------------------------------------------------- */
/** Own ledger (no id) or, for HR, an employee's ledger. */
export const getLeaveLedger = cache(async (employeeId?: string, year?: string) => callApi({
    schema: leaveLedgerSchema,
    live: { path: employeeId ? `/leave/ledger/${encodeURIComponent(employeeId)}` : "/leave/ledger", query: { year } },
    mock: async () => leaveLedgerFor(await mockActor(), employeeId, year),
}));
export const getLedgerPeople = cache(async () => callApi({ schema: z.array(personRefSchema), live: { path: "/leave/admin/people" }, mock: async () => ledgerPeople() }));
export async function adjustLeaveBalance(input: BalanceAdjustmentInput, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string(), balance: z.string() }),
        live: { method: "POST", path: "/leave/admin/adjustments", body: input, idempotencyKey },
        mock: async () => adjustBalance(await mockActor(), input, idempotencyKey),
    });
}
/* Comp-off & encashment ---------------------------------------------------- */
export const getCompOffPage = cache(async () => callApi({ schema: compOffPageSchema, live: { path: "/leave/comp-off" }, mock: async () => compOffPage(await mockActor()) }));
export async function submitCompOffClaim(input: CompOffClaimInput, idempotencyKey: string) {
    return callApi({
        schema: refResult,
        live: { method: "POST", path: "/leave/comp-off/claims", body: input, idempotencyKey },
        mock: async () => claimCompOff(await mockActor(), input, idempotencyKey),
    });
}
export async function decideCompOffClaim(input: DecisionInput) {
    return callApi({
        schema: refResult,
        live: { method: "POST", path: `/leave/comp-off/claims/${encodeURIComponent(input.id)}/decision`, ifMatch: input.version, body: { decision: input.decision, note: input.note } },
        mock: async () => decideCompOff(await mockActor(), input),
    });
}
export async function cancelCompOffClaim(id: string) {
    return callApi({
        schema: refResult,
        live: { method: "POST", path: `/leave/comp-off/claims/${encodeURIComponent(id)}/cancel`, body: {} },
        mock: async () => cancelCompOff(await mockActor(), id),
    });
}
export async function submitEncashment(input: EncashInput, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string(), amount: z.string() }),
        live: { method: "POST", path: "/leave/encashments", body: input, idempotencyKey },
        mock: async () => requestEncashment(await mockActor(), input, idempotencyKey),
    });
}
export async function decideEncashmentRequest(input: DecisionInput) {
    return callApi({
        schema: refResult,
        live: { method: "POST", path: `/leave/encashments/${encodeURIComponent(input.id)}/decision`, ifMatch: input.version, body: { decision: input.decision, note: input.note } },
        mock: async () => decideEncashment(await mockActor(), input),
    });
}
export async function cancelEncashmentRequest(id: string) {
    return callApi({
        schema: refResult,
        live: { method: "POST", path: `/leave/encashments/${encodeURIComponent(id)}/cancel`, body: {} },
        mock: async () => cancelEncashment(await mockActor(), id),
    });
}
/* Year-end ----------------------------------------------------------------- */
export const getYearEnd = cache(async () => callApi({ schema: yearEndSchema, live: { path: "/leave/admin/year-end" }, mock: async () => yearEnd(await mockActor()) }));
export async function runYearEnd(year: string, idempotencyKey: string) {
    return callApi({
        schema: z.object({ year: z.string(), rows: z.number() }),
        live: { method: "POST", path: `/leave/admin/year-end/${encodeURIComponent(year)}/commit`, body: {}, idempotencyKey },
        mock: async () => commitYearEnd(await mockActor(), year, idempotencyKey),
    });
}
