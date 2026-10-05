import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getOfferLetter } from "@/lib/api/recruitment/recruitment.service";
import { OfferLetterSection } from "@/components/sections/recruitment/offer-letter-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Offer letter" };

type Params = Promise<{ candidateId: string }>;

async function LetterData({ params }: { params: Params }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "recruitment.manage")) return <AccessDenied what="offer letters" />;
  const { candidateId } = await params;
  const offer = await getOfferLetter(candidateId).catch((error: unknown) => {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  });
  return <OfferLetterSection offer={offer} today={todayInZone(session.organization.timezone)} />;
}

export default function OfferLetterPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading offer letter" variant="detail" />}>
      <LetterData params={params} />
    </Suspense>
  );
}
