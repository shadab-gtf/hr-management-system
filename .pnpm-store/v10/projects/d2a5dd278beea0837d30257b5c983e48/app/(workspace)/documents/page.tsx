import type { Metadata } from "next";
import { Suspense } from "react";
import { getDocuments } from "@/lib/api/documents/documents.service";
import { getPayslips } from "@/lib/api/payslips/payslips.service";
import { getLetters } from "@/lib/api/requests/requests.service";
import { getMyPolicies } from "@/lib/api/lifecycle/lifecycle.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { DocumentsSection } from "@/components/sections/documents/documents-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { documentSchema } from "@/types/workplace";

export const metadata: Metadata = { title: "Document center" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function DocumentsData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "document.read")) return <AccessDenied what="documents" />;
  const params = await searchParams;
  const category = documentSchema.shape.category.safeParse(params.category);
  const [documents, letters, payslips, policies] = await Promise.all([
    getDocuments(),
    hasCapability(session, "letter.request.self") ? getLetters() : Promise.resolve([]),
    hasCapability(session, "payslip.read.self") ? getPayslips() : Promise.resolve([]),
    getMyPolicies(),
  ]);
  return (
    <DocumentsSection
      documents={documents}
      letters={letters}
      policies={policies}
      tab={params.tab === "letters" ? "letters" : params.tab === "policies" ? "policies" : "all"}
      category={category.success ? category.data : undefined}
      payslipCount={payslips.length}
    />
  );
}

export default function DocumentsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading documents" variant="cards" />}>
      <DocumentsData searchParams={searchParams} />
    </Suspense>
  );
}
