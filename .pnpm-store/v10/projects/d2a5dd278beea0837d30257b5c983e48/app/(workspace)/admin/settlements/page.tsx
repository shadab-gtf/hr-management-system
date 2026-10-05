import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getSettlementBoard } from "@/lib/api/lifecycle/lifecycle.service";
import { SettlementsSection } from "@/components/sections/lifecycle/settlements-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "F&F settlements" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "settlement.prepare", "settlement.approve")) return <AccessDenied what="settlements" />;
  return <SettlementsSection board={await getSettlementBoard()} tabs={<AdminTabsFor active="settlements" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settlements" variant="table" />}>
      <Data />
    </Suspense>
  );
}
