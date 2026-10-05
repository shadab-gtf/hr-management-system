import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getResignationView } from "@/lib/api/lifecycle/lifecycle.service";
import { ResignationSection } from "@/components/sections/lifecycle/resignation-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Resignation" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "exit.request.self")) return <AccessDenied what="resignation" />;
  return <ResignationSection view={await getResignationView()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading resignation" variant="split" />}>
      <Data />
    </Suspense>
  );
}
