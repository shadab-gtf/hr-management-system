import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getMyInterviews, getRecruitmentOptions } from "@/lib/api/recruitment/recruitment.service";
import { MyInterviewsSection, type InterviewsTab } from "@/components/sections/recruitment/interviews-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "My interviews" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function InterviewsData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "candidate.interview")) return <AccessDenied what="interviews" />;
  const { tab: raw } = await searchParams;
  const [data, options] = await Promise.all([getMyInterviews(), getRecruitmentOptions()]);
  const tab: InterviewsTab = raw === "requisitions" ? "requisitions" : raw === "offers" && data.canApproveOffers ? "offers" : "interviews";
  return <MyInterviewsSection data={data} options={options} tab={tab} hrView={hasCapability(session, "recruitment.manage")} />;
}

export default function InterviewsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading interviews" variant="cards" />}>
      <InterviewsData searchParams={searchParams} />
    </Suspense>
  );
}
