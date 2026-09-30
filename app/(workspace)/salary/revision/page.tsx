import type { Metadata } from "next";
import { Suspense } from "react";
import { getCompensation } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { RevisionSection } from "@/components/sections/salary/salary-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Salary revision" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "payslip.read.self")) return <AccessDenied what="salary details" />;
  return <RevisionSection data={await getCompensation()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading salary details" variant="split" />}>
      <Data />
    </Suspense>
  );
}
