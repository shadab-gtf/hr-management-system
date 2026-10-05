import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getFeedbackHubView } from "@/lib/api/performance/performance.service";
import { FeedbackSection, feedbackTabs, type FeedbackTab } from "@/components/sections/performance/feedback-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Feedback" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "performance.self")) return <AccessDenied what="feedback" />;
  const query = await searchParams;
  const tab = feedbackTabs.find((t) => t === query.tab) ?? ("received" satisfies FeedbackTab);
  return <FeedbackSection hub={await getFeedbackHubView()} tab={tab} today={todayInZone(session.organization.timezone)} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading feedback" variant="cards" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
