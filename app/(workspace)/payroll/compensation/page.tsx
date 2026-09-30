import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiProblem } from "@/lib/api/core/problem";
import { getCompensationBatches, getCompensationPreview } from "@/lib/api/imports/compensation.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { CompensationImportSection } from "@/components/sections/payroll/compensation-import-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Salary import" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "compensation.manage", "payroll.approve")) return <AccessDenied what="salary imports" />;
  const query = await searchParams;
  const requested = typeof query.batch === "string" ? query.batch : null;
  const [history, batch] = await Promise.all([
    getCompensationBatches(),
    requested ? getCompensationPreview(requested).catch((error: unknown) => (error instanceof ApiProblem && error.status === 404 ? null : Promise.reject(error))) : null,
  ]);
  return <CompensationImportSection batch={batch} history={history} canUpload={hasCapability(session, "compensation.manage")} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading salary import" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
