import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getCandidate, getJob, getRecruitmentOptions } from "@/lib/api/recruitment/recruitment.service";
import { CandidateProfileSection } from "@/components/sections/recruitment/candidate-profile-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

// Generic title: candidate names never appear in document titles or history.
export const metadata: Metadata = { title: "Candidate" };

type Params = Promise<{ candidateId: string }>;

async function CandidateData({ params }: { params: Params }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "recruitment.manage")) return <AccessDenied what="candidate records" />;
  const { candidateId } = await params;
  const candidate = await getCandidate(candidateId).catch((error: unknown) => {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  });
  const [job, options] = await Promise.all([getJob(candidate.jobId), getRecruitmentOptions()]);
  return <CandidateProfileSection candidate={candidate} job={job} options={options} />;
}

export default function CandidatePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading candidate" variant="detail" />}>
      <CandidateData params={params} />
    </Suspense>
  );
}
