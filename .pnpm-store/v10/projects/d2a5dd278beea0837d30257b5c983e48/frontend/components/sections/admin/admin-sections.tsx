import { AnnouncementComposer, ArchiveAnnouncementButton, EditAnnouncementSheet, OnboardingTaskToggle } from "@/components/features/admin/admin-controls";
import { AddEmployeeSheet } from "@/components/features/people/employee-admin";
import type { HrFormOptions } from "@/types/hr-config";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListRow, Meter, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatRelative, humanize, pluralize } from "@/lib/utils/format";
import type { OnboardingCase, WorkforceReport } from "@/types/admin";
import type { Announcement } from "@/types/workplace";

export type AdminArea =
  | "onboarding"
  | "offboarding"
  | "requests"
  | "announcements"
  | "events"
  | "holidays"
  | "leave-policy"
  | "attendance-rules"
  | "attendance-import"
  | "organization"
  | "reports"
  | "reports/builder"
  | "settlements"
  | "assets"
  | "surveys"
  | "letters"
  | "policies"
  | "performance";

/** Admin pages grouped by job; tabs show the active page's group only. */
const adminGroups: { label: string; items: { key: AdminArea; label: string }[] }[] = [
  {
    label: "People operations",
    items: [
      { key: "onboarding", label: "Onboarding" },
      { key: "offboarding", label: "Offboarding" },
      { key: "settlements", label: "F&F settlements" },
      { key: "assets", label: "Assets" },
      { key: "requests", label: "Service requests" },
      { key: "letters", label: "Letter templates" },
    ],
  },
  { label: "Communication", items: [{ key: "announcements", label: "Announcements" }, { key: "events", label: "Events & celebrations" }, { key: "surveys", label: "Polls & surveys" }] },
  {
    label: "Policies",
    items: [
      { key: "holidays", label: "Holidays" },
      { key: "leave-policy", label: "Leave policy" },
      { key: "attendance-rules", label: "Attendance rules" },
      { key: "attendance-import", label: "Attendance import" },
      { key: "organization", label: "Organization" },
      { key: "policies", label: "Policy acknowledgements" },
    ],
  },
  { label: "Talent", items: [{ key: "performance", label: "Performance cycles" }] },
  { label: "Reports", items: [{ key: "reports", label: "Reports" }, { key: "reports/builder", label: "Report builder" }] },
];

export function AdminTabs({ active, can }: { active: AdminArea; can: Record<AdminArea, boolean> }) {
  const group = adminGroups.find((item) => item.items.some((tab) => tab.key === active));
  const tabs = (group?.items ?? []).filter((tab) => can[tab.key]).map((tab) => ({ href: `/admin/${tab.key}`, label: tab.label, active: tab.key === active }));
  if (tabs.length < 2) return null;
  return <TabsNav label={group?.label ?? "HR admin"} tabs={tabs} />;
}

export function OnboardingSection({ cases, tabs, options }: { cases: OnboardingCase[]; tabs: React.ReactNode; options: HrFormOptions | null }) {
  const total = cases.reduce((sum, item) => sum + item.tasks.length, 0);
  const done = cases.reduce((sum, item) => sum + item.tasks.filter((task) => task.done).length, 0);
  const blocked = cases.filter((item) => item.tasks.some((task) => task.blocking && !task.done)).length;
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Onboarding"
        description="Joiners from the last 30 days and upcoming. Blocking tasks must finish before payroll eligibility."
        actions={
          <>
            <ButtonLink href="/admin/onboarding/checklist" variant="secondary">
              <AppIcon name="edit" size={20} />
              Edit checklists
            </ButtonLink>
            {options && <AddEmployeeSheet options={options} />}
          </>
        }
      />
      {tabs}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Joiners" value={cases.length} meta="In the onboarding window" icon="people" accent="cyan" />
        <StatCard label="Tasks complete" value={`${done}/${total}`} meta={total ? `${Math.round((done / total) * 100)}% overall` : "No tasks"} icon="check" accent="magenta" />
        <StatCard label="Blocked" value={blocked} meta="Blocking tasks open" icon="warning" accent="yellow" />
      </div>
      {cases.length === 0 ? (
        <Card>
          <EmptyState icon="people" title="No joiners right now" description="New joiners appear here from 30 days before their start date." />
        </Card>
      ) : (
        <div className="grid grid-2">
          {cases.map((item) => {
            const complete = item.tasks.filter((task) => task.done).length;
            return (
              <Card key={item.id} labelledBy={`ob-${item.id}`}>
                <div className="card-header">
                  <div className="person">
                    <Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} size="lg" />
                    <span className="person-text">
                      <h2 id={`ob-${item.id}`}>{item.person.name}</h2>
                      <span className="person-role">
                        {item.person.designation} · {item.department} · joins {formatDate(item.joinedOn)}
                      </span>
                    </span>
                  </div>
                </div>
                <CardBody className="stack">
                  <Meter value={complete} max={item.tasks.length} label={`${complete} of ${item.tasks.length} tasks done`} tone="secondary" />
                  <ul className="task-list">
                    {item.tasks.map((task) => (
                      <li key={task.id}>
                        <OnboardingTaskToggle employeeId={item.person.id} taskId={task.id} title={task.title} done={task.done} />
                        <span className="task-meta">
                          {task.owner} · due {formatDate(task.due, "short")}
                          {task.blocking && !task.done && <span className="badge badge--danger">Blocking</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {item.manager && <p className="small muted">Manager: {item.manager.name}</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AnnouncementsAdminSection({ announcements, departments, tabs }: { announcements: Announcement[]; departments: string[]; tabs: React.ReactNode }) {
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Announcements" description="Publish now or schedule for later, to everyone or one department. Company-wide news also goes to the Engage feed." />
      {tabs}
      <div className="split split--wide-aside">
        <Card labelledBy="list-heading">
          <CardHeader id="list-heading" title="All announcements" description={`${pluralize(announcements.filter((item) => item.status === "published").length, "published item")} · ${announcements.filter((item) => item.status === "scheduled").length} scheduled`} />
          {announcements.length ? (
            <ul className="list">
              {announcements.map((item) => (
                <ListRow
                  key={item.id}
                  leading={<span className={`icon-tile avatar--${item.pinned ? "magenta" : "neutral"}`}><AppIcon name="megaphone" size={20} /></span>}
                  title={item.title}
                  meta={`${humanize(item.category)} · ${item.audience} · ${item.status === "scheduled" ? `Scheduled ${formatDateTime(item.publishedAt)}` : formatRelative(item.publishedAt)}${item.pinned ? " · Pinned" : ""}`}
                  trailing={
                    <>
                      {item.status === "scheduled" && <Badge tone="info">Scheduled</Badge>}
                      <EditAnnouncementSheet announcement={item} departments={departments} />
                      <ArchiveAnnouncementButton id={item.id} />
                    </>
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="megaphone" title="Nothing published" description="Share your first update." />
          )}
        </Card>
        <Card labelledBy="new-heading">
          <CardHeader id="new-heading" title="New announcement" />
          <CardBody>
            <AnnouncementComposer departments={departments} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Bars({ rows, tone = "secondary" }: { rows: { name: string; count: number }[]; tone?: "primary" | "secondary" }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.name}>
          <span className="bar-label">{row.name}</span>
          <Meter value={row.count} max={max} label={`${row.name}: ${row.count}`} tone={tone} />
          <span className="bar-value num">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReportsSection({ report, tabs, currentMonth }: { report: WorkforceReport; tabs: React.ReactNode; currentMonth: string }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Workforce reports"
        description={`Generated ${formatDateTime(report.generatedAt)}. Counts cover active employees in your scope.`}
        actions={
          <ButtonLink href="/api/reports/employees.csv" variant="secondary" prefetch={false}>
            <AppIcon name="download" size={20} />
            Employees CSV
          </ButtonLink>
        }
      />
      {tabs}
      <Card labelledBy="r-monthly">
        <CardHeader id="r-monthly" title="Monthly attendance report" description="Per employee: present, late, half days, leave, days needing review, worked and overtime hours. Opens in Excel." />
        <CardBody>
          <form className="inline-add" action="/api/reports/attendance.csv" method="get">
            <div className="form-field">
              <label htmlFor="report-month">Month</label>
              <input id="report-month" className="input" type="month" name="month" defaultValue={currentMonth} max={currentMonth} required />
            </div>
            <button type="submit" className="button button--primary">
              <AppIcon name="download" size={20} />
              Download CSV
            </button>
          </form>
        </CardBody>
      </Card>
      <div className="grid grid-stats">
        <StatCard label="Headcount" value={report.headcount} meta="Active employees" icon="people" accent="cyan" />
        <StatCard label="Present today" value={report.attendanceToday.present} meta={`${report.attendanceToday.notRecorded} not recorded`} icon="attendance" accent="magenta" />
        <StatCard label="On leave today" value={report.attendanceToday.onLeave} meta="Approved leave or off" icon="calendar" accent="yellow" />
        <StatCard label="Joined this month" value={report.byDepartment.reduce((sum, row) => sum + row.joiners, 0)} meta="New employees" icon="star" />
      </div>
      <div className="grid grid-2">
        <Card labelledBy="r-dept">
          <CardHeader id="r-dept" title="By department" />
          <CardBody>
            <Bars rows={report.byDepartment} />
          </CardBody>
        </Card>
        <Card labelledBy="r-loc">
          <CardHeader id="r-loc" title="By location" />
          <CardBody>
            <Bars rows={report.byLocation} tone="primary" />
          </CardBody>
        </Card>
        <Card labelledBy="r-tenure">
          <CardHeader id="r-tenure" title="Tenure" />
          <CardBody>
            <Bars rows={report.tenure.map((row) => ({ name: row.band, count: row.count }))} />
          </CardBody>
        </Card>
        <Card labelledBy="r-type">
          <CardHeader id="r-type" title="Employment type" />
          <CardBody>
            <Bars rows={report.byType} tone="primary" />
          </CardBody>
        </Card>
      </div>
      <Card labelledBy="r-leave">
        <CardHeader id="r-leave" title="Leave utilization" description="Approved days against annual entitlement (all employees)" />
        <CardBody className="flush">
          <DataTable
            caption="Leave utilization"
            rows={report.leaveUtilization}
            rowKey={(row) => row.type}
            columns={[
              { key: "type", header: "Leave type", rowHeader: true, cell: (row) => row.type },
              { key: "used", header: "Used days", align: "end", cell: (row) => <span className="num">{row.usedDays}</span> },
              { key: "ent", header: "Entitled days", align: "end", cell: (row) => <span className="num">{row.entitledDays}</span> },
              { key: "pct", header: "Utilization", align: "end", cell: (row) => <span className="num">{Number(row.entitledDays) ? `${((Number(row.usedDays) / Number(row.entitledDays)) * 100).toFixed(1)}%` : "—"}</span> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
