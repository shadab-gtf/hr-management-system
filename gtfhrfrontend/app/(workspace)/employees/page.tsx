import type { Metadata } from "next";
import { Suspense } from "react";
import { getEmployeeFacets, getEmployees, getHrFormOptions } from "@/lib/api/employees/employees.service";
import { getStarred } from "@/lib/api/people/people.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { EmployeesSection } from "@/components/sections/people/employees-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { employeeFiltersSchema } from "@/types/employee";

export const metadata: Metadata = { title: "People" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function EmployeesData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "directory.read")) return <AccessDenied what="the directory" />;
  const raw = await searchParams;
  const single = (value: string | string[] | undefined) => (typeof value === "string" && value ? value : undefined);
  // URL filters are validated server-side; anything unknown falls back to defaults.
  const parsed = employeeFiltersSchema.safeParse({
    q: single(raw.q),
    department: single(raw.department),
    location: single(raw.location),
    status: single(raw.status),
    cursor: single(raw.cursor),
  });
  const starredOnly = raw.starred === "1";
  const base = parsed.success ? parsed.data : employeeFiltersSchema.parse({});
  const filters = starredOnly ? { ...base, cursor: undefined, limit: 100 } : base;
  const [list, facets, starred, hrOptions] = await Promise.all([getEmployees(filters), getEmployeeFacets(), getStarred(), hasCapability(session, "employee.create") ? getHrFormOptions() : null]);
  const shown = starredOnly
    ? { items: list.items.filter((item) => starred.includes(item.id)), meta: { ...list.meta, hasMore: false, nextCursor: null, total: list.items.filter((item) => starred.includes(item.id)).length } }
    : list;
  return <EmployeesSection list={shown} facets={facets} filters={filters} hrView={hasCapability(session, "employee.read")} starred={starred} starredOnly={starredOnly} hrOptions={hrOptions} />;
}

export default function EmployeesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading people" variant="table" />}>
      <EmployeesData searchParams={searchParams} />
    </Suspense>
  );
}
