import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getAdminPerformanceView } from "@/lib/api/performance/performance.service";
import { AdminPerformanceSection } from "@/components/sections/performance/admin-performance-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Performance cycles" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "performance.manage")) return <AccessDenied what="performance cycles" />;
  const query = await searchParams;
  const cycle = typeof query.cycle === "string" ? query.cycle : undefined;
  const dept = typeof query.dept === "string" ? query.dept : undefined;
  return <AdminPerformanceSection data={await getAdminPerformanceView(cycle)} dept={dept} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="performance" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading performance cycles" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
