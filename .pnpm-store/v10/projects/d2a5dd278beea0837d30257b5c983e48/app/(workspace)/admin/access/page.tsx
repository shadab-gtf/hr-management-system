import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getAccessOverview } from "@/lib/api/identity/identity.service";
import { AccessAdminSection } from "@/components/sections/identity/access-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Access & accounts" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "access.manage"))
    return <AccessDenied what="access administration" />;
  const overview = await getAccessOverview();
  return (
    <AccessAdminSection
      overview={overview}
      today={todayInZone(session.organization.timezone)}
      canReadAudit={hasCapability(session, "audit.read")}
    />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={<PageSkeleton label="Loading accounts" variant="table" />}
    >
      <Data />
    </Suspense>
  );
}
