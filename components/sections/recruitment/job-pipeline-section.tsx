import Link from "next/link";
import { CandidateSheet, JobSheet, JobStateActions, MoveStageSheet } from "@/components/features/recruitment/recruitment-forms";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, KeyValueList, MoneyText, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime, formatMoneyCompact, pluralize } from "@/lib/utils/format";
import { jobStatus, offerStatus } from "@/components/sections/recruitment/recruitment-ui";
import { employmentTypeLabels, sourceLabels, stageLabels, stageOrder, type JobDetail, type PipelineCard, type RecruitmentOptions, type RecruitmentStage } from "@/types/recruitment";

function CandidateCard({ card }: { card: PipelineCard }) {
  return (
    <li className="rec-card">
      <div className="rec-card-top">
        {card.erased ? (
          <span className="rec-card-name muted">{card.name}</span>
        ) : (
          <Link href={`/recruitment/candidates/${card.id}`} className="rec-card-name">
            {card.name}
          </Link>
        )}
        <span className="muted small num">{card.reference}</span>
      </div>
      {!card.erased && (
        <p className="rec-card-meta">
          {card.experienceYears} yrs{card.currentCompany ? ` · ${card.currentCompany}` : ""}
        </p>
      )}
      <div className="cluster">
        <Badge tone={card.source === "referral" ? "success" : "neutral"}>{sourceLabels[card.source]}</Badge>
        {card.offerState && card.stage === "offer" && <StatusBadge status={offerStatus[card.offerState]} />}
      </div>
      {card.nextInterviewAt && (
        <p className="rec-card-meta">
          <AppIcon name="calendar" size={16} /> Next: <time dateTime={card.nextInterviewAt}>{formatDateTime(card.nextInterviewAt)}</time>
        </p>
      )}
      {card.stage === "rejected" && card.rejectionReason && <p className="rec-card-meta">{card.rejectionReason}</p>}
      <div className="rec-card-foot">
        <span className="muted small">{card.daysInStage === 0 ? "Today" : `${pluralize(card.daysInStage, "day")} in stage`}</span>
        {!card.erased && card.stage !== "hired" && <MoveStageSheet candidateId={card.id} name={card.name} stage={card.stage} version={card.version} compact />}
      </div>
    </li>
  );
}

export function JobPipelineSection({ job, options, stage }: { job: JobDetail; options: RecruitmentOptions; stage: RecruitmentStage }) {
  const open = job.state !== "closed" && job.state !== "filled";
  const active = job.stageCounts.applied + job.stageCounts.screening + job.stageCounts.interview + job.stageCounts.offer;
  const total = job.candidates.length;
  return (
    <div className="page">
      <PageHeader
        back={{ href: "/recruitment", label: "Job openings" }}
        eyebrow={job.reference}
        title={job.title}
        description={`${job.department} · ${job.location} · ${employmentTypeLabels[job.employmentType]} · hiring manager ${job.hiringManager.name}`}
        actions={
          open ? (
            <>
              <JobStateActions jobId={job.id} state={job.state} version={job.version} />
              <JobSheet job={job} options={options} />
              <CandidateSheet options={options} jobId={job.id} />
            </>
          ) : undefined
        }
      />
      <div className="cluster">
        <StatusBadge status={jobStatus[job.state]} />
        {job.state === "published" && job.publishToCareers ? (
          <Link href={`/careers/${job.id}`} className="inline-link">
            View on careers page
          </Link>
        ) : (
          <span className="muted small">{job.publishToCareers ? "Listed on careers once published" : "Not listed on the careers page"}</span>
        )}
        {job.requisitionReference && <span className="muted small">From requisition {job.requisitionReference}</span>}
      </div>

      <div className="grid grid-stats">
        <StatCard label="Hired" value={`${job.hires} / ${job.openings}`} meta={pluralize(job.openings, "opening")} icon="userTick" accent="cyan" />
        <StatCard label="Active candidates" value={active} meta={`${total} total`} icon="people" accent="magenta" />
        <StatCard label="Days open" value={job.daysOpen} meta={<>Since <DateText value={job.openedOn} /></>} icon="timer" accent="yellow" />
        <StatCard label="CTC band (internal)" value={`${formatMoneyCompact(job.ctcMin)}–${formatMoneyCompact(job.ctcMax)}`} meta="Never shown publicly" icon="wallet" />
      </div>

      <section aria-labelledby="pipeline-heading" className="stack">
        <h2 id="pipeline-heading" className="sr-only">
          Pipeline
        </h2>
        <nav className="rec-stage-tabs" aria-label="Pipeline stages">
          {stageOrder.map((item) => (
            <Link key={item} href={`/recruitment/${job.id}?stage=${item}`} className="chip" aria-current={item === stage ? "page" : undefined} scroll={false}>
              {stageLabels[item]} <span className="num">{job.stageCounts[item]}</span>
            </Link>
          ))}
        </nav>
        <div className="rec-board" role="region" aria-label="Pipeline board" tabIndex={0}>
          {stageOrder.map((column) => {
            const cards = job.candidates.filter((card) => card.stage === column);
            return (
              <section key={column} className="rec-column" data-active={column === stage || undefined} aria-labelledby={`col-${column}`}>
                <h3 id={`col-${column}`} className="rec-column-head" data-stage={column}>
                  {stageLabels[column]}
                  <span className="tab-count num">{cards.length}</span>
                </h3>
                {cards.length ? (
                  <ul className="rec-cards">
                    {cards.map((card) => (
                      <CandidateCard key={card.id} card={card} />
                    ))}
                  </ul>
                ) : (
                  <p className="muted small rec-column-empty">No candidates</p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <div className="grid grid-2">
        <Card>
          <CardHeader title="Source breakdown" description="Where this job's candidates came from." />
          <CardBody>
            {job.sourceBreakdown.length ? (
              <ul className="bar-list">
                {job.sourceBreakdown.map((row) => (
                  <li key={row.source}>
                    <span className="bar-label">{sourceLabels[row.source]}</span>
                    <span className="meter" aria-hidden="true">
                      <span className="meter-fill" style={{ width: `${total ? (row.count / total) * 100 : 0}%` }} />
                    </span>
                    <span className="bar-value num">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No candidates yet.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Role details" />
          <CardBody className="stack">
            <p className="text-block">{job.description}</p>
            {job.skills.length > 0 && (
              <div className="chip-row" aria-label="Skills">
                {job.skills.map((skill) => (
                  <span key={skill} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            )}
            <KeyValueList
              items={[
                { label: "Experience", value: `${job.experienceMin}–${job.experienceMax} years` },
                { label: "CTC band", value: <><MoneyText value={job.ctcMin} compact /> – <MoneyText value={job.ctcMax} compact /></> },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
