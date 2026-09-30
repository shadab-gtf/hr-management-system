import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getTeamTimesheets } from "@/lib/api/timesheets/timesheets.service";
import { TeamTimesheetsSection } from "@/components/sections/timesheets/team-timesheets-section";
import { TimesheetTabs } from "@/components/sections/timesheets/timesheet-tabs";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Team timesheets" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "timesheet.approve")) return <AccessDenied what="team timesheets" />;
  const view = await getTeamTimesheets();
  const allowed = { mine: hasCapability(session, "timesheet.submit.self"), team: true, projects: hasCapability(session, "project.manage") };
  return <TeamTimesheetsSection view={view} orgWideExport={hasCapability(session, "employee.read")} tabs={<TimesheetTabs active="team" allowed={allowed} />} />;
}

export default function TeamTimesheetsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading team timesheets" variant="table" />}>
      <Data />
    </Suspense>
  );
}
