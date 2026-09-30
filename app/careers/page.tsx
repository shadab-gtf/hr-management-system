import type { Metadata } from "next";
import { Suspense } from "react";
import { getPublicJobs } from "@/lib/api/recruitment/recruitment.service";
import { CareersListSection } from "@/components/sections/recruitment/careers-sections";
import { PageSkeleton } from "@/components/ui/skeletons";

export const metadata: Metadata = { title: "Careers at GTF Technologies", description: "Open roles at GTF Technologies." };

async function CareersData() {
  return <CareersListSection jobs={await getPublicJobs()} />;
}

export default function CareersPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading careers" variant="cards" />}>
      <CareersData />
    </Suspense>
  );
}
