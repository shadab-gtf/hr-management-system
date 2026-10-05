import type { Metadata } from "next";
import { Suspense } from "react";
import { getPayrollOverview } from "@/lib/api/payroll/payroll.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { PayrollOverviewSection } from "@/components/sections/payroll/payroll-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Payroll" };

async function PayrollData() {
  const session = await getSession();
  if (!session || !hasCapability(session, "payroll.prepare", "payroll.approve")) return <AccessDenied what="payroll" />;
  return <PayrollOverviewSection data={await getPayrollOverview()} />;
}

export default function PayrollPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading payroll" variant="cards" />}>
      <PayrollData />
    </Suspense>
  );
}
