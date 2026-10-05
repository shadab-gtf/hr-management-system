import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getTicketCategories, getTickets } from "@/lib/api/helpdesk/helpdesk.service";
import { HelpdeskSection } from "@/components/sections/helpdesk/helpdesk-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Helpdesk" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function HelpdeskData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "helpdesk.request.self", "helpdesk.queue")) return <AccessDenied what="the helpdesk" />;
  const params = await searchParams;
  const canQueue = hasCapability(session, "helpdesk.queue");
  const scope = params.scope === "queue" && canQueue ? "queue" : "mine";
  const [tickets, categories] = await Promise.all([getTickets(scope), getTicketCategories()]);
  return <HelpdeskSection tickets={tickets} categories={categories} scope={scope} status={params.status === "closed" ? "closed" : "active"} canQueue={canQueue} openNew={params.new === "1"} />;
}

export default function HelpdeskPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading helpdesk" variant="cards" />}>
      <HelpdeskData searchParams={searchParams} />
    </Suspense>
  );
}
