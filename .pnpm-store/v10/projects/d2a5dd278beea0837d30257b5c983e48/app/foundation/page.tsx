import { Suspense } from "react";
import { cookies } from "next/headers";
import { getFoundation } from "@/lib/api/foundation/foundation.service";
import { parseTheme } from "@/lib/utils/theme";
import { WorkspaceShell } from "@/components/sections/foundation/workspace-shell";
import { FoundationSection } from "@/components/sections/foundation/foundation-section";
import { FoundationSkeleton } from "@/components/ui/skeleton";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { foundationPeopleKey, makeQueryClient } from "@/lib/state/query-client";
import { BoneBoundary } from "@/components/ui/bone-boundary";
import { apiConfig } from "@/lib/api/core/config";
import { notFound } from "next/navigation";

async function FoundationData() {
  const data = await getFoundation();
  const queryClient = makeQueryClient();
  queryClient.setQueryData(foundationPeopleKey, data.members);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BoneBoundary>
        <FoundationSection data={data} />
      </BoneBoundary>
    </HydrationBoundary>
  );
}
export default async function FoundationPage() {
  if (apiConfig.mode !== "mock") notFound();
  const theme = parseTheme((await cookies()).get("gtf-theme")?.value);
  return (
    <WorkspaceShell theme={theme}>
      <Suspense fallback={<FoundationSkeleton />}>
        <FoundationData />
      </Suspense>
    </WorkspaceShell>
  );
}
