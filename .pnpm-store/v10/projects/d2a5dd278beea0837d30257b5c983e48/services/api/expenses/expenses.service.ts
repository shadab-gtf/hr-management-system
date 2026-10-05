import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { createExpense, listExpenses } from "@/lib/mocks/handlers/expenses";
import { expenseClaimSchema, type ExpenseInput } from "@/types/workplace";
export const getExpenses = cache(async () => callApi({
    schema: z.array(expenseClaimSchema),
    live: { path: "/expenses" },
    mock: async () => listExpenses(await mockActor()),
}));
export async function submitExpense(input: ExpenseInput, idempotencyKey: string) {
    return callApi({
        schema: z.object({ reference: z.string(), state: z.string() }),
        live: {
            method: "POST",
            path: "/expenses",
            body: { ...input, amount: { amount: input.amount, currency: "INR" } },
            idempotencyKey,
        },
        mock: async () => createExpense(await mockActor(), input, idempotencyKey),
    });
}
