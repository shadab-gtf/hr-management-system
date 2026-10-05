import type { Metadata } from "next";
import { Suspense } from "react";
import { getYtd } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { YtdSection } from "@/components/sections/salary/salary-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "YTD reports" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "payslip.read.self")) return <AccessDenied what="year-to-date reports" />;
  return <YtdSection ytd={await getYtd()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading year-to-date reports" variant="table" />}>
      <Data />
    </Suspense>
  );
}
