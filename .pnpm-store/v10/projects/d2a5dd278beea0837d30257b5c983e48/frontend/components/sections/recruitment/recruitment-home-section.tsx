import Link from "next/link";
import { CandidateSheet, JobSheet, RequisitionDecision } from "@/components/features/recruitment/recruitment-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText, Meter, PersonCell, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoneyCompact, pluralize } from "@/lib/utils/format";
import { jobStatus, MockNote, requisitionStatus } from "@/components/sections/recruitment/recruitment-ui";
import { employmentTypeLabels, sourceLabels, stageLabels, type JobSummary, type RecruitmentOptions, type RecruitmentStats, type Requisition } from "@/types/recruitment";

export type RecruitmentTab = "jobs" | "requisitions" | "sources";

function PipelineCounts({ job }: { job: JobSummary }) {
  const stages = ["applied", "screening", "interview", "offer", "hired"] as const;
  return (
    <span className="rec-counts" aria-label={stages.map((stage) => `${stageLabels[stage]} ${job.stageCounts[stage]}`).join(", ")}>
      {stages.map((stage) => (
        <span key={stage} className="rec-count" data-stage={stage} aria-hidden="true" title={stageLabels[stage]}>
          <span className="rec-count-label">{stageLabels[stage].slice(0, 1)}</span>
          <span className="num">{job.stageCounts[stage]}</span>
        </span>
      ))}
    </span>
  );
}

export function RecruitmentHomeSection({
  stats,
  jobs,
  requisitions,
  options,
  tab,
}: {
  stats: RecruitmentStats;
  jobs: JobSummary[];
  requisitions: Requisition[];
  options: RecruitmentOptions;
  tab: RecruitmentTab;
}) {
  const pendingRequisitions = requisitions.filter((item) => item.state === "pending").length;
  return (
    <div className="page">
      <PageHeader
        title="Recruitment"
        description="Requisitions, job openings, pipelines and offers. Candidate data is visible to HR only."
        actions={
          <>
            <CandidateSheet options={options} triggerVariant="secondary" />
            <JobSheet options={options} />
          </>
        }
      />
      <div className="grid grid-stats">
        <StatCard label="Open positions" value={stats.openPositions} meta={`${pluralize(stats.activeJobs, "active job")}`} icon="briefcase" accent="magenta" />
        <StatCard label="In pipeline" value={stats.inPipeline} meta="Applied to offer" icon="people" accent="cyan" href="/recruitment/candidates" />
        <StatCard label="Offer acceptance" value={stats.acceptanceRate === null ? "—" : `${stats.acceptanceRate}%`} meta={`${stats.offersAccepted} of ${stats.offersDecided} decided`} icon="like" accent="yellow" />
        <StatCard label="Avg time to hire" value={stats.avgDaysToHire === null ? "—" : `${stats.avgDaysToHire} days`} meta={`${pluralize(stats.hires, "hire")} · applied → hired`} icon="timer" />
      </div>

      <TabsNav
        label="Recruitment views"
        tabs={[
          { href: "/recruitment", label: "Job openings", active: tab === "jobs", count: jobs.length },
          { href: "/recruitment?tab=requisitions", label: "Requisitions", active: tab === "requisitions", count: pendingRequisitions },
          { href: "/recruitment?tab=sources", label: "Source effectiveness", active: tab === "sources" },
        ]}
      />

      {tab === "jobs" && (
        <Card>
          <CardBody className="flush">
            <DataTable<JobSummary>
              caption="Job openings"
              rows={jobs}
              rowKey={(row) => row.id}
              empty={<EmptyState icon="briefcase" title="No job openings" description="Create a job, or approve a manager's requisition to start one." />}
              mobileRow={(row) => ({
                title: row.title,
                href: `/recruitment/${row.id}`,
                meta: (
                  <>
                    {row.department} · {row.location} · {row.daysOpen} days open
                    <br />
                    <StatusBadge status={jobStatus[row.state]} /> <PipelineCounts job={row} />
                  </>
                ),
              })}
              columns={[
                {
                  key: "job",
                  header: "Job",
                  rowHeader: true,
                  cell: (row) => (
                    <span className="person-text">
                      <Link href={`/recruitment/${row.id}`} className="person-name person-link">
                        {row.title}
                      </Link>
                      <span className="person-role">
                        {row.reference} · {row.department} · {row.location} · {employmentTypeLabels[row.employmentType]}
                      </span>
                    </span>
                  ),
                },
                { key: "manager", header: "Hiring manager", hideOnMobile: true, cell: (row) => <PersonCell person={row.hiringManager} /> },
                { key: "pipeline", header: "Pipeline", cell: (row) => <PipelineCounts job={row} /> },
                { key: "filled", header: "Hired", cell: (row) => <span className="num">{`${row.hires} / ${row.openings}`}</span> },
                { key: "days", header: "Days open", align: "end", cell: (row) => <span className="num">{row.daysOpen}</span> },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => (
                    <span className="cluster">
                      <StatusBadge status={jobStatus[row.state]} />
                      {row.publishToCareers && row.state === "published" && <Badge tone="info">Careers</Badge>}
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {tab === "requisitions" && (
        <Card>
          <CardHeader title="Hiring requisitions" description="Managers raise requisitions from My interviews. Approving one creates a draft job opening with the approved budget." />
          <CardBody className="flush">
            <DataTable<Requisition>
              caption="Hiring requisitions"
              rows={requisitions}
              rowKey={(row) => row.id}
              empty={<EmptyState icon="clipboard" title="No requisitions" description="Requisitions raised by managers appear here for approval." />}
              columns={[
                {
                  key: "role",
                  header: "Role",
                  rowHeader: true,
                  cell: (row) => (
                    <span className="person-text">
                      <span className="person-name">{`${row.openings} × ${row.title}`}</span>
                      <span className="person-role">
                        {row.reference} · {row.department} · {row.location}
                      </span>
                    </span>
                  ),
                },
                { key: "by", header: "Raised by", cell: (row) => <PersonCell person={row.raisedBy} meta={<DateText value={row.raisedAt.slice(0, 10)} />} /> },
                {
                  key: "budget",
                  header: "Budget CTC",
                  cell: (row) => (
                    <span className="nowrap">
                      {formatMoneyCompact(row.budgetMin)} – {formatMoneyCompact(row.budgetMax)}
                    </span>
                  ),
                },
                {
                  key: "why",
                  header: "Justification",
                  hideOnMobile: true,
                  cell: (row) => (
                    <span className="person-text">
                      <span>{row.justification === "backfill" ? `Backfill · ${row.backfillFor ?? ""}` : "New role"}</span>
                      <span className="person-role">{row.reason}</span>
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => (
                    <span className="person-text">
                      <StatusBadge status={requisitionStatus[row.state]} />
                      {row.decisionNote && <span className="person-role">{row.decisionNote}</span>}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  align: "end",
                  cell: (row) =>
                    row.canDecide ? (
                      <RequisitionDecision requisitionId={row.id} version={row.version} title={row.title} />
                    ) : row.jobId ? (
                      <Link className="inline-link" href={`/recruitment/${row.jobId}`}>
                        Open job
                      </Link>
                    ) : row.state === "pending" ? (
                      <span className="muted small">Needs another HR approver</span>
                    ) : null,
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {tab === "sources" && (
        <Card>
          <CardHeader title="Source effectiveness" description="Where candidates come from, and how many reach interview and get hired." />
          <CardBody className="flush">
            <DataTable
              caption="Source effectiveness"
              rows={stats.sources}
              rowKey={(row) => row.source}
              columns={[
                { key: "source", header: "Source", rowHeader: true, cell: (row) => sourceLabels[row.source] },
                { key: "candidates", header: "Candidates", align: "end", cell: (row) => <span className="num">{row.candidates}</span> },
                { key: "interviewed", header: "Reached interview", align: "end", cell: (row) => <span className="num">{row.interviewed}</span> },
                { key: "hired", header: "Hired", align: "end", cell: (row) => <span className="num">{row.hired}</span> },
                {
                  key: "conversion",
                  header: "Interview rate",
                  cell: (row) => {
                    const rate = row.candidates ? Math.round((row.interviewed / row.candidates) * 100) : 0;
                    return (
                      <span className="rec-meter">
                        <Meter value={rate} max={100} label={`${sourceLabels[row.source]} interview rate`} />
                        <span className="num small">{rate}%</span>
                      </span>
                    );
                  },
                },
              ]}
            />
          </CardBody>
          <MockNote>Calculated from mock pipeline data.</MockNote>
        </Card>
      )}
    </div>
  );
}
