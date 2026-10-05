import type { Metadata } from "next";
import { Suspense } from "react";
import { getEmployees } from "@/lib/api/employees/employees.service";
import { getDelegations } from "@/lib/api/requests/requests.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { DelegatesSection } from "@/components/sections/requests/requests-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { employeeFiltersSchema } from "@/types/employee";

export const metadata: Metadata = { title: "Workflow delegates" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "delegation.manage")) return <AccessDenied what="workflow delegates" />;
  const [delegations, people] = await Promise.all([getDelegations(), getEmployees(employeeFiltersSchema.parse({ limit: 100 }))]);
  const colleagues = people.items.filter((person) => person.id !== session.employeeId).map((person) => ({ id: person.id, name: person.name, designation: person.designation }));
  return <DelegatesSection given={delegations.given} received={delegations.received} colleagues={colleagues} today={todayInZone(session.organization.timezone)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading delegates" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
