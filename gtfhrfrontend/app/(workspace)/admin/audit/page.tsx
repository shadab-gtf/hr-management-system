import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getAuditPage } from "@/lib/api/identity/identity.service";
import { AuditLogSection } from "@/components/sections/identity/access-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { auditFiltersSchema } from "@/types/identity";

export const metadata: Metadata = { title: "Audit log" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : undefined);

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "employee.update")) return <AccessDenied what="the audit log" />;
  const query = await searchParams;
  const parsed = auditFiltersSchema.safeParse({
    actor: one(query.actor),
    entity: one(query.entity),
    from: one(query.from),
    to: one(query.to),
    page: Number(one(query.page) ?? 1),
  });
  const filters = parsed.success ? parsed.data : { page: 1 };
  const page = await getAuditPage(filters);
  return (
    <AuditLogSection
      page={page}
      filters={{
        ...(filters.actor ? { actor: filters.actor } : {}),
        ...(filters.entity ? { entity: filters.entity } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      }}
    />
  );
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading audit log" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
