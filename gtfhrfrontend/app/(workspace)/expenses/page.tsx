import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getExpenses } from "@/lib/api/expenses/expenses.service";
import { ExpensesSection } from "@/components/sections/expenses/expenses-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Expenses" };

async function ExpensesData() {
  const session = await getSession();
  if (!session || !hasCapability(session, "expense.submit.self")) return <AccessDenied what="expenses" />;
  return <ExpensesSection claims={await getExpenses()} today={todayInZone(session.organization.timezone)} />;
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading expenses" variant="table" />}>
      <ExpensesData />
    </Suspense>
  );
}
