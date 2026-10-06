import Link from "next/link";
import { AttendanceCapture } from "@/components/features/attendance/attendance-capture";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, IconTile, ListRow, Meter, StatusBadge, StepIndicator } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatRelative, formatUnits } from "@/lib/utils/format";
import { payrollStatus } from "@/lib/utils/tones";
import type { AttendanceToday } from "@/types/attendance";
import type { HomeInsights } from "@/types/dashboard";
import type { Holiday, LeaveBalance } from "@/types/leave";
import type { PayslipSummary } from "@/types/payroll";
import type { Announcement, HomeTask } from "@/types/workplace";
import type { TrackedRequest } from "@/types/requests";
import type { TaxDeclaration } from "@/types/salary";
import type { WhoIsOut } from "@/types/home-widgets";
import type { AttendanceMonth } from "@/types/attendance";
import { fill, messages, type Lang, type Messages } from "@/lib/i18n";

type T = Messages["dashboard"];
const EN: T = messages("en").dashboard;

export function TodayCard({ today, t = EN }: { today: AttendanceToday; t?: T }) {
  return (
    <Card labelledBy="today-heading">
      <CardHeader
        id="today-heading"
        title={t.today}
        description={formatDate(today.businessDate, "long")}
        action={
          <Link href="/attendance" className="inline-link small">
            {t.viewHistory}
          </Link>
        }
      />
      <CardBody>
        <AttendanceCapture today={today} />
      </CardBody>
    </Card>
  );
}

const taskIcons: Record<HomeTask["tone"], IconName> = {
  danger: "warning",
  warning: "approvals",
  info: "info",
  neutral: "check",
};
const taskAccent = { danger: "magenta", warning: "yellow", info: "cyan", neutral: "neutral" } as const;

export function TasksCard({ tasks, t = EN }: { tasks: HomeTask[]; t?: T }) {
  return (
    <Card labelledBy="tasks-heading">
      <CardHeader id="tasks-heading" title={t.attention} description={tasks.length ? (tasks.length === 1 ? t.item : fill(t.items, { n: tasks.length })) : t.caughtUp} />
      {tasks.length ? (
        <ul className="list">
          {tasks.map((task) => (
            <ListRow
              key={task.id}
              href={task.href}
              leading={<IconTile icon={taskIcons[task.tone]} accent={taskAccent[task.tone]} />}
              title={task.title}
              meta={task.due ? `${task.detail} · Due ${formatDate(task.due, "short")}` : task.detail}
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="check" title={t.nothingPending} description={t.nothingPendingText} />
      )}
    </Card>
  );
}

export function LeaveSnapshotCard({ balances, t = EN }: { balances: LeaveBalance[]; t?: T }) {
  return (
    <Card labelledBy="leave-heading">
      <CardHeader
        id="leave-heading"
        title={t.leaveBalance}
        description={balances[0] ? fill(t.policyYear, { year: balances[0].policyYear }) : undefined}
        action={
          <ButtonLink href="/leave?new=1" size="sm" variant="secondary">
            <AppIcon name="add" size={16} />
            {t.request}
          </ButtonLink>
        }
      />
      <CardBody className="stack">
        {balances.slice(0, 3).map((balance) => (
          <div key={balance.leaveTypeId} className="balance-row">
            <div className="balance-row-head">
              <span>{balance.name}</span>
              <span className="num">
                <strong>{balance.available}</strong>
                <span className="muted"> / {balance.entitled} {t.available}</span>
              </span>
            </div>
            <Meter
              value={Number(balance.available)}
              max={Number(balance.entitled)}
              label={`${balance.name}: ${balance.available} of ${balance.entitled} days available`}
            />
            {Number(balance.reserved) > 0 && (
              <span className="small muted">{fill(t.pendingApproval, { units: formatUnits(balance.reserved) })}</span>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function PayslipHolidayCard({ payslip, holidays, t = EN }: { payslip: PayslipSummary | null; holidays: Holiday[]; t?: T }) {
  return (
    <Card labelledBy="pay-heading">
      <CardHeader id="pay-heading" title={t.payHolidays} />
      <ul className="list">
        {payslip ? (
          <ListRow
            href={`/me/payslips/${payslip.id}`}
            leading={<IconTile icon="payslip" accent="cyan" />}
            title={fill(t.payslip, { period: payslip.periodLabel })}
            meta={payslip.paymentStatus === "paid" ? t.paidHidden : t.publishedPending}
          />
        ) : (
          <ListRow leading={<IconTile icon="payslip" />} title={t.noPayslips} meta={t.noPayslipsText} />
        )}
        {holidays.slice(0, 3).map((holiday) => (
          <ListRow
            key={holiday.date}
            leading={<span className="date-tile"><span>{formatDate(holiday.date, "short").split(" ")[1]}</span><strong>{holiday.date.slice(8)}</strong></span>}
            title={holiday.name}
            meta={`${formatDate(holiday.date, "weekday")}${holiday.kind === "optional" ? ` · ${t.optional}` : ""}`}
          />
        ))}
      </ul>
    </Card>
  );
}

export function CelebrationsCard({ celebrations, t = EN }: { celebrations: HomeInsights["celebrations"]; t?: T }) {
  return (
    <Card labelledBy="celebrate-heading">
      <CardHeader id="celebrate-heading" title={t.celebrations} description={t.celebrationsHint} />
      {celebrations.length ? (
        <ul className="list">
          {celebrations.map((item) => (
            <ListRow
              key={`${item.person.id}-${item.kind}`}
              href={`/employees/${item.person.id}`}
              leading={<Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} />}
              title={item.person.name}
              meta={item.kind === "new_joiner" ? `${t.newJoiner} · ${item.detail}` : `${item.detail} · ${formatDate(item.date, "short")}`}
              trailing={<AppIcon name={item.kind === "new_joiner" ? "star" : "calendarCheck"} size={16} />}
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="star" title={t.noCelebrations} description={t.noCelebrationsText} />
      )}
    </Card>
  );
}

export function EventsCard({ events, t = EN }: { events: HomeInsights["events"]; t?: T }) {
  return (
    <Card labelledBy="events-heading">
      <CardHeader id="events-heading" title={t.events} description={t.eventsHint} />
      {events.length ? (
        <ul className="list">
          {events.map((event) => (
            <ListRow
              key={event.id}
              leading={
                <span className="date-tile" aria-hidden="true">
                  <span>{formatDate(event.date, "short").split(" ")[1] ?? ""}</span>
                  <strong>{event.date.slice(8)}</strong>
                </span>
              }
              title={event.title}
              meta={`${formatDate(event.date, "short")}${event.startTime ? ` · ${event.startTime}` : ""} · ${event.venue}`}
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="calendar" title={t.noEvents} description={t.noEventsText} />
      )}
    </Card>
  );
}

export function AnnouncementsCard({ announcements, t = EN }: { announcements: Announcement[]; t?: T }) {
  return (
    <Card labelledBy="news-heading">
      <CardHeader id="news-heading" title={t.announcements} description={t.announcementsHint} />
      <ul className="list announcements">
        {announcements.map((item) => (
          <li key={item.id} className="list-row">
            <article className="announcement">
              <div className="announcement-head">
                <IconTile icon={item.category === "it" ? "monitor" : item.category === "celebration" ? "star" : item.category === "policy" ? "document" : "megaphone"} accent={item.pinned ? "magenta" : "neutral"} />
                <div>
                  <h3>{item.title}</h3>
                  <p className="small muted">
                    {item.author} · {formatRelative(item.publishedAt)}
                    {item.pinned ? ` · ${t.pinned}` : ""}
                  </p>
                </div>
              </div>
              <p className="announcement-body">{item.body}</p>
            </article>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RoleStats({ insights, t = EN }: { insights: HomeInsights; t?: T }) {
  const { team, workforce, payroll } = insights;
  if (!team && !workforce && !payroll) return null;
  return (
    <section aria-labelledby="role-heading" className="stack">
      <h2 id="role-heading" className="sr-only">
        {t.responsibilities}
      </h2>
      <div className="grid grid-stats">
        {team && (
          <>
            <StatCard label={t.teamCheckedIn} value={`${team.checkedIn}/${team.size}`} meta={t.directReports} icon="team" accent="cyan" href="/attendance?view=team" />
            <StatCard label={t.pendingApprovals} value={team.pendingApprovals} meta={t.pendingApprovalsMeta} icon="approvals" accent="magenta" href="/approvals" />
          </>
        )}
        {workforce && (
          <>
            <StatCard label={t.headcount} value={workforce.headcount} meta={fill(t.joinedThisMonth, { n: workforce.joinersThisMonth })} icon="people" accent="cyan" href="/employees" />
            <StatCard label={t.openHr} value={workforce.openTickets} meta={fill(t.onNotice, { n: workforce.onNotice })} icon="helpdesk" accent="yellow" href="/helpdesk?scope=queue" />
          </>
        )}
        {payroll && (
          <Link href={`/payroll/runs/${payroll.runId}`} className="stat stat--link stat--wide">
            <div className="stat-top">
              <span className="stat-label">{fill(t.payrollOf, { period: payroll.periodLabel })}</span>
              <StatusBadge status={payrollStatus[payroll.state]} />
            </div>
            <StepIndicator
              label={t.payrollProgress}
              steps={t.steps.split("|")}
              current={{ draft: 0, calculating: 0, calculated: 1, in_review: 2, rejected: 1, approved: 3, published: 4, paid: 4 }[payroll.state]}
            />
            <p className="stat-meta">{fill(t.inRun, { n: payroll.employeeCount })}</p>
          </Link>
        )}
      </div>
      {workforce && (
        <Card labelledBy="dept-heading">
          <CardHeader id="dept-heading" title={t.byDepartment} description={t.activeEmployees} />
          <CardBody>
            <ul className="bar-list">
              {workforce.byDepartment.map((department) => (
                <li key={department.name}>
                  <span className="bar-label">{department.name}</span>
                  <Meter value={department.count} max={workforce.byDepartment[0]?.count ?? 1} label={`${department.name}: ${department.count}`} tone="secondary" />
                  <span className="bar-value num">{department.count}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </section>
  );
}

export function DashboardGreeting({ firstName, date, t = EN, lang = "en" }: { firstName: string; date: string; t?: T; lang?: Lang }) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const part = hour < 12 ? t.morning : hour < 17 ? t.afternoon : t.evening;
  return (
    <header className="page-header">
      <div className="page-header-text">
        <p className="page-eyebrow">
          {lang === "hi" ? <time dateTime={date}>{new Intl.DateTimeFormat("hi-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</time> : <DateText value={date} style="long" />} · IST
        </p>
        <h1 className="page-title">
          {part}, {firstName}
        </h1>
      </div>
      <div className="page-actions">
        <ButtonLink href="/leave?new=1" variant="primary">
          <AppIcon name="calendar" size={20} />
          {t.requestLeave}
        </ButtonLink>
        <ButtonLink href="/helpdesk?new=1">
          <AppIcon name="helpdesk" size={20} />
          {t.askHr}
        </ButtonLink>
      </div>
    </header>
  );
}

export function TrackCard({ requests, t = EN }: { requests: TrackedRequest[]; t?: T }) {
  const open = requests.filter((request) => request.open).slice(0, 4);
  return (
    <Card labelledBy="track-heading">
      <CardHeader
        id="track-heading"
        title={t.track}
        description={open.length ? fill(t.inProgress, { n: open.length }) : t.nothingInProgress}
        action={
          <Link href="/requests" className="inline-link small">
            {t.requestHub}
          </Link>
        }
      />
      {open.length ? (
        <ul className="list">
          {open.map((request) => (
            <ListRow key={`${request.module}-${request.id}`} href={request.href} title={request.title} meta={`${request.reference} · ${request.detail}`} trailing={<StatusBadge status={request.status} />} />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="layers" title={t.allGood} description={t.allGoodText} />
      )}
    </Card>
  );
}

const quickAccess: { href: string; key: "qaPayslips" | "qaIt" | "qaYtd" | "qaLoan" | "qaReimb" | "qaLetter"; icon: IconName }[] = [
  { href: "/me/payslips", key: "qaPayslips", icon: "payslip" },
  { href: "/salary/tax-statement", key: "qaIt", icon: "bank" },
  { href: "/salary/ytd", key: "qaYtd", icon: "trend" },
  { href: "/salary/loans", key: "qaLoan", icon: "wallet" },
  { href: "/expenses", key: "qaReimb", icon: "expenses" },
  { href: "/documents?tab=letters", key: "qaLetter", icon: "mail" },
];

export function QuickAccessCard({ t = EN }: { t?: T }) {
  return (
    <Card labelledBy="qa-heading">
      <CardHeader id="qa-heading" title={t.quickAccess} description={t.quickAccessHint} />
      <CardBody>
        <nav className="quick-grid" aria-label={t.quickAccess}>
          {quickAccess.map((item) => (
            <Link key={item.href} href={item.href} className="quick-tile">
              <IconTile icon={item.icon} accent="neutral" />
              <span>{t[item.key]}</span>
            </Link>
          ))}
        </nav>
      </CardBody>
    </Card>
  );
}

export function DeclarationCard({ declaration, t = EN }: { declaration: TaxDeclaration; t?: T }) {
  const submitted = declaration.status === "submitted";
  return (
    <Card labelledBy="itd-heading">
      <CardHeader id="itd-heading" title={t.itDeclaration} description={declaration.financialYear} />
      <CardBody className="stack">
        <div className="person">
          <IconTile icon="megaphone" accent={submitted ? "cyan" : "yellow"} />
          <p className="text-block">
            {submitted
              ? t.itSubmitted
              : declaration.window.open
                ? fill(t.itAwaiting, { date: formatDate(declaration.window.closesOn) })
                : t.itClosed}
          </p>
        </div>
        {declaration.window.open && (
          <ButtonLink href="/salary/tax-declaration" variant={submitted ? "secondary" : "primary"} size="sm">
            {submitted ? t.itReview : t.itDeclare}
          </ButtonLink>
        )}
        <p className="small muted">
          {declaration.proofWindow.open ? fill(t.proofOpen, { date: formatDate(declaration.proofWindow.closesOn) }) : fill(t.proofOpens, { date: formatDate(declaration.proofWindow.opensOn) })}
        </p>
      </CardBody>
    </Card>
  );
}

export function WhoIsOutCard({ data, t = EN }: { data: WhoIsOut; t?: T }) {
  const hint = data.scope === "team" ? t.whosOutTeam : data.scope === "department" ? t.whosOutDept : t.whosOutOrg;
  return (
    <Card labelledBy="out-heading">
      <CardHeader
        id="out-heading"
        title={t.whosOut}
        description={hint}
        action={
          <Link href="/leave/calendar" className="inline-link small">
            {t.upcomingLeave}
          </Link>
        }
      />
      {data.today.length === 0 && data.upcoming.length === 0 ? (
        <EmptyState compact icon="calendar" title={t.nobodyOut} description={t.nobodyOutText} />
      ) : (
        <ul className="list">
          {data.today.map((item) => (
            <ListRow
              key={`today-${item.person.id}`}
              leading={<Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} />}
              title={item.person.name}
              meta={`${t.outToday} · ${item.leaveType} · ${fill(t.until, { date: formatDate(item.until, "short") })}`}
            />
          ))}
          {data.upcoming.map((item) => (
            <ListRow
              key={`next-${item.person.id}-${item.from}`}
              leading={<Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} />}
              title={item.person.name}
              meta={`${item.leaveType} · ${formatDate(item.from, "short")}${item.to !== item.from ? ` – ${formatDate(item.to, "short")}` : ""}`}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MyMonthCard({ month, t = EN }: { month: AttendanceMonth; t?: T }) {
  const s = month.summary;
  const hours = `${Math.floor(s.averageWorkedMinutes / 60)}h ${String(s.averageWorkedMinutes % 60).padStart(2, "0")}m`;
  // Same tones the attendance calendar legend uses, so a colour means one thing.
  const counts = [
    { label: t.present, value: s.present, tone: "success" },
    { label: t.late, value: s.late, tone: "warning" },
    { label: t.onLeave, value: s.leave, tone: "info" },
    { label: t.review, value: s.needsReview, tone: "danger" },
  ];
  const recorded = counts.reduce((sum, c) => sum + c.value, 0);
  return (
    <Card labelledBy="mymonth-heading">
      <CardHeader
        id="mymonth-heading"
        title={t.myMonth}
        description={formatDate(month.month, "month")}
        action={
          <Link href="/attendance" className="inline-link small">
            {t.viewHistory}
          </Link>
        }
      />
      <CardBody>
        {recorded > 0 && (
          /* Shape of the month at a glance; the numbers below carry the same data. */
          <div className="month-mix" aria-hidden="true">
            {counts
              .filter((c) => c.value > 0)
              .map((c) => (
                <span key={c.label} data-tone={c.tone} style={{ width: `${(c.value * 100) / recorded}%` }} />
              ))}
          </div>
        )}
        <dl className="month-mix-stats">
          {counts.map((c) => (
            <div key={c.label} className="month-mix-stat" data-zero={c.value === 0 || undefined}>
              <dt>
                <i data-tone={c.tone} aria-hidden="true" />
                {c.label}
              </dt>
              <dd className="num">{c.value}</dd>
            </div>
          ))}
        </dl>
        <p className="month-mix-avg">
          <span>{t.avgHours}</span>
          <strong className="num">{hours}</strong>
        </p>
      </CardBody>
    </Card>
  );
}
