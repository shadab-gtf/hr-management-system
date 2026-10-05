import type { ReactNode } from "react";
import { AuditHistorySheet } from "@/components/features/timesheets/audit-history-sheet";
import { ProjectSheet } from "@/components/features/timesheets/project-sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Meter, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateRange, pluralize } from "@/lib/utils/format";
import { hoursLabel, type Project, type ProjectsView } from "@/types/timesheets";
import { TimesheetExportForm } from "./timesheet-export-form";
import { projectStatus } from "./tones";

const burn = (project: Project) => (project.budgetQuarters > 0 ? Math.round((project.loggedQuarters / project.budgetQuarters) * 100) : 0);

function Utilization({ project }: { project: Project }) {
  const percent = burn(project);
  return (
    <div className="ts-util">
      <Meter value={project.loggedQuarters} max={project.budgetQuarters} label={`${project.code} budget used`} tone={percent >= 90 ? "warning" : "primary"} />
      <span className="small muted num">
        {hoursLabel(project.loggedQuarters)} of {hoursLabel(project.budgetQuarters)} · {percent}%
      </span>
    </div>
  );
}

export function ProjectsSection({ view, tabs, orgWideExport }: { view: ProjectsView; tabs: ReactNode; orgWideExport: boolean }) {
  const active = view.projects.filter((project) => project.status === "active");
  const billable = view.projects.reduce((sum, project) => sum + project.billableQuarters, 0);
  const logged = view.projects.reduce((sum, project) => sum + project.loggedQuarters, 0);
  const atRisk = active.filter((project) => burn(project) >= 90).length;
  const actions = (project: Project) => (
    <div className="row-actions">
      <ProjectSheet project={project} people={view.people} today={view.today} />
      <AuditHistorySheet title={`${project.code} history`} entries={project.audit} triggerLabel={`History for ${project.code}`} />
    </div>
  );
  return (
    <div className="page">
      <PageHeader title="Projects" description="Projects and tasks people log time against, with budget burn from submitted and approved hours." actions={<ProjectSheet people={view.people} today={view.today} />} />
      {tabs}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Active projects" value={active.length} meta={`${view.projects.length} in total`} icon="kanban" accent="cyan" />
        <StatCard label="Billable hours" value={hoursLabel(billable)} meta={`of ${hoursLabel(logged)} logged`} icon="chart" accent="yellow" />
        <StatCard label="Near budget" value={atRisk} meta="Active projects at 90%+ burn" icon="warning" />
      </div>
      <Card>
        <CardBody className="flush">
          <DataTable<Project>
            caption="Projects"
            rows={view.projects}
            rowKey={(row) => row.id}
            empty={<EmptyState icon="kanban" title="No projects yet" description="Create a project so people can log hours against it." />}
            mobileRow={(row) => ({
              title: `${row.code} · ${row.name}`,
              meta: (
                <>
                  {row.client ?? "Internal"} · <StatusBadge status={projectStatus[row.status]} />
                  <Utilization project={row} />
                  {actions(row)}
                </>
              ),
            })}
            columns={[
              {
                key: "project",
                header: "Project",
                rowHeader: true,
                cell: (row) => (
                  <span className="person-text">
                    <span className="person-name">{row.name}</span>
                    <span className="person-role">
                      {row.code} · {row.client ?? "Internal"} · {formatDateRange(row.startDate, row.endDate)}
                    </span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <span className="cluster">
                    <StatusBadge status={projectStatus[row.status]} />
                    {row.billable ? <Badge tone="info">Billable</Badge> : <Badge>Internal</Badge>}
                  </span>
                ),
              },
              { key: "util", header: "Budget burn", cell: (row) => <Utilization project={row} /> },
              { key: "billable", header: "Billable hours", align: "end", hideOnMobile: true, cell: (row) => <span className="num">{row.billable ? hoursLabel(row.billableQuarters) : "—"}</span> },
              { key: "approved", header: "Approved", align: "end", hideOnMobile: true, cell: (row) => <span className="num">{hoursLabel(row.approvedQuarters)}</span> },
              { key: "members", header: "Team", hideOnMobile: true, cell: (row) => <span title={row.members.map((member) => member.name).join(", ")}>{pluralize(row.members.length, "member")} · {pluralize(row.tasks.length, "task")}</span> },
              { key: "actions", header: "Actions", align: "end", cell: actions },
            ]}
          />
        </CardBody>
      </Card>
      <TimesheetExportForm from={view.exportFrom} to={view.exportTo} scope={orgWideExport ? "All employees' approved hours (HR scope)." : "Approved hours for your direct reports."} />
    </div>
  );
}
