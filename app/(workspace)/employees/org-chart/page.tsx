import type { Metadata } from "next";
import { Suspense } from "react";
import { getOrgChart } from "@/lib/api/people/people.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { OrgChartSection } from "@/components/sections/people/org-chart-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Org chart" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function OrgData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "directory.read")) return <AccessDenied what="the org chart" />;
  const { q } = await searchParams;
  return <OrgChartSection nodes={await getOrgChart()} q={typeof q === "string" && q.trim() ? q.trim().slice(0, 100) : undefined} />;
}

export default function OrgChartPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading org chart" variant="cards" />}>
      <OrgData searchParams={searchParams} />
    </Suspense>
  );
}
