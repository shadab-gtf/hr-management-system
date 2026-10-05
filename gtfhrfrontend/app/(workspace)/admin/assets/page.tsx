import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getAssetInventory } from "@/lib/api/lifecycle/lifecycle.service";
import { AssetsAdminSection } from "@/components/sections/lifecycle/assets-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { todayInZone } from "@/lib/utils/date";
import { assetStatusSchema } from "@/types/lifecycle";
import { AdminTabsFor } from "../admin-tabs";

export const metadata: Metadata = { title: "Assets" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "asset.manage")) return <AccessDenied what="assets" />;
  const params = await searchParams;
  const status = assetStatusSchema.safeParse(params.status);
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  return <AssetsAdminSection inventory={await getAssetInventory()} status={status.success ? status.data : undefined} q={q} today={todayInZone(session.organization.timezone)} tabs={<AdminTabsFor active="assets" />} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading assets" variant="table" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
