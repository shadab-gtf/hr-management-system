import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getCandidates, getJobs, getRecruitmentOptions } from "@/lib/api/recruitment/recruitment.service";
import { CandidatesSection } from "@/components/sections/recruitment/candidates-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { candidateSourceSchema, recruitmentStageSchema } from "@/types/recruitment";

export const metadata: Metadata = { title: "Candidates" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined) => (typeof value === "string" && value ? value : undefined);

async function CandidatesData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "recruitment.manage")) return <AccessDenied what="candidates" />;
  const raw = await searchParams;
  const stage = recruitmentStageSchema.safeParse(single(raw.stage));
  const source = candidateSourceSchema.safeParse(single(raw.source));
  const filters = {
    q: single(raw.q)?.slice(0, 100),
    jobId: single(raw.jobId),
    stage: stage.success ? stage.data : undefined,
    source: source.success ? source.data : undefined,
    retention: raw.retention === "1" ? true : undefined,
  };
  const [candidates, jobs, options] = await Promise.all([getCandidates(filters), getJobs(), getRecruitmentOptions()]);
  return <CandidatesSection candidates={candidates} filters={filters} options={options} jobs={jobs.map((job) => ({ id: job.id, title: job.title }))} />;
}

export default function CandidatesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading candidates" variant="table" />}>
      <CandidatesData searchParams={searchParams} />
    </Suspense>
  );
}
