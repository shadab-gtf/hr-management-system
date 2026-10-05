import type { Metadata } from "next";
import { Suspense } from "react";
import { getAttendanceMonth } from "@/lib/api/attendance/attendance.service";
import { getTrackedRequests } from "@/lib/api/requests/requests.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AttendanceRequestsSection } from "@/components/sections/attendance/attendance-requests-section";
import { AccessDenied } from "@/components/ui/error-state";
import { PageSkeleton } from "@/components/ui/skeletons";
import { addMonths, monthOf, todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Regularization & permission" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Data({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session || !hasCapability(session, "attendance.regularize.request")) return <AccessDenied what="attendance requests" />;
  const today = todayInZone(session.organization.timezone);
  const month = monthOf(today);
  const [current, previous, requests, params] = await Promise.all([getAttendanceMonth(month), getAttendanceMonth(addMonths(month, -1)), getTrackedRequests(), searchParams]);
  const exceptions = [...current.days, ...previous.days].filter((day) => day.state === "needs_review").sort((a, b) => b.date.localeCompare(a.date));
  return (
    <AttendanceRequestsSection
      exceptions={exceptions}
      requests={requests.filter((request) => request.module === "regularization" || request.module === "permission")}
      today={today}
      openPermission={params.new === "permission"}
      correctDate={typeof params.correct === "string" ? params.correct : undefined}
    />
  );
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading attendance requests" variant="split" />}>
      <Data searchParams={searchParams} />
    </Suspense>
  );
}
