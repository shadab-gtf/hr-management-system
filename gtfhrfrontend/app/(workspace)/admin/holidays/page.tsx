import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getHolidayRecords, getOrganization } from "@/lib/api/config/config.service";
import { HolidaysAdminSection } from "@/components/sections/admin/config-sections";
import { todayInZone } from "@/lib/utils/date";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Holidays" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "policy.publish")) return <AccessDenied what="holidays" />;
  const [holidays, org, query] = await Promise.all([getHolidayRecords(), getOrganization(), searchParams]);
  const today = todayInZone(session.organization.timezone);
  const requested = typeof query.year === "string" && /^\d{4}$/.test(query.year) ? query.year : today.slice(0, 4);
  return <HolidaysAdminSection holidays={holidays} locations={org.locations.map((l) => l.name)} today={today} year={requested} tabs={<AdminTabsFor active="holidays" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading holidays" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
