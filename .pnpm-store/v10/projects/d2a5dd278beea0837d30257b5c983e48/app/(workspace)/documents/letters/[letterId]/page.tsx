import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getIssuedLetter } from "@/lib/api/lifecycle/lifecycle.service";
import { IssuedLetterView } from "@/components/sections/lifecycle/letters-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Letter" };

type Params = Promise<{ letterId: string }>;

async function Data({ params }: { params: Params }) {
  const [{ letterId }, session] = await Promise.all([params, getSession()]);
  if (!session || !hasCapability(session, "document.read", "letter.issue")) return <AccessDenied what="this letter" />;
  const record = await getIssuedLetter(letterId).catch((error: unknown) => {
    if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  return <IssuedLetterView letter={record} backHref={record.person.id === session.employeeId ? "/documents?category=employment" : "/admin/letters"} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading letter" variant="detail" />}>
      <Data params={params} />
    </Suspense>
  );
}
