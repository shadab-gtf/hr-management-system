import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getJobs, getRecruitmentOptions, getRecruitmentStats, getRequisitions } from "@/lib/api/recruitment/recruitment.service";
import { RecruitmentHomeSection, type RecruitmentTab } from "@/components/sections/recruitment/recruitment-home-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Recruitment" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function RecruitmentData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) return <AccessDenied what="recruitment" />;
  if (!hasCapability(session, "recruitment.manage")) {
    // Interviewing managers land on their own interviews and requisitions.
    if (hasCapability(session, "candidate.interview")) redirect("/recruitment/interviews");
    return <AccessDenied what="recruitment" />;
  }
  const { tab: raw } = await searchParams;
  const tab: RecruitmentTab = raw === "requisitions" || raw === "sources" ? raw : "jobs";
  const [stats, jobs, requisitions, options] = await Promise.all([getRecruitmentStats(), getJobs(), getRequisitions(), getRecruitmentOptions()]);
  return <RecruitmentHomeSection stats={stats} jobs={jobs} requisitions={requisitions} options={options} tab={tab} />;
}

export default function RecruitmentPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading recruitment" variant="dashboard" />}>
      <RecruitmentData searchParams={searchParams} />
    </Suspense>
  );
}
