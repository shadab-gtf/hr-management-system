import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getApprovals } from "@/lib/api/approvals/approvals.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { MoreSection } from "@/components/sections/account/account-sections";
import { PageSkeleton } from "@/components/ui/skeletons";
import { getLang } from "@/lib/i18n/server";
import { moreSectionsFor } from "@/lib/navigation";

export const metadata: Metadata = { title: "More" };

async function Data() {
  const [session, lang] = await Promise.all([getSession(), getLang()]);
  if (!session) redirect("/login");
  const pending = hasCapability(session, "approval.decide") ? (await getApprovals("pending")).length : 0;
  return <MoreSection session={session} groups={moreSectionsFor(session.capabilities, { "/approvals": pending })} lang={lang} />;
}

export default function MorePage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading" variant="cards" />}>
      <Data />
    </Suspense>
  );
}
