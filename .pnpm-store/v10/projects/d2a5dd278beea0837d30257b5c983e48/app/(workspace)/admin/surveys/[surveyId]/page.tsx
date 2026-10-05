import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getSurveyAdmin, getSurveyDetail, getSurveyResults } from "@/lib/api/engage/surveys.service";
import { SurveyBuilderSection, SurveyResultsSection } from "@/components/sections/engage/surveys-admin-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { AdminTabsFor } from "../../admin-tabs";

export const metadata: Metadata = { title: "Survey" };

type Params = Promise<{ surveyId: string }>;

async function load(surveyId: string) {
  try {
    const survey = await getSurveyDetail(surveyId);
    if (survey.state === "draft") return { kind: "draft" as const, survey, departments: (await getSurveyAdmin()).departments };
    return { kind: "results" as const, results: await getSurveyResults(surveyId) };
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 404) return null;
    throw error;
  }
}

async function Data({ params }: { params: Params }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "survey.manage")) return <AccessDenied what="surveys" />;
  const { surveyId } = await params;
  const data = await load(surveyId);
  if (!data) notFound();
  const tabs = <AdminTabsFor active="surveys" />;
  if (data.kind === "draft") return <SurveyBuilderSection survey={data.survey} departments={data.departments} today={todayInZone(session.organization.timezone)} tabs={tabs} />;
  return <SurveyResultsSection results={data.results} tabs={tabs} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading survey" variant="split" />}>
      <Data params={params} />
    </Suspense>
  );
}
