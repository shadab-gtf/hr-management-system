import type { Metadata } from "next";
import { Suspense } from "react";
import { getLeaveCalendar } from "@/lib/api/leave/leave.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { LeaveCalendarSection } from "@/components/sections/leave/leave-calendar-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { isValidMonth, monthOf, todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Leave calendar" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "leave.request.self")) return <AccessDenied what="the leave calendar" />;
  const today = todayInZone(session.organization.timezone);
  const { month } = await searchParams;
  const selected = typeof month === "string" && isValidMonth(month) ? month : monthOf(today);
  return <LeaveCalendarSection calendar={await getLeaveCalendar(selected)} today={today} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading leave calendar" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
