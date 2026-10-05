import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getChecklistTemplates } from "@/lib/api/config/config.service";
import { ChecklistsSection } from "@/components/sections/admin/config-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Checklists" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "onboarding.manage")) return <AccessDenied what="checklists" />;
  return <ChecklistsSection checklists={await getChecklistTemplates()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading checklists" variant="split" />}>
      <Data />
    </Suspense>
  );
}
