import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getServiceRequests } from "@/lib/api/admin/admin.service";
import { ServiceRequestsSection } from "@/components/sections/admin/config-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Service requests" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "employee.update", "letter.issue", "loan.approve")) return <AccessDenied what="service requests" />;
  const query = await searchParams;
  const view = query.view === "closed" ? "closed" : "open";
  return <ServiceRequestsSection requests={await getServiceRequests(view)} view={view} tabs={<AdminTabsFor active="requests" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading service requests" variant="cards" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
