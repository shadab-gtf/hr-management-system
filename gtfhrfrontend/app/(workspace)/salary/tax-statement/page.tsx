import type { Metadata } from "next";
import { Suspense } from "react";
import { getTaxStatement } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { TaxStatementSection } from "@/components/sections/salary/salary-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "IT statement" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "payslip.read.self")) return <AccessDenied what="your tax statement" />;
  return <TaxStatementSection statement={await getTaxStatement()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your tax statement" variant="split" />}>
      <Data />
    </Suspense>
  );
}
