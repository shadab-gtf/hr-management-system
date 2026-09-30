import type { Metadata } from "next";
import { Suspense } from "react";
import { getOnboarding } from "@/lib/api/admin/admin.service";
import { getHrFormOptions } from "@/lib/api/employees/employees.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { OnboardingSection } from "@/components/sections/admin/admin-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Onboarding" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "onboarding.manage")) return <AccessDenied what="onboarding" />;
  const [cases, options] = await Promise.all([getOnboarding(), hasCapability(session, "employee.create") ? getHrFormOptions() : null]);
  return <OnboardingSection cases={cases} options={options} tabs={<AdminTabsFor active="onboarding" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading onboarding" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
