import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, nextReference, nowInstant } from "@/lib/mocks/store";
import { inr } from "@/lib/mocks/seed/random";
import { addDays } from "@/lib/utils/date";
import { idempotent, me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type { ExpenseCategory, ExpenseClaim, ExpenseInput } from "@/types/workplace";

const expenseLabels: Record<ExpenseCategory, string> = {
  travel: "Travel",
  meals: "Meals",
  client_meeting: "Client meeting",
  internet: "Internet",
  equipment: "Equipment",
  other: "Other",
};
export function expenseCategoryLabel(category: ExpenseCategory) {
  return expenseLabels[category];
}

export function listExpenses(actor: MockActor): ExpenseClaim[] {
  requireCapability(actor, "expense.submit.self");
  return db()
    .expenses.filter((claim) => claim.employeeId === actor.employeeId)
    .sort((a, b) => b.incurredOn.localeCompare(a.incurredOn))
    .map((claim) => ({
      id: claim.id,
      reference: claim.reference,
      title: claim.title,
      category: claim.category,
      amount: inr(claim.amountPaise),
      incurredOn: claim.incurredOn,
      merchant: claim.merchant,
      state: claim.state,
      submittedAt: claim.submittedAt,
      receipts: claim.receipts,
      settlementReference: claim.settlementReference,
    }));
}

export function createExpense(actor: MockActor, input: ExpenseInput, key: string | undefined) {
  requireCapability(actor, "expense.submit.self");
  return idempotent(key, () => {
    const employee = me(actor);
    const store = db();
    if (input.incurredOn > store.today)
      throw problem(422, "FUTURE_DATE", "Expenses can't be in the future.", { fieldErrors: { incurredOn: "Choose today or an earlier date." } });
    if (input.incurredOn < addDays(store.today, -90))
      throw problem(422, "OUTSIDE_WINDOW", "Claims must be filed within 90 days.", { fieldErrors: { incurredOn: "This date is outside the 90-day window." } });
    // Exact decimal string → integer paise, no floats.
    const [whole = "0", fraction = ""] = input.amount.split(".");
    const amountPaise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
    const reference = nextReference("EX");
    store.expenses.push({
      id: `ex_${store.counter}`,
      reference,
      employeeId: employee.id,
      title: input.title,
      category: input.category,
      amountPaise,
      incurredOn: input.incurredOn,
      merchant: input.merchant,
      state: "submitted",
      submittedAt: nowInstant(),
      receipts: 1,
      settlementReference: null,
      approverId: employee.managerId,
      version: 1,
    });
    return { reference, state: "submitted" };
  });
}
