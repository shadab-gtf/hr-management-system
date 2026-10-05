import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getMyPerformanceView } from "@/lib/api/performance/performance.service";
import { MyPerformanceSection } from "@/components/sections/performance/my-performance-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Goals & reviews" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "performance.self")) return <AccessDenied what="goals and reviews" />;
  const query = await searchParams;
  const cycle = typeof query.cycle === "string" ? query.cycle : undefined;
  return <MyPerformanceSection data={await getMyPerformanceView(cycle)} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading goals and reviews" variant="cards" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
