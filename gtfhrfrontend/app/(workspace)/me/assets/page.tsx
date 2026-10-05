import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { getMyAssets } from "@/lib/api/lifecycle/lifecycle.service";
import { MyAssetsSection } from "@/components/sections/lifecycle/assets-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "My assets" };

async function Data() {
  const session = await getSession();
  if (!session || !hasCapability(session, "asset.read.self")) return <AccessDenied what="your assets" />;
  return <MyAssetsSection data={await getMyAssets()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your assets" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
