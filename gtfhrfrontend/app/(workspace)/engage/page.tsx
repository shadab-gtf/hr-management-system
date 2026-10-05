import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getFeed } from "@/lib/api/engage/engage.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { EngageSection } from "@/components/sections/engage/engage-section";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Engage" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function FeedData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const group = typeof params.group === "string" && params.group ? params.group.slice(0, 40) : undefined;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim().slice(0, 100) : undefined;
  return (
    <EngageSection
      feed={await getFeed(group, q)}
      group={group}
      q={q}
      me={{ id: session.employeeId, initials: session.initials, firstName: session.firstName, photoUrl: session.photoUrl }}
      canPost={hasCapability(session, "engage.post")}
    />
  );
}

export default function EngagePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading feed" variant="detail" />}>
      <FeedData searchParams={searchParams} />
    </Suspense>
  );
}
