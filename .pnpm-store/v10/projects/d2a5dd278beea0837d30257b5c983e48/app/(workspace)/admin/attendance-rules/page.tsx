import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getAttendanceRulesConfig } from "@/lib/api/config/config.service";
import { AttendanceRulesSection } from "@/components/sections/admin/config-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Attendance rules" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "policy.publish")) return <AccessDenied what="attendance rules" />;
  return <AttendanceRulesSection rules={await getAttendanceRulesConfig()} tabs={<AdminTabsFor active="attendance-rules" />} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading attendance rules" variant="split" />}>
      <Data />
    </Suspense>
  );
}
