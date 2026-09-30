import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getEmployee, getHrFormOptions } from "@/lib/api/employees/employees.service";
import { getSession } from "@/lib/api/session/session.service";
import { EmployeeProfileSection, type ProfileTab } from "@/components/sections/people/employee-profile-section";
import { PageSkeleton } from "@/components/ui/skeletons";

// Generic title: employee names never appear in document titles.
export const metadata: Metadata = { title: "Employee profile" };

type Params = Promise<{ employeeId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

async function ProfileData({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ employeeId }, query, session] = await Promise.all([params, searchParams, getSession()]);
  const employee = await getEmployee(employeeId).catch((error: unknown) => {
    // Not-found and out-of-scope are indistinguishable by design.
    if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  const requested = query.tab;
  const tab: ProfileTab =
    requested === "employment" ? "employment" : requested === "personal" && employee.permissions.canViewPrivate ? "personal" : "overview";
  const hrOptions = employee.permissions.canEdit ? await getHrFormOptions() : null;
  return <EmployeeProfileSection employee={employee} tab={tab} basePath={`/employees/${employeeId}`} self={session?.employeeId === employeeId} hrOptions={hrOptions} />;
}

export default function EmployeePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading profile" variant="detail" />}>
      <ProfileData params={params} searchParams={searchParams} />
    </Suspense>
  );
}
