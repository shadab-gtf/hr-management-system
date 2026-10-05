import type { Metadata } from "next";
import { Suspense } from "react";
import { getSalaryStructures } from "@/lib/api/payroll/structures.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { StructuresSection } from "@/components/sections/payroll/structures-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Salary structures" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : undefined);

async function Data({ searchParams }: { searchParams: Search }) {
  const [session, raw] = await Promise.all([getSession(), searchParams]);
  if (!session || !hasCapability(session, "compensation.manage", "payroll.approve")) return <AccessDenied what="salary structures" />;
  const data = await getSalaryStructures(one(raw.ctc)?.replace(/[,\s₹]/g, ""), one(raw.template), one(raw.state), one(raw.regime));
  return <StructuresSection data={data} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading salary structures" variant="cards" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
