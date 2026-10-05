import type { Metadata } from "next";
import { Suspense } from "react";
import { getPayslips } from "@/lib/api/payslips/payslips.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { PayslipsSection } from "@/components/sections/payslips/payslips-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Payslips" };

async function PayslipsData() {
  const session = await getSession();
  if (!session || !hasCapability(session, "payslip.read.self")) return <AccessDenied what="payslips" />;
  return <PayslipsSection payslips={await getPayslips()} />;
}

export default function PayslipsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading payslips" variant="table" />}>
      <PayslipsData />
    </Suspense>
  );
}
