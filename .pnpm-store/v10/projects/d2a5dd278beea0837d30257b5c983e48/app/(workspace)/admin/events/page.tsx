import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getCelebrations, getEvents } from "@/lib/api/config/config.service";
import { getEmployeeFacets } from "@/lib/api/employees/employees.service";
import { EventsAdminSection } from "@/components/sections/admin/config-sections";
import { todayInZone } from "@/lib/utils/date";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Events & celebrations" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "event.manage")) return <AccessDenied what="events" />;
  const [events, celebrations, options] = await Promise.all([getEvents(), getCelebrations(), getEmployeeFacets()]);
  return <EventsAdminSection events={events} celebrations={celebrations} departments={options.departments} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="events" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading events" variant="split" />}>
      <Data />
    </Suspense>
  );
}
