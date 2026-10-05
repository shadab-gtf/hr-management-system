import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getForm16, getForm16Status } from "@/lib/api/salary/form16.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { Form16Section } from "@/components/sections/salary/form16-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Form 16" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (typeof value === "string" && /^[\w-]{1,20}$/.test(value) ? value : undefined);

async function Data({ searchParams }: { searchParams: Search }) {
  const [session, raw] = await Promise.all([getSession(), searchParams]);
  if (!session || !hasCapability(session, "payslip.read.self")) return <AccessDenied what="Form 16" />;
  const fy = one(raw.fy);
  const employee = one(raw.employee);
  const manager = hasCapability(session, "statutory.manage");
  if (employee && !manager) notFound();
  const [form, status] = await Promise.all([
    getForm16(fy, employee).catch((error: unknown) => {
      if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
      throw error;
    }),
    manager ? getForm16Status(fy) : Promise.resolve(null),
  ]);
  return <Form16Section form={form} status={status} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading Form 16" variant="detail" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
