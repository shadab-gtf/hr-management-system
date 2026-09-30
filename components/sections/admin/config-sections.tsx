import type { ReactNode } from "react";
import {
  AddLocationForm,
  CancelEventButton,
  CelebrationSettingsForm,
  ChecklistTaskSheet,
  DepartmentSheet,
  EventSheet,
  HolidaySheet,
  LeaveTypeSheet,
  ProbationForm,
  RemoveChecklistTaskButton,
  RemoveDepartmentButton,
  RemoveHolidayButton,
  RemoveLocationButton,
  RemoveSiteButton,
  ServiceDecision,
  ShiftSheet,
  ShiftRowActions,
  DepartmentShiftSelect,
  OvertimeForm,
  LateEarlyForm,
  SiteSheet,
} from "@/components/features/admin/config-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, ListRow, PersonCell, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatRelative, pluralize } from "@/lib/utils/format";
import type { PersonRef } from "@/types/common";
import type {
  AttendanceRules,
  CelebrationSettings,
  Checklists,
  CompanyEvent,
  HolidayRecord,
  LeaveTypeConfig,
  OrganizationConfig,
  ServiceRequest,
} from "@/types/hr-config";

const kindLabel: Record<HolidayRecord["kind"], { label: string; tone: "info" | "success" | "neutral" }> = {
  national: { label: "National", tone: "info" },
  festival: { label: "Festival", tone: "success" },
  optional: { label: "Optional", tone: "neutral" },
};

/* Holidays ----------------------------------------------------------------- */

export function HolidaysAdminSection({ holidays, locations, today, year, tabs }: { holidays: HolidayRecord[]; locations: string[]; today: string; year: string; tabs: ReactNode }) {
  const years = [...new Set([today.slice(0, 4), ...holidays.map((h) => h.date.slice(0, 4))])].sort();
  const shown = holidays.filter((holiday) => holiday.date.startsWith(year));
  const upcoming = shown.filter((holiday) => holiday.date >= today);
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Holidays" description="The calendar employees see, and what leave and attendance skip. Location-specific holidays apply only to people based there." actions={<HolidaySheet locations={locations} />} />
      {tabs}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label={`Holidays in ${year}`} value={shown.length} meta={`${shown.filter((h) => h.kind !== "optional").length} paid`} icon="calendar" accent="magenta" />
        <StatCard label="Upcoming" value={upcoming.length} meta={upcoming[0] ? `Next: ${upcoming[0].name}, ${formatDate(upcoming[0].date, "short")}` : "None left this year"} icon="calendarCheck" accent="cyan" />
        <StatCard label="Optional" value={shown.filter((h) => h.kind === "optional").length} meta="Employee chooses; not auto-skipped" icon="star" accent="yellow" />
      </div>
      <TabsNav label="Year" tabs={years.map((y) => ({ href: `/admin/holidays?year=${y}`, label: y, active: y === year }))} />
      <Card labelledBy="hol-table">
        <CardHeader id="hol-table" title={`${year} calendar`} description="Past holidays are locked — they are part of attendance history." />
        <CardBody className="flush">
          <DataTable
            caption={`Holidays ${year}`}
            rows={shown}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="calendar" title={`No holidays for ${year}`} description="Add the approved list for each location." />}
            mobileRow={(row) => ({
              title: row.name,
              meta: `${formatDate(row.date)} · ${row.locations.length ? row.locations.join(", ") : "All locations"}`,
              trailing: (
                <>
                  <Badge tone={kindLabel[row.kind].tone}>{kindLabel[row.kind].label}</Badge>
                  <HolidaySheet holiday={row} locations={locations} />
                  <RemoveHolidayButton id={row.id} past={row.date < today} />
                </>
              ),
            })}
            columns={[
              { key: "date", header: "Date", cell: (row) => <DateText value={row.date} /> },
              { key: "name", header: "Holiday", rowHeader: true, cell: (row) => row.name },
              { key: "kind", header: "Type", cell: (row) => <Badge tone={kindLabel[row.kind].tone}>{kindLabel[row.kind].label}</Badge> },
              { key: "where", header: "Applies to", cell: (row) => (row.locations.length ? row.locations.join(", ") : "All locations") },
              {
                key: "actions",
                header: "Actions",
                align: "end",
                cell: (row) => (
                  <span className="row-actions">
                    <HolidaySheet holiday={row} locations={locations} />
                    <RemoveHolidayButton id={row.id} past={row.date < today} />
                  </span>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/* Events ------------------------------------------------------------------- */

const eventIcon: Record<CompanyEvent["category"], "megaphone" | "star" | "briefcase" | "location" | "calendar"> = {
  town_hall: "megaphone",
  celebration: "star",
  training: "briefcase",
  offsite: "location",
  other: "calendar",
};

export function EventsAdminSection({ events, celebrations, departments, today, tabs }: { events: CompanyEvent[]; celebrations: CelebrationSettings; departments: string[]; today: string; tabs: ReactNode }) {
  const upcoming = events.filter((event) => event.date >= today);
  const past = events.filter((event) => event.date < today).reverse();
  const row = (event: CompanyEvent, editable: boolean) => (
    <ListRow
      key={event.id}
      leading={<span className="icon-tile avatar--cyan"><AppIcon name={eventIcon[event.category]} size={20} /></span>}
      title={event.title}
      meta={`${formatDate(event.date)}${event.startTime ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : ""} · ${event.venue} · ${event.audience}`}
      trailing={
        editable ? (
          <>
            <EventSheet event={event} departments={departments} today={today} />
            <CancelEventButton id={event.id} />
          </>
        ) : undefined
      }
    />
  );
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Events & celebrations" description="Company events appear on Home for their audience. Choose which celebrations are shown." actions={<EventSheet departments={departments} today={today} />} />
      {tabs}
      <div className="split split--wide-aside">
        <Card labelledBy="ev-up">
          <CardHeader id="ev-up" title="Upcoming events" description={pluralize(upcoming.length, "event")} />
          {upcoming.length ? <ul className="list">{upcoming.map((event) => row(event, true))}</ul> : <EmptyState compact icon="calendar" title="No upcoming events" description="Plan a town hall, training or celebration." />}
          {past.length > 0 && (
            <>
              <CardHeader id="ev-past" title="Past events" />
              <ul className="list">{past.slice(0, 5).map((event) => row(event, false))}</ul>
            </>
          )}
        </Card>
        <Card labelledBy="cel-heading">
          <CardHeader id="cel-heading" title="Celebrations on Home" description="Shown to everyone in the Celebrations card." />
          <CardBody>
            <CelebrationSettingsForm settings={celebrations} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* Leave policy ------------------------------------------------------------- */

const accrualLabel: Record<LeaveTypeConfig["accrual"], string> = { annual_upfront: "Yearly upfront", monthly: "Monthly", none: "Earned / none" };
function ruleSummary(row: LeaveTypeConfig): string {
  const parts = [
    row.minNoticeDays ? `${row.minNoticeDays}d notice` : null,
    row.backdateDays ? `backdate ${row.backdateDays}d` : null,
    row.maxConsecutiveDays ? `max ${row.maxConsecutiveDays}d in a row` : null,
    row.sandwich ? "sandwich" : null,
    Number(row.negativeDays) > 0 ? `−${row.negativeDays}d allowed` : null,
    row.encashable ? `encash ≤${row.maxEncashDays}d, keep ${row.minRetainDays}` : null,
    row.gender !== "any" ? `${row.gender} only` : null,
    row.employmentTypes.length < 3 ? row.employmentTypes.map((type) => (type === "full_time" ? "full-time" : type)).join("/") : null,
    row.afterProbationOnly ? "after probation" : null,
    row.minServiceDays ? `${row.minServiceDays}d service` : null,
    row.documentAfterDays !== null ? (row.documentAfterDays === 0 ? "document always" : `document > ${row.documentAfterDays}d`) : null,
    row.expiryDays ? `expires in ${row.expiryDays}d` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "No extra rules";
}

export function LeavePolicySection({ types, version, tabs, children }: { types: LeaveTypeConfig[]; version: string; tabs: ReactNode; children?: ReactNode }) {
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Leave policy" description="Each leave type has its own yearly balance. When an employee takes 2 of 3 sick days, 1 sick day remains; other types are unaffected." actions={<LeaveTypeSheet />} />
      {tabs}
      <Alert tone="info" title={`Current version ${version}`}>
        Short absences of up to 3 hours are handled as <strong>permissions</strong> (2 per month) under Attendance, and half days are chosen per request on types that allow them.
      </Alert>
      <Card labelledBy="lt-table">
        <CardHeader id="lt-table" title="Leave types" />
        <CardBody className="flush">
          <DataTable
            caption="Leave types"
            rows={types}
            rowKey={(row) => row.id}
            mobileRow={(row) => ({
              title: `${row.name} (${row.code})`,
              meta: `${row.entitledDays === null ? "Unlimited" : `${row.entitledDays} days/yr`} · ${accrualLabel[row.accrual]} · carry ${row.carryForwardDays} · ${row.allowHalfDay ? "half days" : "full days"}${row.countsAsPresent ? " · counts as working" : ""} · ${ruleSummary(row)}`,
              trailing: (
                <>
                  {!row.active && <Badge>Inactive</Badge>}
                  <LeaveTypeSheet type={row} />
                </>
              ),
            })}
            columns={[
              { key: "name", header: "Type", rowHeader: true, cell: (row) => <span>{row.name} <span className="muted num">{row.code}</span></span> },
              { key: "days", header: "Days / year", align: "end", cell: (row) => <span className="num">{row.entitledDays ?? "Unlimited"}</span> },
              { key: "accrual", header: "Accrual", cell: (row) => accrualLabel[row.accrual] },
              { key: "cf", header: "Carry forward", align: "end", cell: (row) => <span className="num">{row.carryForwardDays}</span> },
              { key: "rules", header: "Rules", className: "cell-wrap", hideOnMobile: true, cell: (row) => <span className="small">{ruleSummary(row)}</span> },
              { key: "half", header: "Half days", cell: (row) => (row.allowHalfDay ? "Allowed" : "No") },
              { key: "present", header: "Counts as", hideOnMobile: true, cell: (row) => (row.countsAsPresent ? "Working day" : "Absence") },
              { key: "status", header: "Status", cell: (row) => (row.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
              { key: "edit", header: "Actions", align: "end", cell: (row) => <LeaveTypeSheet type={row} /> },
            ]}
          />
        </CardBody>
      </Card>
      <p className="small muted">Types already used in requests can be deactivated but not deleted, so balances and history stay explainable.</p>
      {children}
    </div>
  );
}

/* Attendance rules --------------------------------------------------------- */

export function AttendanceRulesSection({ rules, tabs }: { rules: AttendanceRules; tabs: ReactNode }) {
  const shiftName = (id: string) => rules.shifts.find((item) => item.id === id)?.name ?? "Default";
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Attendance rules" description="Office timings, which department follows which shift, overtime, and the office sites used for check-in location." />
      {tabs}
      <Card labelledBy="shift-heading">
        <CardHeader id="shift-heading" title="Shifts (office timings)" description="Weekends are Saturday and Sunday. Departments without an assignment follow the default shift." action={<ShiftSheet />} />
        <ul className="list">
          {rules.shifts.map((item) => {
            const assigned = rules.departmentShifts.filter((row) => row.shiftId === item.id);
            const isDefault = item.id === rules.defaultShiftId;
            return (
              <ListRow
                key={item.id}
                leading={<span className="icon-tile avatar--cyan"><AppIcon name="timer" size={20} /></span>}
                title={
                  <span>
                    {item.name} {isDefault && <Badge tone="success">Default</Badge>}
                  </span>
                }
                meta={<span className="num">{`${item.start}–${item.end} · ${item.graceMinutes} min grace · ${item.breakMinutes} min break · ${assigned.length} department${assigned.length === 1 ? "" : "s"}`}</span>}
                trailing={
                  <>
                    <ShiftSheet shift={item} />
                    <ShiftRowActions id={item.id} isDefault={isDefault} assigned={!isDefault && assigned.length > 0} />
                  </>
                }
              />
            );
          })}
        </ul>
      </Card>
      <div className="split">
        <Card labelledBy="dshift-heading">
          <CardHeader id="dshift-heading" title="Shift by department" description="Changes apply from the next check-in." />
          <CardBody className="flush">
            <DataTable
              caption="Shift by department"
              rows={rules.departmentShifts}
              rowKey={(row) => row.department}
              mobileRow={(row) => ({ title: row.department, meta: shiftName(row.shiftId), trailing: <DepartmentShiftSelect department={row.department} shiftId={row.shiftId} shifts={rules.shifts} /> })}
              columns={[
                { key: "dept", header: "Department", rowHeader: true, cell: (row) => row.department },
                { key: "shift", header: "Shift", cell: (row) => <DepartmentShiftSelect department={row.department} shiftId={row.shiftId} shifts={rules.shifts} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="ot-heading">
          <CardHeader id="ot-heading" title="Overtime" description="Counted from check-out time after the shift end. Shown on each employee's attendance." />
          <CardBody>
            <OvertimeForm policy={rules.overtime} />
          </CardBody>
        </Card>
      </div>
      <Card labelledBy="le-heading">
        <CardHeader id="le-heading" title="Late coming & early going" description={`Every ${rules.lateEarly.marksPerHalfDay} late or early marks in a month deduct half a day. Shown on each employee's attendance calendar.`} />
        <CardBody>
          <LateEarlyForm policy={rules.lateEarly} />
        </CardBody>
      </Card>
      <Card labelledBy="site-heading">
        <CardHeader id="site-heading" title="Office sites" description="Check-ins inside a site’s radius are verified. Add each real office by searching its address or standing there and using your current location." action={<SiteSheet />} />
        {rules.sites.length === 0 && <EmptyState compact icon="location" title="No office sites yet" description="Add your real offices. Until then check-ins record the live address but can't be verified against an office." />}
        <ul className="list">
          {rules.sites.map((site) => (
            <ListRow
              key={site.id}
              leading={<span className="icon-tile avatar--magenta"><AppIcon name="location" size={20} /></span>}
              title={site.name}
              meta={<span className="num">{`${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)} · ${site.radiusMeters} m radius`}</span>}
              trailing={
                <>
                  <SiteSheet site={site} />
                  <RemoveSiteButton id={site.id} />
                </>
              }
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* Organization ------------------------------------------------------------- */

export function OrganizationSection({ config, people, tabs }: { config: OrganizationConfig; people: PersonRef[]; tabs: ReactNode }) {
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Organization" description="Departments, locations and probation rules used across people, leave, reports and payroll cost centers." actions={<DepartmentSheet people={people} />} />
      {tabs}
      <Card labelledBy="dep-table">
        <CardHeader id="dep-table" title="Departments" description={pluralize(config.departments.length, "department")} />
        <CardBody className="flush">
          <DataTable
            caption="Departments"
            rows={config.departments}
            rowKey={(row) => row.name}
            mobileRow={(row) => ({
              title: row.name,
              meta: `${row.costCenter} · ${pluralize(row.headcount, "person", "people")}${row.head ? ` · Head: ${row.head.name}` : ""}`,
              trailing: (
                <>
                  <DepartmentSheet department={row} people={people} />
                  <RemoveDepartmentButton name={row.name} headcount={row.headcount} />
                </>
              ),
            })}
            columns={[
              { key: "name", header: "Department", rowHeader: true, cell: (row) => row.name },
              { key: "cc", header: "Cost center", cell: (row) => <span className="num">{row.costCenter}</span> },
              { key: "head", header: "Head", cell: (row) => (row.head ? <PersonCell person={row.head} href={`/employees/${row.head.id}`} /> : <span className="muted">Not assigned</span>) },
              { key: "count", header: "People", align: "end", cell: (row) => <span className="num">{row.headcount}</span> },
              {
                key: "actions",
                header: "Actions",
                align: "end",
                cell: (row) => (
                  <span className="row-actions">
                    <DepartmentSheet department={row} people={people} />
                    <RemoveDepartmentButton name={row.name} headcount={row.headcount} />
                  </span>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
      <div className="split">
        <Card labelledBy="loc-heading">
          <CardHeader id="loc-heading" title="Locations" />
          <ul className="list">
            {config.locations.map((location) => (
              <ListRow key={location.name} leading={<span className="icon-tile avatar--neutral"><AppIcon name="building" size={20} /></span>} title={location.name} meta={pluralize(location.headcount, "person", "people")} trailing={<RemoveLocationButton name={location.name} headcount={location.headcount} />} />
            ))}
          </ul>
          <CardBody>
            <AddLocationForm />
          </CardBody>
        </Card>
        <Card labelledBy="prob-heading">
          <CardHeader id="prob-heading" title="Probation period" description="Default length by employment type (0–6 months). HR can override it per employee when adding them or in Edit job details." />
          <CardBody>
            <ProbationForm defaults={config.probationDefaults} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* Checklists --------------------------------------------------------------- */

export function ChecklistsSection({ checklists }: { checklists: Checklists }) {
  const list = (key: "onboarding" | "offboarding", title: string, description: string) => (
    <Card labelledBy={`ck-${key}`}>
      <CardHeader id={`ck-${key}`} title={title} description={description} action={<ChecklistTaskSheet list={key} />} />
      {checklists[key].length ? (
        <ul className="list">
          {checklists[key].map((task) => (
            <ListRow
              key={task.id}
              title={task.title}
              meta={`${task.owner} · ${key === "onboarding" ? `day ${task.offsetDays} after joining` : task.offsetDays > 0 ? `${task.offsetDays} days before last day` : task.offsetDays < 0 ? `${-task.offsetDays} days after last day` : "on the last day"}${task.blocking ? " · Blocking" : ""}`}
              trailing={
                <>
                  <ChecklistTaskSheet list={key} task={task} />
                  <RemoveChecklistTaskButton list={key} id={task.id} />
                </>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="check" title="No tasks" description="Add the first task." />
      )}
    </Card>
  );
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Checklists" description="Templates used for every joiner and every exit. Changes apply to open cases immediately." back={{ href: "/admin/onboarding", label: "Onboarding" }} />
      <div className="split">
        {list("onboarding", "Onboarding checklist", "Created when an employee is added.")}
        {list("offboarding", "Exit checklist", "Created when HR starts an exit.")}
      </div>
    </div>
  );
}

/* Offboarding -------------------------------------------------------------- */

/* Service requests --------------------------------------------------------- */

const kindIcon: Record<ServiceRequest["kind"], "profile" | "document" | "wallet"> = { profile_change: "profile", letter: "document", loan: "wallet" };
const stateBadge: Record<ServiceRequest["state"], { label: string; tone: "warning" | "info" | "success" | "danger" }> = {
  pending: { label: "Pending", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  approved: { label: "Done", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function ServiceRequestsSection({ requests, view, tabs }: { requests: ServiceRequest[]; view: "open" | "closed"; tabs: ReactNode }) {
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Service requests" description="Profile changes, letters and loans that need HR or Finance. You never see your own requests here." />
      {tabs}
      <TabsNav
        label="Request status"
        tabs={[
          { href: "/admin/requests", label: "Open", active: view === "open", ...(view === "open" ? { count: requests.length } : {}) },
          { href: "/admin/requests?view=closed", label: "Closed", active: view === "closed" },
        ]}
      />
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon="check" title={view === "open" ? "Queue is clear" : "Nothing closed yet"} description={view === "open" ? "New requests from employees will appear here." : "Decided requests appear here."} />
        </Card>
      ) : (
        <div className="grid grid-2">
          {requests.map((request) => (
            <Card key={request.id} labelledBy={`sr-${request.id}-title`}>
              <div className="card-header">
                <div className="person">
                  <span className="icon-tile avatar--neutral">
                    <AppIcon name={kindIcon[request.kind]} size={20} />
                  </span>
                  <span className="person-text">
                    <h2 id={`sr-${request.id}-title`}>{request.title}</h2>
                    <span className="person-role num">
                      {request.reference} · {formatRelative(request.submittedAt)}
                    </span>
                  </span>
                </div>
                <Badge tone={stateBadge[request.state].tone}>{stateBadge[request.state].label}</Badge>
              </div>
              <CardBody className="stack">
                <PersonCell person={request.requester} href={`/employees/${request.requester.id}`} />
                <dl className="lines">
                  {request.proposed && (
                    <div className="line">
                      <dt>Requested value</dt>
                      <dd>{request.proposed}</dd>
                    </div>
                  )}
                  <div className="line">
                    <dt>{request.kind === "letter" ? "Purpose" : "Reason"}</dt>
                    <dd>{request.reason}</dd>
                  </div>
                  <div className="line">
                    <dt>Details</dt>
                    <dd>{request.detail}</dd>
                  </div>
                  <div className="line">
                    <dt>Verified by</dt>
                    <dd>{request.verifier}</dd>
                  </div>
                  {request.decisionNote && (
                    <div className="line">
                      <dt>Note</dt>
                      <dd>{request.decisionNote}</dd>
                    </div>
                  )}
                </dl>
                {view === "open" && <ServiceDecision request={request} />}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
