import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getLeavePolicy, getLeavePolicyVersion } from "@/lib/api/config/config.service";
import { getLeaveLedger, getLedgerPeople, getYearEnd } from "@/lib/api/leave/leave.service";
import { LeavePolicySection } from "@/components/sections/admin/config-sections";
import { HrLedgerCard, TimeAuditCard, YearEndCard } from "@/components/sections/leave/leave-admin-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Leave policy" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "policy.publish")) return <AccessDenied what="leave policy" />;
  const params = await searchParams;
  const people = await getLedgerPeople();
  const requested = typeof params.employee === "string" && people.some((person) => person.id === params.employee) ? params.employee : (people.find((person) => person.id === "emp_0007") ?? people[0])?.id;
  const [types, version, yearEnd, ledger] = await Promise.all([getLeavePolicy(), getLeavePolicyVersion(), getYearEnd(), getLeaveLedger(requested)]);
  return (
    <LeavePolicySection types={types} version={version} tabs={<AdminTabsFor active="leave-policy" />}>
      <YearEndCard data={yearEnd} />
      <HrLedgerCard ledger={ledger} people={people} active={typeof params.ledger === "string" ? params.ledger : undefined} />
      <TimeAuditCard items={yearEnd.audit} />
    </LeavePolicySection>
  );
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading leave policy" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
