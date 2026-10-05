import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getLetterStudio } from "@/lib/api/lifecycle/lifecycle.service";
import { LetterStudioSection } from "@/components/sections/lifecycle/letters-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Letter templates" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "letter.issue")) return <AccessDenied what="letter templates" />;
  const params = await searchParams;
  const param = (value: string | string[] | undefined, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  const selection = { templateId: param(params.template, 40), employeeId: param(params.employee, 40), purpose: param(params.purpose, 200), addressedTo: param(params.to, 120) };
  const studio = await getLetterStudio(selection.templateId || undefined, selection.employeeId || undefined, selection.purpose || undefined, selection.addressedTo || undefined);
  return <LetterStudioSection studio={studio} selection={selection} tabs={<AdminTabsFor active="letters" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading letter templates" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
