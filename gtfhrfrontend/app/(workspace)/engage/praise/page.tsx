import type { Metadata } from "next";
import { Suspense } from "react";
import { getPraiseWall } from "@/lib/api/engage/engage.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { PraiseSection } from "@/components/sections/engage/praise-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { isValidMonth, monthOf, todayInZone } from "@/lib/utils/date";
import { praiseBadgeSchema } from "@/types/engage";

export const metadata: Metadata = { title: "Praise wall" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function PraiseData({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "directory.read")) return <AccessDenied what="the praise wall" />;
  const params = await searchParams;
  const badge = praiseBadgeSchema.safeParse(params.badge);
  const scope: "received" | "given" | undefined = params.scope === "received" ? "received" : params.scope === "given" ? "given" : undefined;
  const month = typeof params.month === "string" && isValidMonth(params.month) ? params.month : undefined;
  const filters = { badge: badge.success ? badge.data : undefined, scope, month };
  return (
    <PraiseSection
      wall={await getPraiseWall(filters.badge, filters.scope, filters.month)}
      filters={filters}
      canPost={hasCapability(session, "engage.post")}
      currentMonth={monthOf(todayInZone(session.organization.timezone))}
    />
  );
}

export default function PraisePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading praise wall" variant="split" />}>
      <PraiseData searchParams={searchParams} />
    </Suspense>
  );
}
