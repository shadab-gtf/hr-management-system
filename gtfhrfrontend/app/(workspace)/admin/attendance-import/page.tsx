import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiProblem } from "@/lib/api/core/problem";
import { getImportBatches, getImportPreview } from "@/lib/api/imports/imports.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AttendanceImportSection } from "@/components/sections/admin/attendance-import-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Attendance import" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "import.commit")) return <AccessDenied what="attendance imports" />;
  const query = await searchParams;
  const requested = typeof query.batch === "string" ? query.batch : null;
  const [history, batch] = await Promise.all([
    getImportBatches(),
    // An unknown/expired batch id simply shows no preview.
    requested ? getImportPreview(requested).catch((error: unknown) => (error instanceof ApiProblem && error.status === 404 ? null : Promise.reject(error))) : null,
  ]);
  return <AttendanceImportSection batch={batch} history={history} tabs={<AdminTabsFor active="attendance-import" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading attendance import" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
