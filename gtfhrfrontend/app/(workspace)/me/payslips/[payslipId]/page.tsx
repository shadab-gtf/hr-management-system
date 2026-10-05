import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getPayslip } from "@/lib/api/payslips/payslips.service";
import { getSession } from "@/lib/api/session/session.service";
import { PayslipDetailSection } from "@/components/sections/payslips/payslips-section";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Payslip" };

type Params = Promise<{ payslipId: string }>;

async function PayslipData({ params }: { params: Params }) {
  const [{ payslipId }, session] = await Promise.all([params, getSession()]);
  const payslip = await getPayslip(payslipId).catch((error: unknown) => {
    if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  return <PayslipDetailSection payslip={payslip} demo={session?.source === "mock"} />;
}

export default function PayslipPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading payslip" variant="split" />}>
      <PayslipData params={params} />
    </Suspense>
  );
}
