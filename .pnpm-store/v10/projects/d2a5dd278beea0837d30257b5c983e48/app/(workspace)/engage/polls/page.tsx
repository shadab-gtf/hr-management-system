import type { Metadata } from "next";
import { Suspense } from "react";
import { getPolls } from "@/lib/api/engage/engage.service";
import { getSurveysForYou } from "@/lib/api/engage/surveys.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { PollsSection } from "@/components/sections/engage/polls-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Polls & surveys" };

async function PollsData() {
  const session = await getSession();
  if (!session || !hasCapability(session, "directory.read")) return <AccessDenied what="polls and surveys" />;
  const [page, surveys] = await Promise.all([getPolls(), getSurveysForYou()]);
  return (
    <PollsSection
      page={page}
      surveys={surveys}
      today={todayInZone(session.organization.timezone)}
      canPost={hasCapability(session, "engage.post")}
      anyDepartment={hasCapability(session, "survey.manage")}
    />
  );
}

export default function PollsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading polls and surveys" variant="cards" />}>
      <PollsData />
    </Suspense>
  );
}
