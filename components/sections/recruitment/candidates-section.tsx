import Link from "next/link";
import { CandidateSheet } from "@/components/features/recruitment/recruitment-forms";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, pluralize } from "@/lib/utils/format";
import { stageStatus } from "@/components/sections/recruitment/recruitment-ui";
import { sourceLabels, stageLabels, stageOrder, type CandidateListItem, type CandidateSource, type RecruitmentOptions, type RecruitmentStage } from "@/types/recruitment";

export interface CandidateFilterValues {
  q?: string | undefined;
  jobId?: string | undefined;
  stage?: RecruitmentStage | undefined;
  source?: CandidateSource | undefined;
  retention?: boolean | undefined;
}

function Flags({ row }: { row: CandidateListItem }) {
  if (!row.possibleDuplicate && !row.retentionDue && !row.erased) return null;
  return (
    <span className="cluster">
      {row.erased && <Badge tone="neutral">Erased</Badge>}
      {row.possibleDuplicate && <Badge tone="warning">Possible duplicate</Badge>}
      {row.retentionDue && <Badge tone="danger">Retention due</Badge>}
    </span>
  );
}

export function CandidatesSection({ candidates, filters, options, jobs }: { candidates: CandidateListItem[]; filters: CandidateFilterValues; options: RecruitmentOptions; jobs: { id: string; title: string }[] }) {
  const retentionDue = candidates.filter((row) => row.retentionDue).length;
  return (
    <div className="page">
      <PageHeader title="Candidates" description="Everyone in your pipelines. Contact details and pay are HR-only; consent and retention are tracked per candidate." actions={<CandidateSheet options={options} />} />
      <Card>
        <form className="toolbar" action="/recruitment/candidates" role="search" aria-label="Filter candidates">
          <div className="search-field">
            <AppIcon name="search" size={16} />
            <label className="sr-only" htmlFor="cand-q">
              Search by name, email, mobile or reference
            </label>
            <input id="cand-q" name="q" type="search" className="input" defaultValue={filters.q ?? ""} placeholder="Name, email, mobile or CN-…" />
          </div>
          <div className="toolbar-field">
            <label htmlFor="cand-job">Job</label>
            <SelectInput id="cand-job" name="jobId" defaultValue={filters.jobId ?? ""} placeholder="Any job" options={jobs.map((job) => ({ value: job.id, label: job.title }))} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="cand-stage">Stage</label>
            <SelectInput id="cand-stage" name="stage" defaultValue={filters.stage ?? ""} placeholder="Any stage" options={stageOrder.map((value) => ({ value, label: stageLabels[value] }))} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="cand-source">Source</label>
            <SelectInput id="cand-source" name="source" defaultValue={filters.source ?? ""} placeholder="Any source" options={(Object.keys(sourceLabels) as CandidateSource[]).map((value) => ({ value, label: sourceLabels[value] }))} />
          </div>
          <label className="check-row rec-toolbar-check">
            <input type="checkbox" name="retention" value="1" defaultChecked={filters.retention} />
            <span>Retention due only</span>
          </label>
          <div className="toolbar-actions">
            <button type="submit" className="button button--primary">
              <AppIcon name="filter" size={16} />
              Apply
            </button>
            <Link href="/recruitment/candidates" className="button button--ghost">
              Reset
            </Link>
          </div>
        </form>
        <p className="result-bar muted small" role="status">
          {pluralize(candidates.length, "candidate")}
          {retentionDue > 0 ? ` · ${retentionDue} past retention date` : ""}
        </p>
        <CardBody className="flush">
          <DataTable<CandidateListItem>
            caption="Candidates"
            rows={candidates}
            rowKey={(row) => row.id}
            empty={<EmptyState icon="userSearch" title="No candidates match" description="Try a different search or clear the filters." />}
            mobileRow={(row) => ({
              title: row.name,
              href: `/recruitment/candidates/${row.id}`,
              meta: (
                <>
                  {row.jobTitle} · {sourceLabels[row.source]} · {formatDate(row.appliedAt.slice(0, 10))}
                  <br />
                  <StatusBadge status={stageStatus[row.stage]} /> <Flags row={row} />
                </>
              ),
            })}
            columns={[
              {
                key: "name",
                header: "Candidate",
                rowHeader: true,
                cell: (row) => (
                  <span className="person-text">
                    <Link href={`/recruitment/candidates/${row.id}`} className="person-name person-link">
                      {row.name}
                    </Link>
                    <span className="person-role">
                      {row.reference}
                      {row.email ? ` · ${row.email}` : ""}
                    </span>
                  </span>
                ),
              },
              { key: "job", header: "Job", cell: (row) => <Link href={`/recruitment/${row.jobId}`} className="inline-link">{row.jobTitle}</Link> },
              { key: "exp", header: "Experience", hideOnMobile: true, cell: (row) => `${row.experienceYears} yrs` },
              { key: "source", header: "Source", hideOnMobile: true, cell: (row) => sourceLabels[row.source] },
              { key: "applied", header: "Applied", cell: (row) => <DateText value={row.appliedAt.slice(0, 10)} /> },
              { key: "stage", header: "Stage", cell: (row) => <StatusBadge status={stageStatus[row.stage]} /> },
              { key: "flags", header: "Flags", cell: (row) => <Flags row={row} /> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
