import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAnnouncements } from "@/lib/api/announcements/announcements.service";
import {
  getAttendanceMonth,
  getAttendanceToday,
} from "@/lib/api/attendance/attendance.service";
import {
  getHomeInsights,
  getWhoIsOut,
} from "@/lib/api/dashboard/dashboard.service";
import { getLeaveOverview } from "@/lib/api/leave/leave.service";
import { getPayslips } from "@/lib/api/payslips/payslips.service";
import { getTrackedRequests } from "@/lib/api/requests/requests.service";
import { getTaxDeclaration } from "@/lib/api/salary/salary.service";
import { getSession, hasCapability } from "@/lib/api/session/session.service";
import {
  AnnouncementsCard,
  CelebrationsCard,
  DashboardGreeting,
  DeclarationCard,
  EventsCard,
  LeaveSnapshotCard,
  MyMonthCard,
  PayslipHolidayCard,
  QuickAccessCard,
  RoleStats,
  TasksCard,
  TodayCard,
  TrackCard,
  WhoIsOutCard,
} from "@/components/sections/dashboard/dashboard-sections";
import { CardSkeleton, StatsSkeleton } from "@/components/ui/skeletons";
import { NoAccessSection } from "@/components/sections/identity/no-access-section";
import { messages, type Messages } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { todayInZone } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Home" };

type T = Messages["dashboard"];

/* Each card streams independently under its own skeleton. */
async function Today({ t }: { t: T }) {
  return <TodayCard today={await getAttendanceToday()} t={t} />;
}
async function Insights({
  part,
  t,
}: {
  part: "tasks" | "roles" | "celebrations" | "events";
  t: T;
}) {
  const insights = await getHomeInsights();
  if (part === "tasks") return <TasksCard tasks={insights.tasks} t={t} />;
  if (part === "celebrations")
    return <CelebrationsCard celebrations={insights.celebrations} t={t} />;
  if (part === "events") return <EventsCard events={insights.events} t={t} />;
  return <RoleStats insights={insights} t={t} />;
}
async function Leave({ t }: { t: T }) {
  return (
    <LeaveSnapshotCard balances={(await getLeaveOverview()).balances} t={t} />
  );
}
async function Track({ t }: { t: T }) {
  return <TrackCard requests={await getTrackedRequests()} t={t} />;
}
async function Declaration({ t }: { t: T }) {
  return <DeclarationCard declaration={await getTaxDeclaration()} t={t} />;
}
async function PayAndHolidays({ t }: { t: T }) {
  const [payslips, leave] = await Promise.all([
    getPayslips(),
    getLeaveOverview(),
  ]);
  return (
    <PayslipHolidayCard
      payslip={payslips[0] ?? null}
      holidays={leave.holidays}
      t={t}
    />
  );
}
async function News({ t }: { t: T }) {
  return (
    <AnnouncementsCard
      announcements={(await getAnnouncements()).slice(0, 4)}
      t={t}
    />
  );
}
async function WhoIsOut({ t }: { t: T }) {
  return <WhoIsOutCard data={await getWhoIsOut()} t={t} />;
}
async function MyMonth({ month, t }: { month: string; t: T }) {
  return <MyMonthCard month={await getAttendanceMonth(month)} t={t} />;
}

export default async function DashboardPage() {
  const [session, lang] = await Promise.all([getSession(), getLang()]);
  if (!session) redirect("/login");
  // Deny by default: nothing granted yet, so explain how to get access instead of empty cards.
  if (session.capabilities.length === 0)
    return (
      <div className="page">
        <NoAccessSection session={session} />
      </div>
    );
  const t = messages(lang).dashboard;
  const today = todayInZone(session.organization.timezone);
  const canDeclare = hasCapability(session, "tax.declare.self");
  return (
    <div className="page">
      <DashboardGreeting
        firstName={session.firstName}
        date={today}
        t={t}
        lang={lang}
      />
      <Suspense fallback={<StatsSkeleton count={2} />}>
        <Insights part="roles" t={t} />
      </Suspense>
      <div className="grid grid-home">
        <Suspense fallback={<CardSkeleton rows={1} tall />}>
          <Today t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <Insights part="tasks" t={t} />
        </Suspense>
      </div>
      <div className="grid grid-3">
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <Leave t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <Track t={t} />
        </Suspense>
        {canDeclare ? (
          <Suspense fallback={<CardSkeleton rows={2} />}>
            <Declaration t={t} />
          </Suspense>
        ) : (
          <QuickAccessCard t={t} />
        )}
      </div>
      <div className="grid grid-3">
        {canDeclare && <QuickAccessCard t={t} />}
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <PayAndHolidays t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <Insights part="celebrations" t={t} />
        </Suspense>
      </div>
      <div className="grid grid-2">
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <WhoIsOut t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <MyMonth month={today.slice(0, 7)} t={t} />
        </Suspense>
      </div>
      <div className="grid grid-news">
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <News t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <Insights part="events" t={t} />
        </Suspense>
      </div>
    </div>
  );
}
