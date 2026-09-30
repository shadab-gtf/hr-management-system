import type { Metadata } from "next";
import { Suspense } from "react";
import { getApprovals, getWorkQueue } from "@/lib/api/approvals/approvals.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { ApprovalsSection } from "@/components/sections/approvals/approvals-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { approvalKindSchema } from "@/types/approval";

export const metadata: Metadata = { title: "Approvals" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function ApprovalsData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "approval.decide")) return <AccessDenied what="approvals" />;
  const params = await searchParams;
  const tab = params.tab === "decided" ? "decided" : "pending";
  const kind = approvalKindSchema.safeParse(params.kind);
  const [items, pending, queue] = await Promise.all([getApprovals(tab), tab === "pending" ? null : getApprovals("pending"), getWorkQueue()]);
  const selected = items.find((item) => item.id === params.id) ?? null;
  return (
    <ApprovalsSection
      items={items}
      selected={selected}
      tab={tab}
      pendingCount={(pending ?? items).length}
      kind={kind.success ? kind.data : "all"}
      queue={queue}
    />
  );
}

export default function ApprovalsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading approvals" variant="split" />}>
      <ApprovalsData searchParams={searchParams} />
    </Suspense>
  );
}
