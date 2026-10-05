import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApiProblem } from "@/lib/api/core/problem";
import { getTicket } from "@/lib/api/helpdesk/helpdesk.service";
import { TicketDetailSection } from "@/components/sections/helpdesk/helpdesk-section";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Helpdesk request" };

type Params = Promise<{ ticketId: string }>;

async function Data({ params }: { params: Params }) {
  const { ticketId } = await params;
  const ticket = await getTicket(ticketId).catch((error: unknown) => {
    if (error instanceof ApiProblem && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  });
  return <TicketDetailSection ticket={ticket} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading request" variant="split" />}>
      <Data params={params} />
    </Suspense>
  );
}
