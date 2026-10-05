import { PollComposer } from "@/components/features/engage/poll-composer";
import { SurveyResponseSheet } from "@/components/features/engage/survey-response";
import { EngageTabs, PollCard } from "@/components/sections/engage/engage-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconTile, ListRow } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { addDays } from "@/lib/utils/date";
import { formatDate, pluralize } from "@/lib/utils/format";
import type { PollsPage, SurveyForYou } from "@/types/engage";

export function PollsSection({ page, surveys, today, canPost, anyDepartment }: { page: PollsPage; surveys: SurveyForYou[]; today: string; canPost: boolean; anyDepartment: boolean }) {
  const open = page.polls.filter((poll) => poll.state === "open");
  const closed = page.polls.filter((poll) => poll.state === "closed");
  const pending = surveys.filter((survey) => !survey.responded).length;
  return (
    <div className="page">
      <PageHeader
        title="Polls & surveys"
        description="Quick polls from colleagues and HR surveys that shape how we work."
        actions={canPost ? <PollComposer today={today} maxDate={addDays(today, 30)} departments={page.departments} myDepartment={page.myDepartment} anyDepartment={anyDepartment} /> : undefined}
      />
      <EngageTabs active="polls" />
      <Card labelledBy="surveys-for-you">
        <CardHeader id="surveys-for-you" title="Surveys for you" description={pending ? `${pluralize(pending, "survey")} waiting for your response` : "You’re all caught up"} />
        {surveys.length ? (
          <ul className="list">
            {surveys.map((survey) => (
              <ListRow
                key={survey.id}
                leading={<IconTile icon="clipboard" accent={survey.responded ? "neutral" : "magenta"} />}
                title={survey.title}
                meta={
                  <>
                    {pluralize(survey.questionCount, "question")} · closes {formatDate(survey.closesOn)}
                    {survey.anonymous ? " · Anonymous" : ""}
                  </>
                }
                trailing={survey.responded ? <Badge tone="success">Response submitted</Badge> : <SurveyResponseSheet survey={survey} />}
              />
            ))}
          </ul>
        ) : (
          <CardBody>
            <EmptyState compact icon="clipboard" title="No surveys right now" description="When HR opens a survey for you, it appears here." />
          </CardBody>
        )}
      </Card>
      <section className="stack" aria-labelledby="open-polls">
        <SectionHeading id="open-polls" title="Open polls" description={open.length ? `${pluralize(open.length, "poll")} accepting votes` : undefined} />
        {open.length ? (
          <div className="ep-poll-grid">
            {open.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon="chart" title="No open polls" description={canPost ? "Ask the team something — polls take under a minute to set up." : "Check back soon."} />
          </Card>
        )}
      </section>
      {closed.length > 0 && (
        <section className="stack" aria-labelledby="closed-polls">
          <SectionHeading id="closed-polls" title="Closed polls" description="Final results" />
          <div className="ep-poll-grid">
            {closed.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}
      <p className="small muted">Mock backend: votes and responses are held in memory and reset daily.</p>
    </div>
  );
}
