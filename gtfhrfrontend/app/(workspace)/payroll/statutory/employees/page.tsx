import type { Metadata } from "next";
import { Suspense } from "react";
import { getStatutoryEmployees } from "@/lib/api/payroll/statutory.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { StatutoryEmployeesSection } from "@/components/sections/payroll/statutory-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Employee statutory ids" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "statutory.manage")) return <AccessDenied what="statutory records" />;
  return <StatutoryEmployeesSection data={await getStatutoryEmployees()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading statutory records" variant="table" />}>
      <Data />
    </Suspense>
  );
}
