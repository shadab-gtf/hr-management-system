import type { Metadata } from "next";
import { Suspense } from "react";
import { getExportLog, getReportAnalytics, getReportLibrary } from "@/lib/api/reports/reports.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { ReportsPageSection } from "@/components/sections/reports/reports-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Reports" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "report.read")) return <AccessDenied what="reports" />;
  const [library, analytics, exports] = await Promise.all([getReportLibrary(), getReportAnalytics(), getExportLog()]);
  return <ReportsPageSection library={library} analytics={analytics} exports={exports} canBuild={hasCapability(session, "report.build")} tabs={<AdminTabsFor active="reports" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading reports" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
