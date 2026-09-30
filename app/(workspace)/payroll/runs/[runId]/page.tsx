import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getPayrollRun } from "@/lib/api/payroll/payroll.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { PayrollRunSection } from "@/components/sections/payroll/payroll-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Payroll run" };

type Params = Promise<{ runId: string }>;

async function RunData({ params }: { params: Params }) {
  const [{ runId }, session] = await Promise.all([params, getSession()]);
  if (!session || !hasCapability(session, "payroll.prepare", "payroll.approve")) return <AccessDenied what="payroll" />;
  const run = await getPayrollRun(runId).catch((error: unknown) => {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  });
  return <PayrollRunSection run={run} />;
}

export default function PayrollRunPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading payroll run" variant="split" />}>
      <RunData params={params} />
    </Suspense>
  );
}
