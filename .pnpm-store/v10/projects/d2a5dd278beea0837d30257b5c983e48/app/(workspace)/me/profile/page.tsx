import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEmployee } from "@/lib/api/employees/employees.service";
import { getSession } from "@/lib/api/session/session.service";
import { EmployeeProfileSection, type ProfileTab } from "@/components/sections/people/employee-profile-section";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "My profile" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function MyProfile({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [employee, query] = await Promise.all([getEmployee(session.employeeId), searchParams]);
  const tab: ProfileTab = query.tab === "employment" ? "employment" : query.tab === "personal" ? "personal" : "overview";
  return <EmployeeProfileSection employee={employee} tab={tab} basePath="/me/profile" self />;
}

export default function MyProfilePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your profile" variant="detail" />}>
      <MyProfile searchParams={searchParams} />
    </Suspense>
  );
}
