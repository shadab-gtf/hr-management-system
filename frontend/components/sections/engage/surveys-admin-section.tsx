import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/features/admin/form-sheet";
import { AddQuestionForm, MoveQuestionButtons, NewSurveySheet, SurveySettingsForm } from "@/components/features/engage/survey-admin";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, Meter, StatusBadge, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { closePollAction, closeSurveyAction, discardSurveyAction, publishSurveyAction, removeQuestionAction } from "@/lib/actions/engage";
import { formatDate, formatDateRange, formatDateTime, pluralize } from "@/lib/utils/format";
import { surveyQuestionKinds } from "@/types/engage-labels";
import type { Poll, SurveyAdmin, SurveyDetail, SurveyResults, SurveyState, SurveySummary } from "@/types/engage";
import type { Tone } from "@/types/common";

const surveyStatus: Record<SurveyState, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  open: { label: "Open", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

const rate = (survey: SurveySummary) => (survey.eligibleCount ? Math.round((survey.responseCount * 100) / survey.eligibleCount) : 0);

export function SurveysAdminSection({ admin, tabs, today }: { admin: SurveyAdmin; tabs: ReactNode; today: string }) {
  const open = admin.surveys.filter((survey) => survey.state === "open");
  const avgRate = open.length ? Math.round(open.reduce((sum, survey) => sum + rate(survey), 0) / open.length) : 0;
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Polls & surveys" description="Build engagement and pulse surveys, track response rates and read results that protect anonymity." actions={<NewSurveySheet departments={admin.departments} today={today} />} />
      {tabs}
      <div className="grid grid-stats">
        <StatCard label="Open surveys" value={open.length} meta={open.length ? `${avgRate}% average response rate` : "None running"} icon="clipboard" accent="magenta" />
        <StatCard label="Drafts" value={admin.surveys.filter((survey) => survey.state === "draft").length} meta="Not yet published" icon="edit" />
        <StatCard label="Open polls" value={admin.polls.filter((poll) => poll.state === "open").length} meta="Created by employees and HR" icon="chart" accent="cyan" />
        <StatCard label="Poll votes" value={admin.polls.reduce((sum, poll) => sum + poll.voterCount, 0)} meta="Across all polls" icon="like" accent="yellow" />
      </div>
      <Card labelledBy="surveys-heading">
        <CardHeader id="surveys-heading" title="Surveys" description="Anonymous surveys hide results and department breakdowns until at least 5 people respond." />
        <CardBody className="flush">
          <DataTable<SurveySummary>
            caption="Surveys"
            rows={admin.surveys}
            rowKey={(row) => row.id}
            empty={<EmptyState icon="clipboard" title="No surveys yet" description="Create a pulse or engagement survey to hear from your people." />}
            mobileRow={(row) => ({
              title: row.title,
              meta: (
                <>
                  {formatDateRange(row.opensOn, row.closesOn)} · {row.responseCount}/{row.eligibleCount} responses
                  <br />
                  <StatusBadge status={surveyStatus[row.state]} />
                </>
              ),
              href: `/admin/surveys/${row.id}`,
            })}
            columns={[
              {
                key: "title",
                header: "Survey",
                rowHeader: true,
                cell: (row) => (
                  <span className="person-text">
                    <Link href={`/admin/surveys/${row.id}`} className="person-link person-name">
                      {row.title}
                    </Link>
                    <span className="person-role">
                      {pluralize(row.questionCount, "question")} · {row.department ?? "All employees"}
                      {row.anonymous ? " · Anonymous" : ""}
                    </span>
                  </span>
                ),
              },
              { key: "state", header: "Status", cell: (row) => <StatusBadge status={surveyStatus[row.state]} /> },
              { key: "window", header: "Window", cell: (row) => formatDateRange(row.opensOn, row.closesOn) },
              {
                key: "responses",
                header: "Responses",
                align: "end",
                cell: (row) =>
                  row.state === "draft" ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="num">
                      {row.responseCount}/{row.eligibleCount} · {rate(row)}%
                    </span>
                  ),
              },
            ]}
          />
        </CardBody>
      </Card>
      <Card labelledBy="polls-heading">
        <CardHeader id="polls-heading" title="Polls" description="HR can close any poll early, for example if it’s off-topic." />
        <CardBody className="flush">
          <DataTable<Poll>
            caption="Polls"
            rows={admin.polls}
            rowKey={(row) => row.id}
            empty={<EmptyState icon="chart" title="No polls" description="Employees create polls from Engage." />}
            mobileRow={(row) => ({
              title: row.question,
              meta: (
                <>
                  {row.author.name} · {pluralize(row.voterCount, "vote")} · {row.state === "open" ? "Open" : "Closed"}
                </>
              ),
              trailing: row.canClose ? <ConfirmButton label="Close" confirmLabel="Close now" run={closePollAction.bind(null, row.id)} /> : undefined,
            })}
            columns={[
              { key: "question", header: "Poll", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.question}</span><span className="person-role">{row.author.name} · {row.department ?? "Everyone"}{row.anonymous ? " · Anonymous" : ""}</span></span> },
              { key: "state", header: "Status", cell: (row) => (row.state === "open" ? <Badge tone="success">Open</Badge> : <Badge>{row.closedEarly ? "Closed early" : "Closed"}</Badge>) },
              { key: "closes", header: "Closes", hideOnMobile: true, cell: (row) => formatDateTime(row.closesAt) },
              { key: "votes", header: "Votes", align: "end", cell: (row) => <span className="num">{row.voterCount}</span> },
              { key: "actions", header: "Actions", align: "end", cell: (row) => (row.canClose ? <ConfirmButton label="Close" confirmLabel="Close now" run={closePollAction.bind(null, row.id)} /> : <span className="muted">—</span>) },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function SurveyMeta({ survey }: { survey: SurveyDetail }) {
  return (
    <KeyValueList
      columns={3}
      items={[
        { label: "Audience", value: `${survey.department ?? "All employees"} (${survey.eligibleCount})` },
        { label: "Window", value: formatDateRange(survey.opensOn, survey.closesOn) },
        { label: "Privacy", value: survey.anonymous ? `Anonymous · min. ${survey.minResponses} responses` : "Named responses" },
      ]}
    />
  );
}

function AuditCard({ survey }: { survey: SurveyDetail }) {
  return (
    <Card labelledBy="survey-audit">
      <CardHeader id="survey-audit" title="Audit trail" />
      <CardBody>
        <Timeline items={survey.audit.map((entry, index) => ({ id: `${entry.at}-${index}`, title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}` }))} />
      </CardBody>
    </Card>
  );
}

export function SurveyBuilderSection({ survey, departments, today, tabs }: { survey: SurveyDetail; departments: string[]; today: string; tabs: ReactNode }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Survey builder"
        title={survey.title}
        description="Draft — only HR can see this survey. Publishing locks the questions so every response is comparable."
        back={{ href: "/admin/surveys", label: "Polls & surveys" }}
        actions={
          <>
            <ConfirmButton label="Discard draft" confirmLabel="Discard" run={discardSurveyAction.bind(null, survey.id)} />
            <ConfirmButton label="Publish survey" confirmLabel="Confirm publish" run={publishSurveyAction.bind(null, survey.id)} {...(survey.questions.length === 0 ? { disabledReason: "Add at least one question first" } : {})} />
          </>
        }
      />
      {tabs}
      <div className="split">
        <div className="stack">
          <Card labelledBy="questions-heading">
            <CardHeader id="questions-heading" title={`Questions (${survey.questions.length})`} description="Rating 1–5, eNPS 0–10, single or multiple choice, and free text." />
            {survey.questions.length ? (
              <ol className="list">
                {survey.questions.map((question, index) => (
                  <li key={question.id} className="list-row">
                    <div className="list-row-inner ep-question-row">
                      <span className="list-text">
                        <span className="list-title">
                          <span className="muted num">{index + 1}. </span>
                          {question.prompt}
                        </span>
                        <span className="list-meta">
                          {surveyQuestionKinds[question.kind]} · {question.required ? "Required" : "Optional"}
                          {question.options.length ? ` · ${question.options.join(" / ")}` : ""}
                        </span>
                      </span>
                      <span className="row-actions">
                        <MoveQuestionButtons surveyId={survey.id} questionId={question.id} first={index === 0} last={index === survey.questions.length - 1} />
                        <ConfirmButton label="Remove" confirmLabel="Remove?" run={removeQuestionAction.bind(null, survey.id, question.id)} />
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <CardBody>
                <EmptyState compact icon="clipboard" title="No questions yet" description="Add your first question below. An eNPS question unlocks the eNPS score in results." />
              </CardBody>
            )}
          </Card>
          <Card labelledBy="add-question">
            <CardHeader id="add-question" title="Add a question" />
            <CardBody>
              <AddQuestionForm surveyId={survey.id} />
            </CardBody>
          </Card>
        </div>
        <div className="stack">
          <Card labelledBy="survey-settings">
            <CardHeader id="survey-settings" title="Settings" />
            <CardBody>
              <SurveySettingsForm survey={survey} departments={departments} today={today} />
            </CardBody>
          </Card>
          <AuditCard survey={survey} />
        </div>
      </div>
    </div>
  );
}

function Bars({ rows, label }: { rows: { label: string; count: number; percent: number }[]; label: string }) {
  return (
    <ul className="bar-list ep-bars" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className="bar-label" title={row.label}>
            {row.label}
          </span>
          <Meter value={row.percent} max={100} label={`${row.label}: ${row.count} (${row.percent}%)`} tone="secondary" />
          <span className="bar-value num">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function SurveyResultsSection({ results, tabs }: { results: SurveyResults; tabs: ReactNode }) {
  const { survey, enps } = results;
  const enpsTotal = enps ? Math.max(1, enps.responses) : 1;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Survey results"
        title={survey.title}
        description={survey.description || undefined}
        back={{ href: "/admin/surveys", label: "Polls & surveys" }}
        actions={
          <>
            <a className="button button--secondary" href={`/api/engage/surveys/${encodeURIComponent(survey.id)}/results.csv`} download>
              <AppIcon name="download" size={20} />
              Export CSV
            </a>
            {(survey.state === "open" || survey.state === "scheduled") && <ConfirmButton label="Close survey" confirmLabel="Close now" run={closeSurveyAction.bind(null, survey.id)} />}
          </>
        }
      />
      {tabs}
      <div className="grid grid-stats">
        <StatCard label="Status" value={surveyStatus[survey.state].label} meta={survey.state === "closed" ? `Closed · ${formatDate(survey.closesOn)}` : `Closes ${formatDate(survey.closesOn)}`} icon="status" />
        <StatCard label="Responses" value={`${survey.responseCount}/${survey.eligibleCount}`} meta={`${results.responseRate}% response rate`} icon="people" accent="cyan" />
        <StatCard label="eNPS" value={enps ? (enps.score > 0 ? `+${enps.score}` : enps.score) : "—"} meta={enps ? "Promoters − detractors" : results.suppressed ? "Hidden below threshold" : "No eNPS question"} icon="graph" accent="magenta" />
        <StatCard label="Questions" value={survey.questions.length} meta={survey.anonymous ? `Anonymous · min. ${survey.minResponses}` : "Named"} icon="clipboard" accent="yellow" />
      </div>
      <Card>
        <CardBody>
          <SurveyMeta survey={survey} />
          <div className="ep-rate">
            <Meter value={results.responseRate} max={100} label={`Response rate ${results.responseRate}%`} />
          </div>
        </CardBody>
      </Card>
      {results.suppressed ? (
        <Alert tone="warning" title={`Results hidden until ${survey.minResponses} people respond`} live>
          {survey.responseCount} of {survey.minResponses} minimum responses so far. This protects anonymity — no scores, answers or breakdowns are shown or exported until the threshold is met.
        </Alert>
      ) : (
        <>
          {enps && (
            <Card labelledBy="enps-heading">
              <CardHeader id="enps-heading" title={`eNPS ${enps.score > 0 ? `+${enps.score}` : enps.score}`} description={`${enps.responses} answers · % promoters (9–10) minus % detractors (0–6)`} />
              <CardBody>
                <div className="ep-enps" role="img" aria-label={`Promoters ${enps.promoters}, passives ${enps.passives}, detractors ${enps.detractors}`}>
                  <span className="ep-enps-seg ep-enps-seg--promoter" style={{ width: `${(enps.promoters * 100) / enpsTotal}%` }} />
                  <span className="ep-enps-seg ep-enps-seg--passive" style={{ width: `${(enps.passives * 100) / enpsTotal}%` }} />
                  <span className="ep-enps-seg ep-enps-seg--detractor" style={{ width: `${(enps.detractors * 100) / enpsTotal}%` }} />
                </div>
                <ul className="legend ep-enps-legend">
                  <li><span className="ep-dot ep-enps-seg--promoter" aria-hidden="true" />Promoters <strong className="num">{enps.promoters}</strong></li>
                  <li><span className="ep-dot ep-enps-seg--passive" aria-hidden="true" />Passives <strong className="num">{enps.passives}</strong></li>
                  <li><span className="ep-dot ep-enps-seg--detractor" aria-hidden="true" />Detractors <strong className="num">{enps.detractors}</strong></li>
                </ul>
              </CardBody>
            </Card>
          )}
          <div className="grid grid-2">
            {results.questions.map((question, index) => (
              <Card key={question.id} labelledBy={`rq-${question.id}`}>
                <CardHeader
                  id={`rq-${question.id}`}
                  title={`${index + 1}. ${question.prompt}`}
                  description={`${surveyQuestionKinds[question.kind]} · ${pluralize(question.answered, "answer")}${question.average ? ` · average ${question.average}` : ""}`}
                />
                <CardBody>
                  {question.kind === "text" ? (
                    question.texts.length ? (
                      <ul className="ep-quotes">
                        {question.texts.map((text) => (
                          <li key={text.id}>
                            <blockquote className="text-block">{text.body}</blockquote>
                            <span className="small muted">— {text.author ?? "Anonymous"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No written answers yet.</p>
                    )
                  ) : (
                    <Bars rows={question.distribution} label={question.prompt} />
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
      <Card labelledBy="dept-breakdown">
        <CardHeader id="dept-breakdown" title="Department breakdown" description={survey.anonymous ? `Departments with fewer than ${survey.minResponses} responses are hidden to protect anonymity.` : undefined} />
        <CardBody className="flush">
          <DataTable
            caption="Responses by department"
            rows={results.departments}
            rowKey={(row) => row.name}
            mobileRow={(row) => ({
              title: row.name,
              meta: row.suppressed ? `Fewer than ${survey.minResponses} responses — hidden` : `${row.responses}/${row.eligible} responses · eNPS ${row.enps ?? "—"} · rating ${row.averageRating ?? "—"}`,
            })}
            columns={[
              { key: "name", header: "Department", rowHeader: true, cell: (row) => row.name },
              { key: "eligible", header: "Eligible", align: "end", cell: (row) => <span className="num">{row.eligible}</span> },
              { key: "responses", header: "Responses", align: "end", cell: (row) => (row.suppressed ? <span className="muted">Fewer than {survey.minResponses}</span> : <span className="num">{row.responses}</span>) },
              { key: "enps", header: "eNPS", align: "end", cell: (row) => (row.suppressed ? <span className="muted">Hidden</span> : <span className="num">{row.enps ?? "—"}</span>) },
              { key: "rating", header: "Avg rating", align: "end", cell: (row) => (row.suppressed ? <span className="muted">Hidden</span> : <span className="num">{row.averageRating ?? "—"}</span>) },
            ]}
          />
        </CardBody>
      </Card>
      <div className="grid grid-2">
        <Card labelledBy="survey-questions">
          <CardHeader id="survey-questions" title="Questions" />
          <ol className="list">
            {survey.questions.map((question, index) => (
              <li key={question.id} className="list-row">
                <div className="list-row-inner">
                  <span className="list-text">
                    <span className="list-title">
                      {index + 1}. {question.prompt}
                    </span>
                    <span className="list-meta">
                      {surveyQuestionKinds[question.kind]} · {question.required ? "Required" : "Optional"}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <AuditCard survey={survey} />
      </div>
      <p className="small muted">Results are computed from mock responses held in memory; nothing is sent to an external survey provider.</p>
    </div>
  );
}
