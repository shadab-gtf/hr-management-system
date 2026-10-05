import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api/session/session.service";
import { getSecurityOverview } from "@/lib/api/identity/identity.service";
import { SecuritySection } from "@/components/sections/identity/security-sections";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Sign-in & security", referrer: "no-referrer" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/settings/security");
  const [overview, query] = await Promise.all([getSecurityOverview(), searchParams]);
  return <SecuritySection overview={overview} enroll={query.enroll === "1"} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading security settings" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
