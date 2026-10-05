import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getSurveyAdmin } from "@/lib/api/engage/surveys.service";
import { SurveysAdminSection } from "@/components/sections/engage/surveys-admin-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Polls & surveys" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "survey.manage")) return <AccessDenied what="surveys" />;
  return <SurveysAdminSection admin={await getSurveyAdmin()} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="surveys" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading surveys" variant="table" />}>
      <Data />
    </Suspense>
  );
}
