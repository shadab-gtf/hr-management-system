import type { Metadata } from "next";
import { Suspense } from "react";
import { getAnnouncements } from "@/lib/api/announcements/announcements.service";
import { getEmployeeFacets } from "@/lib/api/employees/employees.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AnnouncementsAdminSection } from "@/components/sections/admin/admin-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Announcements" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "announcement.publish")) return <AccessDenied what="announcements" />;
  const [announcements, facets] = await Promise.all([getAnnouncements("admin"), getEmployeeFacets()]);
  return <AnnouncementsAdminSection announcements={announcements} departments={facets.departments} tabs={<AdminTabsFor active="announcements" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading announcements" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
