import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getJob, getRecruitmentOptions } from "@/lib/api/recruitment/recruitment.service";
import { JobPipelineSection } from "@/components/sections/recruitment/job-pipeline-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { recruitmentStageSchema, stageOrder, type RecruitmentStage } from "@/types/recruitment";

export const metadata: Metadata = { title: "Hiring pipeline" };

type Params = Promise<{ jobId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

async function PipelineData({ params, searchParams }: { params: Params; searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "recruitment.manage")) return <AccessDenied what="hiring pipelines" />;
  const [{ jobId }, query] = await Promise.all([params, searchParams]);
  const job = await getJob(jobId).catch((error: unknown) => {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  });
  const parsed = recruitmentStageSchema.safeParse(query.stage);
  // Phones show one stage at a time; default to the first stage with candidates.
  const stage: RecruitmentStage = parsed.success ? parsed.data : (stageOrder.find((item) => job.stageCounts[item] > 0) ?? "applied");
  return <JobPipelineSection job={job} options={await getRecruitmentOptions()} stage={stage} />;
}

export default function PipelinePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading pipeline" variant="cards" />}>
      <PipelineData params={params} searchParams={searchParams} />
    </Suspense>
  );
}
