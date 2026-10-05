import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getOffboardingBoard } from "@/lib/api/lifecycle/lifecycle.service";
import { LifecycleOffboardingSection } from "@/components/sections/lifecycle/offboarding-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Offboarding" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "onboarding.manage")) return <AccessDenied what="offboarding" />;
  return <LifecycleOffboardingSection board={await getOffboardingBoard()} tabs={<AdminTabsFor active="offboarding" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading offboarding" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
