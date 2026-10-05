import Link from "next/link";
import { ScorecardSheet } from "@/components/features/recruitment/recruitment-forms";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { PersonCell, StatusBadge } from "@/components/ui/display";
import { formatDateTime, pluralize } from "@/lib/utils/format";
import type { Tone } from "@/types/common";
import {
  interviewModeLabels,
  interviewTypeLabels,
  recommendationLabels,
  type Interview,
  type InterviewState,
  type JobState,
  type OfferState,
  type RecruitmentStage,
  type RequisitionState,
} from "@/types/recruitment";

type StatusMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const stageStatus: StatusMap<RecruitmentStage> = {
  applied: { label: "Applied", tone: "neutral" },
  screening: { label: "Screening", tone: "info" },
  interview: { label: "Interview", tone: "info" },
  offer: { label: "Offer", tone: "warning" },
  hired: { label: "Hired", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};
export const jobStatus: StatusMap<JobState> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
  filled: { label: "Filled", tone: "info" },
};
export const requisitionStatus: StatusMap<RequisitionState> = {
  pending: { label: "Awaiting HR", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};
export const offerStatus: StatusMap<OfferState> = {
  pending_approval: { label: "Awaiting Finance", tone: "warning" },
  extended: { label: "Extended", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  approval_rejected: { label: "Sent back", tone: "danger" },
};
export const interviewStatus: StatusMap<InterviewState> = {
  scheduled: { label: "Scheduled", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const recommendationTone: Record<keyof typeof recommendationLabels, Tone> = { strong_yes: "success", yes: "success", no: "danger", strong_no: "danger" };

export function MockNote({ children }: { children: React.ReactNode }) {
  return <p className="muted small rec-mock-note">{children}</p>;
}

/** Interview with panel, independent scorecards and (for panelists) the submit action. */
export function InterviewCard({ interview, candidateHref }: { interview: Interview; candidateHref?: string }) {
  const submitted = interview.panel.filter((member) => member.submitted).length;
  return (
    <article className="rec-interview" aria-labelledby={`iv-${interview.id}-title`}>
      <div className="rec-interview-head">
        <div>
          <h3 id={`iv-${interview.id}-title`} className="rec-interview-title">
            {candidateHref ? <Link href={candidateHref}>{interview.candidateName}</Link> : interview.candidateName}
            <span className="muted"> · Round {interview.round} · {interviewTypeLabels[interview.type]}</span>
          </h3>
          <p className="muted rec-interview-meta">
            {interview.jobTitle} · <time dateTime={interview.scheduledAt}>{formatDateTime(interview.scheduledAt)}</time> · {interview.durationMinutes} min · {interviewModeLabels[interview.mode]}
          </p>
          <p className="muted rec-interview-meta">
            <AppIcon name={interview.mode === "online" ? "monitor" : "location"} size={16} /> <span className="rec-break">{interview.locationOrLink}</span>
          </p>
        </div>
        <StatusBadge status={interviewStatus[interview.state]} />
      </div>
      <p className="muted small">
        Candidate: {interview.candidateSummary.experienceYears} yrs experience{interview.candidateSummary.currentCompany ? ` · ${interview.candidateSummary.currentCompany}` : ""}
        {interview.candidateSummary.resumeName ? ` · resume on file (${interview.candidateSummary.resumeName})` : ""}
      </p>
      <ul className="rec-panel" aria-label="Panel">
        {interview.panel.map((member) => (
          <li key={member.person.id}>
            <PersonCell person={member.person} meta={member.submitted ? "Scorecard submitted" : "Scorecard pending"} />
          </li>
        ))}
      </ul>
      <p className="small muted">{`${submitted} of ${pluralize(interview.panel.length, "scorecard")} in`}</p>
      {interview.canSubmit && <ScorecardSheet interviewId={interview.id} candidateName={interview.candidateName} />}
      {interview.isPanelist && !interview.canSubmit && !interview.myScorecardSubmitted && interview.submitBlockedReason && <p className="small muted">{interview.submitBlockedReason}</p>}
      {interview.feedbackHidden && (
        <p className="rec-hidden-feedback small">
          <AppIcon name="lock" size={16} /> Other panelists&apos; feedback stays hidden until you submit yours.
        </p>
      )}
      {interview.scorecards.length > 0 && (
        <ul className="rec-scorecards" aria-label="Scorecards">
          {interview.scorecards.map((card) => (
            <li key={card.panelist.id} className="rec-scorecard">
              <div className="rec-scorecard-head">
                <strong>{card.panelist.name}</strong>
                <Badge tone={recommendationTone[card.recommendation]}>{recommendationLabels[card.recommendation]}</Badge>
                <span className="muted small num">Avg {card.average} / 5</span>
              </div>
              <dl className="rec-ratings">
                {card.ratings.map((rating) => (
                  <div key={rating.criterion}>
                    <dt>{rating.label}</dt>
                    <dd>
                      <span className="rec-dots" aria-label={`${rating.rating} of 5`}>
                        {[1, 2, 3, 4, 5].map((dot) => (
                          <span key={dot} className="rec-dot" data-on={dot <= rating.rating || undefined} aria-hidden="true" />
                        ))}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-block">{card.comments}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
