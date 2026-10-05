import type { Metadata } from "next";
import { Suspense } from "react";
import { getLeaveLedger, getLeaveOverview } from "@/lib/api/leave/leave.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { LeaveSection } from "@/components/sections/leave/leave-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Leave" };

async function LeaveData({ openRequest, ledgerType }: { openRequest: boolean; ledgerType: string | undefined }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "leave.request.self")) return <AccessDenied what="leave" />;
  const [data, ledger] = await Promise.all([getLeaveOverview(), getLeaveLedger()]);
  return <LeaveSection data={data} ledger={ledger} ledgerType={ledgerType} today={todayInZone(session.organization.timezone)} openRequest={openRequest} />;
}

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { new: openNew, ledger } = await searchParams;
  return (
    <Suspense fallback={<PageSkeleton label="Loading leave" variant="split" />}>
      <LeaveData openRequest={openNew === "1"} ledgerType={typeof ledger === "string" ? ledger : undefined} />
    </Suspense>
  );
}
