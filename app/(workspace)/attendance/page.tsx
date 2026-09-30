import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAttendanceMonth, getAttendanceToday, getTeamAttendance } from "@/lib/api/attendance/attendance.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import {
  AttendanceHeader,
  AttendanceTabs,
  MyAttendanceSection,
  TeamAttendanceSection,
} from "@/components/sections/attendance/attendance-section";
import { CardSkeleton, StatsSkeleton } from "@/components/ui/skeletons";
import { isValidMonth, monthOf, todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Attendance" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Mine({ month, currentMonth, correct }: { month: string; currentMonth: string; correct: string | undefined }) {
  const [today, days] = await Promise.all([getAttendanceToday(), getAttendanceMonth(month)]);
  return <MyAttendanceSection today={today} month={days} currentMonth={currentMonth} correctDate={correct} />;
}
async function Team() {
  return <TeamAttendanceSection rows={await getTeamAttendance()} />;
}

export default async function AttendancePage({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const canTeam = hasCapability(session, "attendance.read.team");
  const view = params.view === "team" && canTeam ? "team" : "me";
  const currentMonth = monthOf(todayInZone(session.organization.timezone));
  const requested = typeof params.month === "string" ? params.month : undefined;
  const month = isValidMonth(requested) && requested <= currentMonth ? requested : currentMonth;
  const correct = typeof params.correct === "string" ? params.correct : undefined;

  return (
    <div className="page">
      <AttendanceHeader />
      <AttendanceTabs view={view} team={canTeam} />
      <Suspense
        key={`${view}-${month}`}
        fallback={
          <>
            <StatsSkeleton />
            <CardSkeleton rows={5} tall />
          </>
        }
      >
        {view === "team" ? <Team /> : <Mine month={month} currentMonth={currentMonth} correct={correct} />}
      </Suspense>
    </div>
  );
}
