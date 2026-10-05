import { ProfileChangeSheet } from "@/components/features/profile/profile-change-sheet";
import { ProfilePhotoEditor } from "@/components/features/profile/profile-photo-editor";
import { EditEmploymentSheet, StartExitSheet } from "@/components/features/people/employee-admin";
import type { HrFormOptions } from "@/types/hr-config";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DateText, KeyValueList, ListRow, StatusBadge, TabsNav, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, humanize } from "@/lib/utils/format";
import { employmentStatus } from "@/lib/utils/tones";
import type { EmployeeDetail } from "@/types/employee";

export type ProfileTab = "overview" | "employment" | "personal";

export function EmployeeProfileSection({
  employee,
  tab,
  basePath,
  self,
  hrOptions = null,
}: {
  employee: EmployeeDetail;
  tab: ProfileTab;
  basePath: string;
  self: boolean;
  /** Present only when the viewer may edit this employment record. */
  hrOptions?: HrFormOptions | null;
}) {
  const probationLabel =
    employee.probation.status === "none"
      ? "No probation"
      : employee.probation.status === "confirmed"
        ? `Confirmed (${employee.probation.months} months)`
        : `${employee.probation.months} months · ends ${formatDate(employee.probation.endsOn ?? employee.joinedOn)}`;
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "employment", label: "Employment" },
    ...(employee.permissions.canViewPrivate ? [{ key: "personal", label: "Personal" }] : []),
  ] as const;
  return (
    <div className="page">
      <PageHeader
        title={self ? "My profile" : employee.name}
        back={self ? undefined : { href: "/employees", label: "People" }}
        actions={
          employee.permissions.canRequestChange ? (
            <ProfileChangeSheet />
          ) : hrOptions ? (
            <>
              {!employee.exit && <StartExitSheet employee={employee} today={hrOptions.today} />}
              <EditEmploymentSheet employee={employee} options={hrOptions} />
            </>
          ) : undefined
        }
      />
      {employee.exit && (
        <Alert tone="warning" title="Exit in progress">
          {employee.exit.reason} · last working day {formatDate(employee.exit.lastWorkingDay)}. Track tasks in HR admin → Offboarding.
        </Alert>
      )}
      <Card>
        <div className="profile-hero">
          {self ? (
            <ProfilePhotoEditor id={employee.id} initials={employee.initials} photoUrl={employee.photoUrl} />
          ) : (
            <Avatar initials={employee.initials} seed={employee.id} src={employee.photoUrl} size="xl" />
          )}
          <div className="profile-hero-text">
            <h2>{employee.name}</h2>
            <p className="muted">
              {employee.designation} · {employee.department}
            </p>
            <div className="profile-meta">
              <span>
                <AppIcon name="location" size={16} />
                {employee.location}
              </span>
              <span>
                <AppIcon name="mail" size={16} />
                <a className="inline-link" href={`mailto:${employee.workEmail}`}>
                  {employee.workEmail}
                </a>
              </span>
              <span className="num">
                <AppIcon name="briefcase" size={16} />
                {employee.code}
              </span>
            </div>
          </div>
          <StatusBadge status={employmentStatus[employee.status]} />
        </div>
      </Card>
      <TabsNav
        label="Profile sections"
        tabs={tabs.map((item) => ({
          href: item.key === "overview" ? basePath : `${basePath}?tab=${item.key}`,
          label: item.label,
          active: tab === item.key,
        }))}
      />

      {tab === "overview" && (
        <div className="split">
          <Card labelledBy="work-heading">
            <CardHeader id="work-heading" title="Work details" />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Designation", value: employee.designation },
                  { label: "Department", value: employee.department },
                  { label: "Location", value: employee.location },
                  { label: "Work phone", value: employee.workPhone ?? "—" },
                  { label: "Employment type", value: humanize(employee.employmentType) },
                  { label: "Joined", value: <DateText value={employee.joinedOn} /> },
                  { label: "Probation", value: probationLabel },
                ]}
              />
            </CardBody>
          </Card>
          <div className="stack">
            <Card labelledBy="manager-heading">
              <CardHeader id="manager-heading" title="Reports to" />
              {employee.manager ? (
                <ul className="list">
                  <ListRow
                    href={`/employees/${employee.manager.id}`}
                    leading={<Avatar initials={employee.manager.initials} seed={employee.manager.id} src={employee.manager.photoUrl} />}
                    title={employee.manager.name}
                    meta={employee.manager.designation}
                  />
                </ul>
              ) : (
                <EmptyState compact icon="people" title="Top of the organization" description="No reporting line above this role." />
              )}
            </Card>
            {employee.directReports.length > 0 && (
              <Card labelledBy="reports-heading">
                <CardHeader id="reports-heading" title="Team" description={`${employee.directReports.length} direct reports`} />
                <ul className="list">
                  {employee.directReports.map((person) => (
                    <ListRow key={person.id} href={`/employees/${person.id}`} leading={<Avatar initials={person.initials} seed={person.id} src={person.photoUrl} size="sm" />} title={person.name} meta={person.designation} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "employment" && (
        <div className="split">
          <Card labelledBy="timeline-heading">
            <CardHeader id="timeline-heading" title="Employment history" description="Effective date and the date it was recorded" />
            <CardBody>
              <Timeline
                items={employee.timeline.map((event) => ({
                  id: event.id,
                  title: event.title,
                  detail: event.detail,
                  meta: `Effective ${formatDate(event.effectiveOn)} · recorded ${formatDate(event.recordedOn)}`,
                }))}
              />
            </CardBody>
          </Card>
          <Card labelledBy="contract-heading">
            <CardHeader id="contract-heading" title="Employment record" />
            <CardBody>
              <KeyValueList
                columns={1}
                items={[
                  { label: "Legal entity", value: employee.legalEntity },
                  { label: "Cost center", value: employee.costCenter },
                  { label: "Employee code", value: employee.code },
                  { label: "Status", value: employmentStatus[employee.status].label },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "personal" &&
        (employee.privateProfile ? (
          <Card labelledBy="personal-heading">
            <CardHeader id="personal-heading" title="Personal details" description={self ? "Only you and authorized HR can see these." : "Restricted — visible to authorized HR only."} />
            <CardBody className="stack">
              <KeyValueList
                items={[
                  { label: "Personal email", value: employee.privateProfile.personalEmail },
                  { label: "Mobile", value: employee.privateProfile.mobile },
                  { label: "Emergency contact", value: employee.privateProfile.emergencyContact },
                  { label: "Address", value: employee.privateProfile.address },
                  { label: "Salary account", value: <span className="num">{employee.privateProfile.bankAccountMasked}</span>, hint: "Masked. Changes need Finance verification." },
                ]}
              />
            </CardBody>
          </Card>
        ) : (
          <p className="restricted">
            <AppIcon name="lock" size={20} />
            Personal details are restricted.
          </p>
        ))}
    </div>
  );
}
