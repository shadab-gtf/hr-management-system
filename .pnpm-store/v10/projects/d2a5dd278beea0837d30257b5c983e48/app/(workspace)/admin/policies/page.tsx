import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getPolicyBoard } from "@/lib/api/lifecycle/lifecycle.service";
import { getEmployeeFacets } from "@/lib/api/employees/employees.service";
import { PoliciesAdminSection } from "@/components/sections/lifecycle/policies-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Policy acknowledgements" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "policy.publish")) return <AccessDenied what="policy acknowledgements" />;
  const [policies, facets] = await Promise.all([getPolicyBoard(), getEmployeeFacets()]);
  return <PoliciesAdminSection policies={policies} departments={facets.departments} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="policies" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading policies" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
