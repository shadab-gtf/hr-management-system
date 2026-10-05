import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getProjects } from "@/lib/api/timesheets/timesheets.service";
import { ProjectsSection } from "@/components/sections/timesheets/projects-section";
import { TimesheetTabs } from "@/components/sections/timesheets/timesheet-tabs";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Projects" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "project.manage")) return <AccessDenied what="projects" />;
  const view = await getProjects();
  const allowed = { mine: hasCapability(session, "timesheet.submit.self"), team: hasCapability(session, "timesheet.approve"), projects: true };
  return <ProjectsSection view={view} orgWideExport={hasCapability(session, "employee.read")} tabs={<TimesheetTabs active="projects" allowed={allowed} />} />;
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading projects" variant="table" />}>
      <Data />
    </Suspense>
  );
}
