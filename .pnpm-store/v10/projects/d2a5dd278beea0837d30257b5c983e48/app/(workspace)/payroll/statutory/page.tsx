import type { Metadata } from "next";
import { Suspense } from "react";
import { getStatutoryHub } from "@/lib/api/payroll/statutory.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { StatutoryHubSection } from "@/components/sections/payroll/statutory-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { isValidMonth, todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Statutory compliance" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function StatutoryData({ searchParams }: { searchParams: Search }) {
  const [session, raw] = await Promise.all([getSession(), searchParams]);
  if (!session || !hasCapability(session, "statutory.manage")) return <AccessDenied what="statutory compliance" />;
  const month = typeof raw.month === "string" && isValidMonth(raw.month) ? raw.month : undefined;
  return <StatutoryHubSection hub={await getStatutoryHub(month)} today={todayInZone()} />;
}

export default function StatutoryPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading statutory compliance" variant="cards" />}>
      <StatutoryData searchParams={searchParams} />
    </Suspense>
  );
}
