import Link from "next/link";
import {
  ConvertSheet,
  EraseSheet,
  InterviewSheet,
  MoveStageSheet,
  NoteForm,
  OfferResponse,
  OfferSheet,
} from "@/components/features/recruitment/recruitment-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DateText, KeyValueList, MoneyText, StatusBadge, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { formatBytes, formatDate, formatDateTime, formatMoney, formatMoneyCompact } from "@/lib/utils/format";
import { InterviewCard, MockNote, offerStatus, stageStatus } from "@/components/sections/recruitment/recruitment-ui";
import { sourceLabels, type CandidateDetail, type JobDetail, type RecruitmentOptions } from "@/types/recruitment";

export function CandidateProfileSection({ candidate, job, options }: { candidate: CandidateDetail; job: JobDetail; options: RecruitmentOptions }) {
  const { permissions: can, offer } = candidate;
  const erased = candidate.erased;
  const budget = offer?.budgetMax ?? job.ctcMax;
  return (
    <div className="page">
      <PageHeader
        back={{ href: `/recruitment/${job.id}`, label: job.title }}
        eyebrow={candidate.reference}
        title={candidate.name}
        description={
          <>
            {job.title} · {sourceLabels[candidate.source]} · applied <DateText value={candidate.appliedAt.slice(0, 10)} />
          </>
        }
        actions={
          <>
            {can.canMove && <MoveStageSheet candidateId={candidate.id} name={candidate.name} stage={candidate.stage} version={candidate.version} />}
            {can.canSchedule && <InterviewSheet candidateId={candidate.id} people={options.people} today={options.today} />}
            {can.canOffer && (
              <OfferSheet
                candidateId={candidate.id}
                options={options}
                budgetLabel={`up to ${formatMoney(budget, { decimals: false })}`}
                defaults={{
                  designation: job.title,
                  department: job.department,
                  location: job.location,
                  managerId: job.hiringManagerId,
                  ctc: candidate.expectedCtc ? (candidate.expectedCtc.amount.split(".")[0] ?? "") : "",
                }}
              />
            )}
          </>
        }
      />
      <div className="cluster">
        <StatusBadge status={stageStatus[candidate.stage]} />
        {candidate.possibleDuplicate && !candidate.duplicateOf && <span className="muted small">Shares email or mobile with another application</span>}
      </div>

      {erased && (
        <Alert tone="neutral" title="Personal data erased">
          Erased on {formatDateTime(candidate.erasedAt ?? candidate.appliedAt)}. Only stage, source and dates remain for hiring statistics.
        </Alert>
      )}
      {candidate.employeeId && (
        <Alert tone="success" title="Hired — linked employee record" action={<ButtonLink href={`/employees/${candidate.employeeId}`} size="sm">Open in People</ButtonLink>}>
          This candidate and the employee record are one identity. Further changes happen in People and Onboarding.
        </Alert>
      )}
      {candidate.duplicateOf && (
        <Alert tone="warning" title="Linked application">
          Same person as <Link href={`/recruitment/candidates/${candidate.duplicateOf.id}`} className="inline-link">{candidate.duplicateOf.reference}</Link> ({candidate.duplicateOf.jobTitle}).
        </Alert>
      )}
      {candidate.retentionDue && (
        <Alert tone="danger" title="Retention period ended">
          Consent covered use until {formatDate(candidate.retainUntil)}. Erase the personal data unless a new consent is recorded.
        </Alert>
      )}

      <div className="split">
        <div className="stack">
          <Card>
            <CardHeader title="Candidate details" description="HR-only. Panelists see experience and company only." />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Email", value: candidate.email ?? "—" },
                  { label: "Mobile", value: candidate.phone ?? "—" },
                  { label: "Current company", value: candidate.currentCompany ?? "—" },
                  { label: "Experience", value: `${candidate.experienceYears} years` },
                  { label: "Notice period", value: candidate.noticePeriodDays === null ? "—" : `${candidate.noticePeriodDays} days` },
                  { label: "Source", value: candidate.referrer ? `${sourceLabels[candidate.source]} · ${candidate.referrer.name}` : sourceLabels[candidate.source] },
                  { label: "Current CTC", value: candidate.currentCtc ? <MoneyText value={candidate.currentCtc} compact /> : "—" },
                  { label: "Expected CTC", value: candidate.expectedCtc ? <MoneyText value={candidate.expectedCtc} compact /> : "—" },
                  ...(candidate.rejectionReason ? [{ label: "Rejection reason", value: candidate.rejectionReason }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Interviews" description="Feedback is independent: panelists see others' scorecards only after submitting." />
            <CardBody className="stack">
              {candidate.interviews.length ? (
                candidate.interviews.map((interview) => <InterviewCard key={interview.id} interview={interview} />)
              ) : (
                <EmptyState compact icon="calendar" title="No interviews yet" description={can.canSchedule ? "Schedule the first round from the actions above." : "Interviews are scheduled from Screening or Interview."} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Offer" action={offer ? <StatusBadge status={offerStatus[offer.state]} /> : undefined} />
            <CardBody className="stack">
              {offer ? (
                <>
                  <KeyValueList
                    items={[
                      { label: "Reference", value: offer.reference },
                      { label: "Annual CTC", value: <MoneyText value={offer.ctc} />, hint: offer.overBudget ? `Above budget (${formatMoneyCompact(offer.budgetMax)}) — Finance approval` : `Within budget (${formatMoneyCompact(offer.budgetMax)})` },
                      { label: "Designation", value: offer.designation },
                      { label: "Joining date", value: <DateText value={offer.joiningDate} /> },
                      { label: "Department · location", value: `${offer.department} · ${offer.location}` },
                      { label: "Reporting manager", value: offer.manager.name },
                      ...(offer.approver ? [{ label: "Finance decision", value: `${offer.approver.name}${offer.approvalNote ? ` — ${offer.approvalNote}` : ""}` }] : []),
                      ...(offer.responseNote ? [{ label: "Candidate response", value: offer.responseNote }] : []),
                    ]}
                  />
                  {offer.state === "pending_approval" && <Alert tone="warning">Waiting for a Finance approver. HR can&apos;t extend an above-budget offer alone.</Alert>}
                  {offer.state === "approval_rejected" && <Alert tone="danger">Finance sent this offer back. Create a revised offer.</Alert>}
                  <div className="cluster">
                    {!erased && offer.state !== "pending_approval" && offer.state !== "approval_rejected" && (
                      <ButtonLink href={`/recruitment/candidates/${candidate.id}/offer-letter`} size="sm">
                        Offer letter
                      </ButtonLink>
                    )}
                    {offer.state === "extended" && <OfferResponse offerId={offer.id} version={offer.version} />}
                    {can.canConvert && (
                      <ConvertSheet
                        offerId={offer.id}
                        summary={`${candidate.name} joins as ${offer.designation}, ${offer.department} · ${offer.location}, reporting to ${offer.manager.name}, from ${formatDate(offer.joiningDate)}.`}
                      />
                    )}
                  </div>
                </>
              ) : (
                <EmptyState compact icon="document" title="No offer yet" description="Create an offer once interviews are complete." />
              )}
            </CardBody>
          </Card>

          {!erased && (
            <Card>
              <CardHeader title="Notes" description="Visible to HR only." />
              <CardBody className="stack">
                <NoteForm candidateId={candidate.id} />
                {candidate.notes.length > 0 && (
                  <ul className="rec-notes">
                    {candidate.notes.map((note) => (
                      <li key={note.id}>
                        <p className="text-block">{note.body}</p>
                        <p className="muted small">
                          {note.author.name} · {formatDateTime(note.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Consent & retention" />
            <CardBody className="stack">
              <KeyValueList
                columns={1}
                items={[
                  { label: "Consent recorded", value: candidate.consentAt ? formatDateTime(candidate.consentAt) : "—" },
                  { label: "Retain until", value: <DateText value={candidate.retainUntil} />, hint: "12 months from application or last decision" },
                ]}
              />
              {can.canErase ? <EraseSheet candidateId={candidate.id} /> : <p className="muted small">{can.eraseBlockedReason}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Resume" />
            <CardBody>
              {candidate.resume ? (
                <KeyValueList columns={1} items={[{ label: "File", value: candidate.resume.name }, { label: "Size", value: formatBytes(candidate.resume.sizeBytes) }]} />
              ) : (
                <p className="muted">No resume on file.</p>
              )}
              <MockNote>Demo: only file metadata is stored; files aren&apos;t served. The live service scans and serves files through access-checked links.</MockNote>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <Timeline
                items={candidate.timeline.map((event) => ({
                  id: event.id,
                  title: event.title,
                  detail: event.detail ?? undefined,
                  meta: `${event.actor} · ${formatDateTime(event.at)}`,
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
