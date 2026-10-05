import type { Metadata } from "next";
import { Suspense } from "react";
import { getCompOffPage } from "@/lib/api/leave/leave.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { CompOffSection } from "@/components/sections/leave/comp-off-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Comp-off & encashment" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "leave.request.self")) return <AccessDenied what="comp-off" />;
  const data = await getCompOffPage();
  return <CompOffSection data={data} isManager={hasCapability(session, "approval.decide")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading comp-off" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
