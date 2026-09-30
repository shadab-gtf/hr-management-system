import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiProblem } from "@/lib/api/core/problem";
import { getBuilderContext, getDeliveryLog, getSavedReports, previewReport } from "@/lib/api/reports/reports.service";
import { specFromParams, specToQuery, type SearchParams } from "@/lib/api/reports/spec-params";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { ReportBuilderSection } from "@/components/sections/reports/builder-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../../admin-tabs";
import type { ReportTable } from "@/types/reports";

export const metadata: Metadata = { title: "Report builder" };

async function Data({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "report.build")) return <AccessDenied what="the report builder" />;
  const params = await searchParams;
  const [context, saved, deliveries] = await Promise.all([getBuilderContext(), getSavedReports(), getDeliveryLog()]);
  const savedId = typeof params.saved === "string" ? params.saved : null;
  const current = savedId ? (saved.find((report) => report.id === savedId) ?? null) : null;

  const parsed = specFromParams(params);
  let spec = parsed.spec;
  const errors = { ...parsed.errors };
  if (!spec && current && !params.dataset) spec = current.spec;

  let preview: ReportTable | null = null;
  let previewError: string | null = savedId && !current ? "This saved report doesn't exist or isn't shared with you." : null;
  if (spec) {
    try {
      preview = await previewReport(spec);
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.status >= 500) throw error;
      Object.assign(errors, error.fieldErrors);
      if (Object.keys(error.fieldErrors).length === 0) previewError = error.message;
    }
  } else if (Object.keys(errors).length && params.dataset) {
    previewError = Object.values(errors)[0] ?? null;
  }

  const unchanged = current && spec && JSON.stringify(current.spec) === JSON.stringify(spec);
  const downloads = spec
    ? unchanged && current
      ? { csv: `/api/reports/saved/${current.id}?format=csv`, xls: `/api/reports/saved/${current.id}?format=xls` }
      : { csv: `/api/reports/custom?${specToQuery(spec)}&format=csv`, xls: `/api/reports/custom?${specToQuery(spec)}&format=xls` }
    : null;
  const dataset = spec ? context.datasets.find((item) => item.id === spec.dataset) : undefined;
  const salarySpec = Boolean(dataset && (dataset.salary || spec?.columns.some((key) => dataset.columns.find((column) => column.key === key)?.salary)));

  return (
    <ReportBuilderSection
      context={context}
      spec={spec}
      errors={errors}
      preview={preview}
      previewError={previewError}
      current={current}
      downloads={downloads}
      saved={saved}
      deliveries={deliveries}
      salarySpec={salarySpec}
      tabs={<AdminTabsFor active="reports/builder" />}
    />
  );
}

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading report builder" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
