import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getTeamPerformanceView } from "@/lib/api/performance/performance.service";
import { TeamPerformanceSection } from "@/components/sections/performance/team-performance-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Team reviews" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "performance.review")) return <AccessDenied what="team reviews" />;
  const query = await searchParams;
  const cycle = typeof query.cycle === "string" ? query.cycle : undefined;
  const review = typeof query.review === "string" ? query.review : undefined;
  return <TeamPerformanceSection data={await getTeamPerformanceView(cycle, review)} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading team reviews" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
