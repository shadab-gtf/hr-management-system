import type { Metadata } from "next";
import { Suspense } from "react";
import { getTrackedRequests } from "@/lib/api/requests/requests.service";
import { RequestHubSection } from "@/components/sections/requests/requests-sections";
import { PageSkeleton } from "@/components/ui/skeletons";
import { requestModuleSchema } from "@/types/requests";

export const metadata: Metadata = { title: "Request hub" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const [requests, params] = await Promise.all([getTrackedRequests(), searchParams]);
  const moduleFilter = requestModuleSchema.safeParse(params.module);
  return <RequestHubSection requests={requests} status={params.status === "closed" ? "closed" : "open"} module={moduleFilter.success ? moduleFilter.data : undefined} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading requests" variant="cards" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
