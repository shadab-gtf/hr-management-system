import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getOrganization } from "@/lib/api/config/config.service";
import { getHrFormOptions } from "@/lib/api/employees/employees.service";
import { OrganizationSection } from "@/components/sections/admin/config-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Organization" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "policy.publish")) return <AccessDenied what="organization" />;
  const [config, options] = await Promise.all([getOrganization(), getHrFormOptions()]);
  return <OrganizationSection config={config} people={options.managers} tabs={<AdminTabsFor active="organization" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading organization" variant="table" />}>
      <Data />
    </Suspense>
  );
}
