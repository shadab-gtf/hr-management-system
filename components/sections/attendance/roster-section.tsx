import Link from "next/link";
import { CancelSwapButton, DepartmentPicker, RosterGrid, RosterPatternForm, SwapRequestSheet, WeeklyOffForm } from "@/components/features/attendance/roster-controls";
import { DecisionControls } from "@/components/features/leave/decision-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, ListRow, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { decideSwapAction } from "@/lib/actions/attendance";
import { addDays, addMonths, weekday } from "@/lib/utils/date";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { leaveStatus } from "@/lib/utils/tones";
import type { MyRoster, RosterDay, RosterPlanner, ShiftSwap } from "@/types/attendance";

export function RosterTabs({ view, canPlan, anchor }: { view: "week" | "month" | "plan"; canPlan: boolean; anchor: string }) {
  return (
    <TabsNav
      label="Roster views"
      tabs={[
        { href: `/attendance/roster?week=${anchor}`, label: "My week", active: view === "week" },
        { href: `/attendance/roster?view=month&month=${anchor.slice(0, 7)}`, label: "My month", active: view === "month" },
        ...(canPlan ? [{ href: `/attendance/roster?view=plan&week=${anchor}`, label: "Team planner", active: view === "plan" }] : []),
      ]}
    />
  );
}

function dayLabel(day: RosterDay) {
  if (day.holiday) return day.holiday;
  if (day.weekOff) return "Week off";
  return day.shift ? `${day.shift.name} · ${day.shift.start}–${day.shift.end}` : "—";
}
function DayBadges({ day }: { day: RosterDay }) {
  return (
    <span className="time-actions">
      {day.holiday ? <Badge tone="info">Holiday</Badge> : day.weekOff ? <Badge>Week off</Badge> : <Badge tone="success">{day.shift?.short ?? "Shift"}</Badge>}
      {day.onLeave && <Badge tone="warning">{day.onLeave}</Badge>}
      {day.source !== "roster" && !day.weekOff && !day.holiday && <span className="small muted">dept. default</span>}
    </span>
  );
}

function SwapList({ swaps, employeeId }: { swaps: ShiftSwap[]; employeeId?: string }) {
  if (!swaps.length) return <EmptyState compact icon="swap" title="No swap requests" description="Requests to trade shifts for a day appear here." />;
  return (
    <ul className="list">
      {swaps.map((swap) => (
        <ListRow
          key={swap.id}
          title={`${swap.requester.name} ↔ ${swap.colleague.name} · ${formatDate(swap.date, "weekday")}`}
          meta={`${swap.requesterShift} ⇄ ${swap.colleagueShift} · ${swap.reason} · ${swap.reference}${swap.decisionNote ? ` · ${swap.decisionNote}` : ""}`}
          trailing={
            swap.canDecide ? (
              <DecisionControls action={decideSwapAction} id={swap.id} version={swap.version} subject={`${swap.requester.name} ↔ ${swap.colleague.name}, ${formatDate(swap.date, "medium")}`} />
            ) : swap.state === "pending" && swap.requester.id === employeeId ? (
              <CancelSwapButton id={swap.id} />
            ) : (
              <StatusBadge status={leaveStatus[swap.state]} />
            )
          }
        />
      ))}
    </ul>
  );
}

export function MyRosterSection({ roster, today, canPlan, employeeId }: { roster: MyRoster; today: string; canPlan: boolean; employeeId: string }) {
  const prev = roster.view === "week" ? `/attendance/roster?week=${addDays(roster.anchor, -7)}` : `/attendance/roster?view=month&month=${addMonths(roster.anchor.slice(0, 7), -1)}`;
  const next = roster.view === "week" ? `/attendance/roster?week=${addDays(roster.anchor, 7)}` : `/attendance/roster?view=month&month=${addMonths(roster.anchor.slice(0, 7), 1)}`;
  const working = roster.days.filter((day) => !day.weekOff && !day.holiday).length;
  const leading = (weekday(roster.days[0]?.date ?? roster.anchor) + 6) % 7;
  return (
    <div className="page">
      <PageHeader title="Shift roster" description={`${roster.department} · weekly off: ${roster.weeklyOff.label}. Attendance uses your published roster; days without one follow your department shift.`} actions={roster.swapOptions.length ? <SwapRequestSheet options={roster.swapOptions} /> : undefined} />
      <RosterTabs view={roster.view} canPlan={canPlan} anchor={roster.view === "week" ? roster.anchor : today} />
      <Card labelledBy="roster-heading">
        <CardHeader
          id="roster-heading"
          title={roster.label}
          description={`${working} working day${working === 1 ? "" : "s"}`}
          action={
            <nav className="month-nav" aria-label={roster.view === "week" ? "Change week" : "Change month"}>
              <Link className="button button--ghost icon-button" href={prev} aria-label={roster.view === "week" ? "Previous week" : "Previous month"}>
                <AppIcon name="back" />
              </Link>
              <Link className="button button--ghost icon-button" href={next} aria-label={roster.view === "week" ? "Next week" : "Next month"}>
                <AppIcon name="chevronRight" />
              </Link>
            </nav>
          }
        />
        {roster.view === "week" ? (
          <ul className="list" aria-label="My roster this week">
            {roster.days.map((day) => (
              <ListRow
                key={day.date}
                leading={
                  <span className="date-tile" data-today={day.date === today || undefined}>
                    <span>{formatDate(day.date, "weekday").split(" ")[0]}</span>
                    <strong>{day.date.slice(8)}</strong>
                  </span>
                }
                title={dayLabel(day)}
                meta={day.onLeave ? `On ${day.onLeave}` : day.source === "roster" ? "Published roster" : "Department default"}
                trailing={<DayBadges day={day} />}
              />
            ))}
          </ul>
        ) : (
          <CardBody>
            <div className="cal" role="grid" aria-label={`Roster for ${roster.label}`}>
              <div className="cal-head" role="row">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
                  <span key={name} role="columnheader">
                    {name}
                  </span>
                ))}
              </div>
              <div className="cal-grid" role="row">
                {Array.from({ length: leading }, (_, index) => (
                  <span key={`blank-${index}`} className="cal-day cal-day--blank" aria-hidden="true" />
                ))}
                {roster.days.map((day) => (
                  <div key={day.date} role="gridcell" className="cal-day" data-state={day.weekOff ? "weekly_off" : day.holiday ? "holiday" : undefined} data-tone={day.onLeave ? "info" : day.weekOff || day.holiday ? undefined : "success"} data-today={day.date === today || undefined} aria-label={`${formatDate(day.date, "long")}: ${dayLabel(day)}${day.onLeave ? `, on ${day.onLeave}` : ""}`}>
                    <span className="cal-date num">{Number(day.date.slice(8))}</span>
                    <span className="cal-meta">{day.holiday ?? (day.weekOff ? "Off" : `${day.shift?.short ?? ""} ${day.shift?.start ?? ""}`)}</span>
                    <span className="cal-mark" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        )}
      </Card>
      <Card labelledBy="swap-heading">
        <CardHeader id="swap-heading" title="Shift swaps" description="Your manager approves swaps; both rosters update on approval." />
        <SwapList swaps={roster.swaps} employeeId={employeeId} />
      </Card>
    </div>
  );
}

const statusBadge: Record<RosterPlanner["status"], { label: string; tone: "neutral" | "warning" | "success" | "info" }> = {
  none: { label: "Not planned", tone: "neutral" },
  draft: { label: "Draft — not visible to employees", tone: "warning" },
  published: { label: "Published", tone: "success" },
  changes: { label: "Published · unpublished changes", tone: "info" },
};

export function RosterPlannerSection({ planner, today }: { planner: RosterPlanner; today: string }) {
  const weekEnd = addDays(planner.weekStart, 6);
  const link = (week: string) => `/attendance/roster?view=plan&department=${encodeURIComponent(planner.department)}&week=${week}`;
  return (
    <div className="page">
      <PageHeader eyebrow="Roster planner" title={`${planner.department} roster`} description="Plan shifts and week-offs per person and day. Drafts stay private until you publish; attendance and late marks follow the published roster." actions={<DepartmentPicker departments={planner.departments} selected={planner.department} weekStart={planner.weekStart} />} />
      <RosterTabs view="plan" canPlan anchor={planner.weekStart} />
      <Card labelledBy="plan-heading">
        <CardHeader
          id="plan-heading"
          title={`Week of ${formatDate(planner.weekStart, "short")} – ${formatDate(weekEnd, "medium")}`}
          description={
            <>
              <Badge tone={statusBadge[planner.status].tone}>{statusBadge[planner.status].label}</Badge>
              {planner.publishedAt && <span className="small muted"> Last published {formatDateTime(planner.publishedAt)} by {planner.publishedBy}</span>}
            </>
          }
          action={
            <nav className="month-nav" aria-label="Change week">
              <Link className="button button--ghost icon-button" href={link(addDays(planner.weekStart, -7))} aria-label="Previous week">
                <AppIcon name="back" />
              </Link>
              <Link className="button button--ghost icon-button" href={link(addDays(planner.weekStart, 7))} aria-label="Next week">
                <AppIcon name="chevronRight" />
              </Link>
            </nav>
          }
        />
        <CardBody>
          {planner.rows.length ? (
            <RosterGrid key={`${planner.department}-${planner.weekStart}-${planner.version}`} planner={planner} today={today} />
          ) : (
            <EmptyState compact icon="team" title="No one to roster" description="People in this department who report to you appear here." />
          )}
          {weekEnd < today && <Alert tone="info">This week is over; past rosters are locked.</Alert>}
        </CardBody>
      </Card>
      <div className="split">
        <Card labelledBy="pattern-heading">
          <CardHeader id="pattern-heading" title="Bulk patterns" description="Fill the draft quickly, then fine-tune cells." />
          <CardBody>
            <RosterPatternForm planner={planner} />
          </CardBody>
        </Card>
        <Card labelledBy="woff-heading">
          <CardHeader id="woff-heading" title="Weekly-off rule" description={`${planner.department}: ${planner.weeklyOff.label}. Used where the roster says “Dept.”.`} />
          <CardBody>
            {planner.canEditWeeklyOff ? <WeeklyOffForm key={planner.department} rule={planner.weeklyOff} /> : <p className="small muted">HR sets weekly-off rules per department.</p>}
          </CardBody>
        </Card>
      </div>
      <Card labelledBy="swapq-heading">
        <CardHeader id="swapq-heading" title="Swap requests to review" />
        <SwapList swaps={planner.swapQueue} />
      </Card>
      <Card labelledBy="plan-published">
        <CardHeader id="plan-published" title="What employees see now" description="Effective shift per day from the published roster (or department default)." />
        <CardBody className="flush">
          <DataTable
            caption="Published roster"
            rows={planner.rows}
            rowKey={(row) => row.person.id}
            mobileRow={(row) => ({ title: row.person.name, meta: row.effective.map((value, index) => `${["M", "T", "W", "T", "F", "S", "S"][index]}: ${value.replace(" shift", "")}`).join(" · ") })}
            columns={[
              { key: "person", header: "Employee", rowHeader: true, cell: (row) => row.person.name },
              ...planner.dates.map((date, index) => ({ key: date, header: formatDate(date, "weekday"), cell: (row: RosterPlanner["rows"][number]) => <span className="small">{row.effective[index]}</span> })),
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
