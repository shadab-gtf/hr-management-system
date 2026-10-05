import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getMyTimesheet } from "@/lib/api/timesheets/timesheets.service";
import { MyTimesheetSection } from "@/components/sections/timesheets/my-timesheet-section";
import { TimesheetTabs } from "@/components/sections/timesheets/timesheet-tabs";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "My timesheet" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "timesheet.submit.self")) return <AccessDenied what="timesheets" />;
  const query = await searchParams;
  const view = await getMyTimesheet(typeof query.week === "string" ? query.week : null);
  const allowed = { mine: true, team: hasCapability(session, "timesheet.approve"), projects: hasCapability(session, "project.manage") };
  return <MyTimesheetSection view={view} tabs={<TimesheetTabs active="mine" allowed={allowed} />} />;
}

export default function TimesheetsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading timesheet" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
