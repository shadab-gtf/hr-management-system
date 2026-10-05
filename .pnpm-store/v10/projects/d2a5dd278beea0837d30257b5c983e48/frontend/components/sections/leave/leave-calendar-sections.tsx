import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ListRow, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { addMonths, weekday } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import type { Holiday, LeaveCalendar } from "@/types/leave";

export function LeaveTabs({ active }: { active: "apply" | "calendar" | "comp-off" | "holidays" }) {
  return (
    <TabsNav
      label="Leave views"
      tabs={[
        { href: "/leave", label: "Apply & balances", active: active === "apply" },
        { href: "/leave/calendar", label: "Leave calendar", active: active === "calendar" },
        { href: "/leave/comp-off", label: "Comp-off & encashment", active: active === "comp-off" },
        { href: "/leave/holidays", label: "Holiday calendar", active: active === "holidays" },
      ]}
    />
  );
}

export function LeaveCalendarSection({ calendar, today }: { calendar: LeaveCalendar; today: string }) {
  const leading = weekday(calendar.days[0]?.date ?? `${calendar.month}-01`);
  const busiest = [...calendar.days].sort((a, b) => b.away.length - a.away.length)[0];
  const upcoming = calendar.days.filter((day) => day.date >= today && day.away.length > 0);
  return (
    <div className="page">
      <PageHeader title="Leave calendar" description="Who’s away in your team, so you can plan coverage. Reasons stay private." />
      <LeaveTabs active="calendar" />
      <div className="split split--wide-aside">
        <Card labelledBy="lc-heading">
          <CardHeader
            id="lc-heading"
            title={formatDate(calendar.month, "month")}
            description={busiest && busiest.away.length ? `Busiest day: ${formatDate(busiest.date, "weekday")} (${busiest.away.length} away)` : "No one is away this month"}
            action={
              <nav className="month-nav" aria-label="Change month">
                <Link className="button button--ghost icon-button" href={`/leave/calendar?month=${addMonths(calendar.month, -1)}`} aria-label="Previous month">
                  <AppIcon name="back" />
                </Link>
                <Link className="button button--ghost icon-button" href={`/leave/calendar?month=${addMonths(calendar.month, 1)}`} aria-label="Next month">
                  <AppIcon name="chevronRight" />
                </Link>
              </nav>
            }
          />
          <CardBody>
            <div className="cal" role="grid" aria-label={`Team leave for ${formatDate(calendar.month, "month")}`}>
              <div className="cal-head" role="row">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <span key={day} role="columnheader">
                    {day}
                  </span>
                ))}
              </div>
              <div className="cal-grid" role="row">
                {Array.from({ length: leading }, (_, index) => (
                  <span key={`b${index}`} className="cal-day cal-day--blank" aria-hidden="true" />
                ))}
                {calendar.days.map((day) => {
                  const weekend = [0, 6].includes(weekday(day.date));
                  return (
                    <div
                      key={day.date}
                      role="gridcell"
                      className="cal-day team-day"
                      data-state={weekend ? "weekly_off" : day.holiday ? "holiday" : undefined}
                      data-today={day.date === today || undefined}
                      aria-label={`${formatDate(day.date, "long")}: ${day.holiday ?? (day.away.length ? `${day.away.length} away — ${day.away.map((a) => a.person.name).join(", ")}` : "everyone in")}`}
                    >
                      <span className="cal-date num">{Number(day.date.slice(8))}</span>
                      {day.holiday ? (
                        <span className="cal-meta">{day.holiday}</span>
                      ) : (
                        <span className="avatar-stack" aria-hidden="true">
                          {day.away.slice(0, 3).map((entry) => (
                            <Avatar key={entry.person.id} initials={entry.person.initials} seed={entry.person.id} src={entry.person.photoUrl} size="sm" className={entry.state === "pending" ? "avatar--pending" : undefined} />
                          ))}
                          {day.away.length > 3 && <span className="avatar-more num">+{day.away.length - 3}</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="legend" aria-hidden="true">
              <span><i data-tone="success" />Approved (solid avatar)</span>
              <span><i />Pending (dashed avatar)</span>
            </div>
          </CardBody>
        </Card>
        <Card labelledBy="away-heading">
          <CardHeader id="away-heading" title="Coming up" description="Upcoming absences this month" />
          {upcoming.length ? (
            <ul className="list">
              {upcoming.flatMap((day) =>
                day.away.map((entry) => (
                  <ListRow
                    key={`${day.date}-${entry.person.id}`}
                    leading={<Avatar initials={entry.person.initials} seed={entry.person.id} src={entry.person.photoUrl} />}
                    title={entry.person.name}
                    meta={`${formatDate(day.date, "weekday")} · ${entry.leaveType}${entry.half ? " (half day)" : ""}`}
                    trailing={entry.state === "pending" ? <span className="badge badge--warning">Pending</span> : undefined}
                  />
                )),
              )}
            </ul>
          ) : (
            <EmptyState compact icon="calendarCheck" title="Full team available" description="No one is scheduled to be away for the rest of this month." />
          )}
        </Card>
      </div>
    </div>
  );
}

export function HolidayCalendarSection({ holidays, today }: { holidays: Holiday[]; today: string }) {
  const byMonth = new Map<string, Holiday[]>();
  for (const holiday of holidays) byMonth.set(holiday.date.slice(0, 7), [...(byMonth.get(holiday.date.slice(0, 7)) ?? []), holiday]);
  const next = holidays.find((holiday) => holiday.date >= today);
  return (
    <div className="page">
      <PageHeader title="Holiday calendar" description="Sample calendar — HR publishes the official list for each location." />
      <LeaveTabs active="holidays" />
      {next && (
        <Card>
          <div className="holiday-hero">
            <span className="date-tile date-tile--lg">
              <span>{formatDate(next.date, "short").split(" ")[1]}</span>
              <strong>{next.date.slice(8)}</strong>
            </span>
            <div>
              <p className="small muted">Next holiday</p>
              <h2>{next.name}</h2>
              <p className="muted">{formatDate(next.date, "long")}</p>
            </div>
          </div>
        </Card>
      )}
      <div className="grid grid-3">
        {[...byMonth.entries()].map(([month, items]) => (
          <Card key={month} labelledBy={`h-${month}`}>
            <CardHeader id={`h-${month}`} title={formatDate(month, "month")} />
            <ul className="list">
              {items.map((holiday) => (
                <ListRow
                  key={holiday.date}
                  leading={
                    <span className="date-tile">
                      <span>{formatDate(holiday.date, "short").split(" ")[1]}</span>
                      <strong>{holiday.date.slice(8)}</strong>
                    </span>
                  }
                  title={holiday.name}
                  meta={formatDate(holiday.date, "weekday")}
                  trailing={holiday.kind === "optional" ? <span className="badge">Optional</span> : holiday.date < today ? <span className="badge">Past</span> : undefined}
                />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
