import type { Metadata } from "next";
import { Suspense } from "react";
import { getMyRoster, getRosterPlanner } from "@/lib/api/attendance/attendance.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { MyRosterSection, RosterPlannerSection } from "@/components/sections/attendance/roster-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { isValidMonth, todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Shift roster" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "attendance.read.self")) return <AccessDenied what="the shift roster" />;
  const params = await searchParams;
  const today = todayInZone(session.organization.timezone);
  const canPlan = hasCapability(session, "roster.manage");
  const week = isoDate(params.week) ? params.week : today;
  if (params.view === "plan") {
    if (!canPlan) return <AccessDenied what="the roster planner" />;
    const planner = await getRosterPlanner(typeof params.department === "string" ? params.department : undefined, week);
    return <RosterPlannerSection planner={planner} today={today} />;
  }
  const month = typeof params.month === "string" && isValidMonth(params.month) ? params.month : today.slice(0, 7);
  const roster = params.view === "month" ? await getMyRoster("month", `${month}-01`) : await getMyRoster("week", week);
  return <MyRosterSection roster={roster} today={today} canPlan={canPlan} employeeId={session.employeeId} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading shift roster" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
