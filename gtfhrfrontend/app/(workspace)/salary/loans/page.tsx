import type { Metadata } from "next";
import { Suspense } from "react";
import { getLoans } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { LoansSection } from "@/components/sections/salary/salary-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Loans & advances" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "loan.request.self")) return <AccessDenied what="loans" />;
  return <LoansSection loans={await getLoans()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading loans" variant="table" />}>
      <Data />
    </Suspense>
  );
}
