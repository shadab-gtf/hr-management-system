import type { Metadata } from "next";
import { Suspense } from "react";
import { getTaxDeclaration } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { TaxDeclarationSection } from "@/components/sections/salary/salary-sections";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "IT declaration" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "tax.declare.self")) return <AccessDenied what="IT declaration" />;
  return <TaxDeclarationSection declaration={await getTaxDeclaration()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading IT declaration" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
