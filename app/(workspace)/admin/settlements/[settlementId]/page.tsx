import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getSettlement } from "@/lib/api/lifecycle/lifecycle.service";
import { SettlementDetailSection } from "@/components/sections/lifecycle/settlements-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { AdminTabsFor } from "../../admin-tabs";

export const metadata: Metadata = { title: "Settlement" };

type Params = Promise<{ settlementId: string }>;

async function Data({ params }: { params: Params }) {
  const [{ settlementId }, session] = await Promise.all([params, getSession()]);
  if (!session || !hasCapability(session, "settlement.prepare", "settlement.approve")) return <AccessDenied what="settlements" />;
  const record = await getSettlement(settlementId).catch((error: unknown) => {
    if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  return <SettlementDetailSection settlement={record} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="settlements" />} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settlement" variant="split" />}>
      <Data params={params} />
    </Suspense>
  );
}
