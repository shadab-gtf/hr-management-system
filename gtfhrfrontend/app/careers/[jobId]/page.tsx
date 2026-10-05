import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession } from "@/lib/api/session/session.service";
import { getMyReferrals, getPublicJob } from "@/lib/api/recruitment/recruitment.service";
import { CareersJobSection } from "@/components/sections/recruitment/careers-sections";
import { PageSkeleton } from "@/components/ui/skeletons";

type Params = Promise<{ jobId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getPublicJob(jobId).catch(() => null);
  return { title: job ? `${job.title} · Careers` : "Careers" };
}

async function JobData({ params }: { params: Params }) {
  const { jobId } = await params;
  const job = await getPublicJob(jobId).catch((error: unknown) => {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  });
  const session = await getSession();
  const referrals = session ? await getMyReferrals() : [];
  return <CareersJobSection job={job} signedIn={Boolean(session)} referrals={referrals} />;
}

export default function CareersJobPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading role" variant="detail" />}>
      <JobData params={params} />
    </Suspense>
  );
}
