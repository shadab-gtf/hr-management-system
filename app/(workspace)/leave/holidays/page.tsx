import type { Metadata } from "next";
import { Suspense } from "react";
import { getHolidays } from "@/lib/api/leave/leave.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { HolidayCalendarSection } from "@/components/sections/leave/leave-calendar-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Holiday calendar" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "leave.request.self")) return <AccessDenied what="the holiday calendar" />;
  return <HolidayCalendarSection holidays={await getHolidays()} today={todayInZone(session.organization.timezone)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading holidays" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
