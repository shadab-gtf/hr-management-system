"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ConfirmButton,
  FormSheet,
} from "@/components/features/admin/form-sheet";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectInput,
  TextArea,
  TextInput,
  describedBy,
} from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import {
  addCandidateAction,
  addNoteAction,
  changeJobStateAction,
  convertOfferAction,
  createOfferAction,
  decideOfferAction,
  decideRequisitionAction,
  eraseCandidateAction,
  moveStageAction,
  raiseRequisitionAction,
  respondOfferAction,
  saveJobAction,
  scheduleInterviewAction,
  submitScorecardAction,
} from "@/lib/actions/recruitment";
import type { PersonRef } from "@/types/common";
import type { ActionResult } from "@/types/action";
import {
  employmentTypeLabels,
  interviewModeLabels,
  interviewTypeLabels,
  recommendationLabels,
  scorecardCriteria,
  sourceLabels,
  stageLabels,
  stageOrder,
  type CandidateSource,
  type JobDetail,
  type JobState,
  type RecruitmentOptions,
  type RecruitmentStage,
} from "@/types/recruitment";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});
const opts = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value }));
const employmentOptions = Object.entries(employmentTypeLabels).map(
  ([value, label]) => ({ value, label }),
);
const peopleOptions = (people: PersonRef[]) =>
  people.map((person) => ({
    value: person.id,
    label: `${person.name} · ${person.designation}`,
  }));
/** Whole rupees without paise, for editing forms. */
const rupees = (amount: string) => amount.split(".")[0] ?? "";

type FormAction = (
  prev: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

/** One-click command posted as a form so it gets an idempotency key and inline error. */
export function CommandButton({
  action,
  fields,
  label,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "sm",
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const { submit, pending, state } = useCommand(action);
  return (
    <form onSubmit={submit} className="rec-inline-form">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} size={size} pending={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {state.status === "error" && (
        <span className="field-error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}

/* Requisitions --------------------------------------------------------------- */

export function RequisitionSheet({ options }: { options: RecruitmentOptions }) {
  const [justification, setJustification] = useState("new_role");
  return (
    <FormSheet
      action={raiseRequisitionAction}
      title="Raise a hiring requisition"
      description="HR reviews the role, headcount and budget before it becomes a job opening."
      trigger="Raise requisition"
      icon="userAdd"
      submitLabel="Send for approval"
      pendingLabel="Sending…"
    >
      {(fieldError) => (
        <>
          <FormField
            id="rq-title"
            label="Role"
            required
            error={fieldError("title")}
          >
            <TextInput
              id="rq-title"
              name="title"
              maxLength={80}
              {...err("rq-title", fieldError("title"))}
            />
          </FormField>
          <div className="form-row">
            <FormField
              id="rq-department"
              label="Department"
              required
              error={fieldError("department")}
            >
              <SelectInput
                id="rq-department"
                name="department"
                placeholder="Choose"
                options={opts(options.departments)}
                {...err("rq-department", fieldError("department"))}
              />
            </FormField>
            <FormField
              id="rq-location"
              label="Location"
              required
              error={fieldError("location")}
            >
              <SelectInput
                id="rq-location"
                name="location"
                placeholder="Choose"
                options={opts(options.locations)}
                {...err("rq-location", fieldError("location"))}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField
              id="rq-openings"
              label="Openings"
              required
              error={fieldError("openings")}
            >
              <TextInput
                id="rq-openings"
                name="openings"
                type="number"
                min={1}
                max={20}
                defaultValue={1}
                inputMode="numeric"
                {...err("rq-openings", fieldError("openings"))}
              />
            </FormField>
            <FormField id="rq-type" label="Employment type" required>
              <SelectInput
                id="rq-type"
                name="employmentType"
                defaultValue="full_time"
                options={employmentOptions}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField
              id="rq-min"
              label="Budget CTC from (₹ / year)"
              required
              error={fieldError("budgetMin")}
            >
              <TextInput
                id="rq-min"
                name="budgetMin"
                inputMode="numeric"
                placeholder="1200000"
                {...err("rq-min", fieldError("budgetMin"))}
              />
            </FormField>
            <FormField
              id="rq-max"
              label="Budget CTC to (₹ / year)"
              required
              error={fieldError("budgetMax")}
            >
              <TextInput
                id="rq-max"
                name="budgetMax"
                inputMode="numeric"
                placeholder="1800000"
                {...err("rq-max", fieldError("budgetMax"))}
              />
            </FormField>
          </div>
          <FormField id="rq-justification" label="Justification" required>
            <SelectInput
              id="rq-justification"
              name="justification"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              options={[
                { value: "new_role", label: "New role (headcount increase)" },
                { value: "backfill", label: "Backfill (replacement)" },
              ]}
            />
          </FormField>
          {justification === "backfill" && (
            <FormField
              id="rq-backfill"
              label="Backfilling for"
              required
              error={fieldError("backfillFor")}
            >
              <TextInput
                id="rq-backfill"
                name="backfillFor"
                maxLength={80}
                placeholder="Name or role of the person leaving"
                {...err("rq-backfill", fieldError("backfillFor"))}
              />
            </FormField>
          )}
          <FormField
            id="rq-reason"
            label="Business case"
            required
            error={fieldError("reason")}
          >
            <TextArea
              id="rq-reason"
              name="reason"
              rows={3}
              maxLength={600}
              {...err("rq-reason", fieldError("reason"))}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RequisitionDecision({
  requisitionId,
  version,
  title,
}: {
  requisitionId: string;
  version: number;
  title: string;
}) {
  return (
    <div className="row-actions">
      <CommandButton
        action={decideRequisitionAction}
        fields={{
          requisitionId,
          decision: "approve",
          expectedVersion: version,
        }}
        label="Approve"
        pendingLabel="Approving…"
      />
      <FormSheet
        action={decideRequisitionAction}
        title={`Reject ${title}`}
        description="The manager sees your reason."
        trigger="Reject"
        triggerVariant="ghost"
        triggerSize="sm"
        submitLabel="Reject requisition"
        submitVariant="danger"
      >
        {(fieldError) => (
          <>
            <input type="hidden" name="requisitionId" value={requisitionId} />
            <input type="hidden" name="decision" value="reject" />
            <input type="hidden" name="expectedVersion" value={version} />
            <FormField
              id={`rq-note-${requisitionId}`}
              label="Reason"
              required
              error={fieldError("note")}
            >
              <TextArea
                id={`rq-note-${requisitionId}`}
                name="note"
                rows={3}
                maxLength={400}
                {...err(`rq-note-${requisitionId}`, fieldError("note"))}
              />
            </FormField>
          </>
        )}
      </FormSheet>
    </div>
  );
}

/* Jobs ----------------------------------------------------------------------- */

export function JobSheet({
  job,
  options,
}: {
  job?: JobDetail;
  options: RecruitmentOptions;
}) {
  const id = job?.id ?? "new";
  return (
    <FormSheet
      action={saveJobAction}
      title={job ? `Edit ${job.title}` : "New job opening"}
      description="The CTC range is internal and never shown on the careers page."
      trigger={job ? "Edit job" : "New job"}
      triggerVariant={job ? "secondary" : "primary"}
      icon={job ? "edit" : "add"}
      submitLabel={job ? "Save changes" : "Create draft"}
    >
      {(fieldError) => (
        <>
          {job && <input type="hidden" name="jobId" value={job.id} />}
          {job && (
            <input type="hidden" name="expectedVersion" value={job.version} />
          )}
          <FormField
            id={`job-title-${id}`}
            label="Job title"
            required
            error={fieldError("title")}
          >
            <TextInput
              id={`job-title-${id}`}
              name="title"
              defaultValue={job?.title}
              maxLength={80}
              {...err(`job-title-${id}`, fieldError("title"))}
            />
          </FormField>
          <div className="form-row">
            <FormField
              id={`job-dept-${id}`}
              label="Department"
              required
              error={fieldError("department")}
            >
              <SelectInput
                id={`job-dept-${id}`}
                name="department"
                defaultValue={job?.department ?? ""}
                placeholder="Choose"
                options={opts(options.departments)}
                {...err(`job-dept-${id}`, fieldError("department"))}
              />
            </FormField>
            <FormField
              id={`job-loc-${id}`}
              label="Location"
              required
              error={fieldError("location")}
            >
              <SelectInput
                id={`job-loc-${id}`}
                name="location"
                defaultValue={job?.location ?? ""}
                placeholder="Choose"
                options={opts(options.locations)}
                {...err(`job-loc-${id}`, fieldError("location"))}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`job-type-${id}`} label="Employment type" required>
              <SelectInput
                id={`job-type-${id}`}
                name="employmentType"
                defaultValue={job?.employmentType ?? "full_time"}
                options={employmentOptions}
              />
            </FormField>
            <FormField
              id={`job-openings-${id}`}
              label="Openings"
              required
              error={fieldError("openings")}
            >
              <TextInput
                id={`job-openings-${id}`}
                name="openings"
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                defaultValue={job?.openings ?? 1}
                {...err(`job-openings-${id}`, fieldError("openings"))}
              />
            </FormField>
          </div>
          <FormField
            id={`job-manager-${id}`}
            label="Hiring manager"
            required
            error={fieldError("hiringManagerId")}
          >
            <SelectInput
              id={`job-manager-${id}`}
              name="hiringManagerId"
              defaultValue={job?.hiringManagerId ?? ""}
              placeholder="Choose"
              options={peopleOptions(options.people)}
              {...err(`job-manager-${id}`, fieldError("hiringManagerId"))}
            />
          </FormField>
          <FormField
            id={`job-desc-${id}`}
            label="Description"
            required
            hint="At least 50 characters. Shown on the careers page."
            error={fieldError("description")}
          >
            <TextArea
              id={`job-desc-${id}`}
              name="description"
              rows={5}
              maxLength={4000}
              defaultValue={job?.description}
              {...err(`job-desc-${id}`, fieldError("description"), true)}
            />
          </FormField>
          <FormField
            id={`job-skills-${id}`}
            label="Skills"
            required
            hint="Comma separated, up to 12."
            error={fieldError("skills")}
          >
            <TextInput
              id={`job-skills-${id}`}
              name="skills"
              defaultValue={job?.skills.join(", ")}
              {...err(`job-skills-${id}`, fieldError("skills"), true)}
            />
          </FormField>
          <div className="form-row">
            <FormField
              id={`job-expmin-${id}`}
              label="Experience from (years)"
              required
              error={fieldError("experienceMin")}
            >
              <TextInput
                id={`job-expmin-${id}`}
                name="experienceMin"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                defaultValue={job?.experienceMin ?? 0}
                {...err(`job-expmin-${id}`, fieldError("experienceMin"))}
              />
            </FormField>
            <FormField
              id={`job-expmax-${id}`}
              label="Experience to (years)"
              required
              error={fieldError("experienceMax")}
            >
              <TextInput
                id={`job-expmax-${id}`}
                name="experienceMax"
                type="number"
                min={0}
                max={40}
                inputMode="numeric"
                defaultValue={job?.experienceMax ?? 5}
                {...err(`job-expmax-${id}`, fieldError("experienceMax"))}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField
              id={`job-ctcmin-${id}`}
              label="CTC from (₹ / year)"
              required
              error={fieldError("ctcMin")}
            >
              <TextInput
                id={`job-ctcmin-${id}`}
                name="ctcMin"
                inputMode="numeric"
                defaultValue={job ? rupees(job.ctcMin.amount) : ""}
                {...err(`job-ctcmin-${id}`, fieldError("ctcMin"))}
              />
            </FormField>
            <FormField
              id={`job-ctcmax-${id}`}
              label="CTC to (₹ / year)"
              required
              error={fieldError("ctcMax")}
            >
              <TextInput
                id={`job-ctcmax-${id}`}
                name="ctcMax"
                inputMode="numeric"
                defaultValue={job ? rupees(job.ctcMax.amount) : ""}
                {...err(`job-ctcmax-${id}`, fieldError("ctcMax"))}
              />
            </FormField>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              name="publishToCareers"
              defaultChecked={job?.publishToCareers ?? true}
            />
            <span>List on the public careers page once published</span>
          </label>
        </>
      )}
    </FormSheet>
  );
}

export function JobStateActions({
  jobId,
  state,
  version,
}: {
  jobId: string;
  state: JobState;
  version: number;
}) {
  const [pending, startTransition] = useTransition();
  const go = (to: "published" | "on_hold") =>
    startTransition(async () => {
      const result = await changeJobStateAction(jobId, to, version);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });
  return (
    <>
      {(state === "draft" || state === "on_hold") && (
        <Button onClick={() => go("published")} pending={pending}>
          <AppIcon name="globe" size={20} />
          {state === "draft" ? "Publish" : "Resume hiring"}
        </Button>
      )}
      {state === "published" && (
        <Button
          variant="secondary"
          onClick={() => go("on_hold")}
          pending={pending}
        >
          <AppIcon name="timer" size={20} />
          Put on hold
        </Button>
      )}
      {(state === "draft" || state === "published" || state === "on_hold") && (
        <ConfirmButton
          label="Close job"
          confirmLabel="Confirm close"
          run={() => changeJobStateAction(jobId, "closed", version)}
        />
      )}
    </>
  );
}

/* Candidates ----------------------------------------------------------------- */

const manualSources = (Object.keys(sourceLabels) as CandidateSource[])
  .filter((source) => source !== "careers")
  .map((value) => ({ value, label: sourceLabels[value] }));

export function CandidateSheet({
  options,
  jobId,
  triggerVariant = "primary",
}: {
  options: RecruitmentOptions;
  jobId?: string;
  triggerVariant?: "primary" | "secondary";
}) {
  const [source, setSource] = useState<string>("linkedin");
  const openJobs = options.jobs.filter(
    (job) => job.state !== "closed" && job.state !== "filled",
  );
  return (
    <FormSheet
      action={addCandidateAction}
      title="Add candidate"
      description="Duplicate check runs on email and mobile. Resume files remain private and require security scanning before download."
      trigger="Add candidate"
      triggerVariant={triggerVariant}
      icon="userAdd"
      submitLabel="Add candidate"
      pendingLabel="Adding…"
    >
      {(fieldError) => (
        <>
          <FormField
            id="cd-job"
            label="Job opening"
            required
            error={fieldError("jobId")}
          >
            <SelectInput
              id="cd-job"
              name="jobId"
              defaultValue={jobId ?? ""}
              placeholder="Choose"
              options={openJobs.map((job) => ({
                value: job.id,
                label: job.title,
              }))}
              {...err("cd-job", fieldError("jobId"))}
            />
          </FormField>
          <FormField
            id="cd-name"
            label="Full name"
            required
            error={fieldError("name")}
          >
            <TextInput
              id="cd-name"
              name="name"
              autoComplete="off"
              maxLength={80}
              {...err("cd-name", fieldError("name"))}
            />
          </FormField>
          <div className="form-row">
            <FormField
              id="cd-email"
              label="Email"
              required
              error={fieldError("email")}
            >
              <TextInput
                id="cd-email"
                name="email"
                type="email"
                autoComplete="off"
                {...err("cd-email", fieldError("email"))}
              />
            </FormField>
            <FormField
              id="cd-phone"
              label="Mobile"
              required
              error={fieldError("phone")}
            >
              <TextInput
                id="cd-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="98100 12345"
                {...err("cd-phone", fieldError("phone"))}
              />
            </FormField>
          </div>
          <label className="check-row">
            <input type="checkbox" name="allowDuplicate" />
            <span>
              Add as a linked application if this person already exists for
              another job
            </span>
          </label>
          <div className="form-row">
            <FormField
              id="cd-company"
              label="Current company"
              error={fieldError("currentCompany")}
            >
              <TextInput
                id="cd-company"
                name="currentCompany"
                maxLength={80}
                {...err("cd-company", fieldError("currentCompany"))}
              />
            </FormField>
            <FormField
              id="cd-exp"
              label="Experience (years)"
              required
              error={fieldError("experienceYears")}
            >
              <TextInput
                id="cd-exp"
                name="experienceYears"
                inputMode="decimal"
                placeholder="4.5"
                {...err("cd-exp", fieldError("experienceYears"))}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField
              id="cd-notice"
              label="Notice period (days)"
              required
              error={fieldError("noticePeriodDays")}
            >
              <TextInput
                id="cd-notice"
                name="noticePeriodDays"
                type="number"
                min={0}
                max={180}
                inputMode="numeric"
                defaultValue={30}
                {...err("cd-notice", fieldError("noticePeriodDays"))}
              />
            </FormField>
            <FormField id="cd-source" label="Source" required>
              <SelectInput
                id="cd-source"
                name="source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                options={manualSources}
              />
            </FormField>
          </div>
          {source === "referral" && (
            <FormField
              id="cd-referrer"
              label="Referred by"
              required
              error={fieldError("referrerId")}
            >
              <SelectInput
                id="cd-referrer"
                name="referrerId"
                placeholder="Choose employee"
                options={peopleOptions(options.people)}
                {...err("cd-referrer", fieldError("referrerId"))}
              />
            </FormField>
          )}
          <div className="form-row">
            <FormField
              id="cd-cctc"
              label="Current CTC (₹ / year)"
              error={fieldError("currentCtc")}
            >
              <TextInput
                id="cd-cctc"
                name="currentCtc"
                inputMode="numeric"
                {...err("cd-cctc", fieldError("currentCtc"))}
              />
            </FormField>
            <FormField
              id="cd-ectc"
              label="Expected CTC (₹ / year)"
              error={fieldError("expectedCtc")}
            >
              <TextInput
                id="cd-ectc"
                name="expectedCtc"
                inputMode="numeric"
                {...err("cd-ectc", fieldError("expectedCtc"))}
              />
            </FormField>
          </div>
          <FormField
            id="cd-resume"
            label="Resume"
            hint="PDF or Word, up to 5 MB."
            error={fieldError("resume")}
          >
            <input
              id="cd-resume"
              name="resume"
              type="file"
              className="input"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              {...err("cd-resume", fieldError("resume"), true)}
            />
          </FormField>
          <label className="check-row">
            <input
              type="checkbox"
              name="consent"
              aria-invalid={Boolean(fieldError("consent"))}
            />
            <span>
              The candidate agreed to GTF processing their details for
              recruitment and keeping them for 12 months.
            </span>
          </label>
          {fieldError("consent") && (
            <p className="field-error">{fieldError("consent")}</p>
          )}
        </>
      )}
    </FormSheet>
  );
}

export function MoveStageSheet({
  candidateId,
  name,
  stage,
  version,
  compact = false,
}: {
  candidateId: string;
  name: string;
  stage: RecruitmentStage;
  version: number;
  compact?: boolean;
}) {
  const choices =
    stage === "rejected"
      ? (["applied", "screening"] as RecruitmentStage[])
      : stageOrder.filter((item) => item !== stage && item !== "hired");
  const [to, setTo] = useState<string>(choices[0] ?? "screening");
  const field = `mv-${candidateId}`;
  return (
    <FormSheet
      action={moveStageAction}
      title={`Move ${name}`}
      description={
        stage === "rejected"
          ? "Reopen a rejected candidate."
          : "Hired is set only by converting an accepted offer."
      }
      trigger={
        stage === "rejected" ? "Reopen" : compact ? "Move" : "Move stage"
      }
      triggerVariant={compact ? "ghost" : "secondary"}
      triggerSize="sm"
      icon={compact ? undefined : "swap"}
      submitLabel={to === "rejected" ? "Reject candidate" : "Move candidate"}
      submitVariant={to === "rejected" ? "danger" : "primary"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="candidateId" value={candidateId} />
          <input type="hidden" name="expectedVersion" value={version} />
          <FormField
            id={`${field}-to`}
            label="New stage"
            required
            error={fieldError("to")}
          >
            <SelectInput
              id={`${field}-to`}
              name="to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              options={choices.map((value) => ({
                value,
                label: stageLabels[value],
              }))}
              {...err(`${field}-to`, fieldError("to"))}
            />
          </FormField>
          <FormField
            id={`${field}-reason`}
            label={to === "rejected" ? "Rejection reason" : "Note (optional)"}
            required={to === "rejected"}
            hint={
              to === "rejected"
                ? "Kept on the candidate record; not shared with the candidate."
                : undefined
            }
            error={fieldError("reason")}
          >
            <TextArea
              id={`${field}-reason`}
              name="reason"
              rows={3}
              maxLength={400}
              {...err(
                `${field}-reason`,
                fieldError("reason"),
                to === "rejected",
              )}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function NoteForm({ candidateId }: { candidateId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldError } = useCommand(addNoteAction, {
    onSuccess: () => form.current?.reset(),
  });
  return (
    <form ref={form} onSubmit={submit} className="form" noValidate>
      <input type="hidden" name="candidateId" value={candidateId} />
      <FormField id="note-body" label="Add a note" error={fieldError("body")}>
        <TextArea
          id="note-body"
          name="body"
          rows={2}
          maxLength={1000}
          {...err("note-body", fieldError("body"))}
        />
      </FormField>
      <div className="sheet-actions">
        <Button type="submit" size="sm" pending={pending}>
          {pending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}

export function EraseSheet({ candidateId }: { candidateId: string }) {
  return (
    <FormSheet
      action={eraseCandidateAction}
      title="Erase personal data"
      description="Removes name, contact details, pay, resume details, notes and feedback comments. Stage, source and dates stay for hiring statistics. This can't be undone."
      trigger="Erase personal data"
      triggerVariant="ghost"
      triggerSize="sm"
      icon="trash"
      submitLabel="Erase permanently"
      submitVariant="danger"
      pendingLabel="Erasing…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="candidateId" value={candidateId} />
          <label className="check-row">
            <input
              type="checkbox"
              name="confirm"
              aria-invalid={Boolean(fieldError("confirm"))}
            />
            <span>
              I confirm there&apos;s no legal hold or open dispute for this
              candidate.
            </span>
          </label>
          {fieldError("confirm") && (
            <p className="field-error">{fieldError("confirm")}</p>
          )}
        </>
      )}
    </FormSheet>
  );
}

/* Interviews ------------------------------------------------------------------ */

export function InterviewSheet({
  candidateId,
  people,
  today,
}: {
  candidateId: string;
  people: PersonRef[];
  today: string;
}) {
  const [mode, setMode] = useState("online");
  const panel = peopleOptions(people);
  return (
    <FormSheet
      action={scheduleInterviewAction}
      title="Schedule interview"
      description="Panelists get a notification and see it under My interviews."
      trigger="Schedule interview"
      triggerVariant="secondary"
      triggerSize="sm"
      icon="calendar"
      submitLabel="Schedule"
      pendingLabel="Scheduling…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="candidateId" value={candidateId} />
          <div className="form-row">
            <FormField id="iv-type" label="Round type" required>
              <SelectInput
                id="iv-type"
                name="type"
                defaultValue="technical"
                options={Object.entries(interviewTypeLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </FormField>
            <FormField id="iv-duration" label="Duration" required>
              <SelectInput
                id="iv-duration"
                name="durationMinutes"
                defaultValue="60"
                options={[30, 45, 60, 90].map((value) => ({
                  value: String(value),
                  label: `${value} minutes`,
                }))}
              />
            </FormField>
          </div>
          <div className="form-row">
            <FormField
              id="iv-date"
              label="Date"
              required
              error={fieldError("date")}
            >
              <TextInput
                id="iv-date"
                name="date"
                type="date"
                min={today}
                defaultValue={today}
                {...err("iv-date", fieldError("date"))}
              />
            </FormField>
            <FormField
              id="iv-time"
              label="Time (IST)"
              required
              error={fieldError("time")}
            >
              <TextInput
                id="iv-time"
                name="time"
                type="time"
                step={300}
                {...err("iv-time", fieldError("time"))}
              />
            </FormField>
          </div>
          <FormField id="iv-mode" label="Mode" required>
            <SelectInput
              id="iv-mode"
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              options={Object.entries(interviewModeLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </FormField>
          <FormField
            id="iv-where"
            label={mode === "online" ? "Meeting link" : "Room / address"}
            required
            error={fieldError("locationOrLink")}
          >
            <TextInput
              id="iv-where"
              name="locationOrLink"
              maxLength={200}
              defaultValue={
                mode === "online"
                  ? "https://meet.gtf-hr.example/"
                  : "Noida HQ · "
              }
              key={mode}
              {...err("iv-where", fieldError("locationOrLink"))}
            />
          </FormField>
          <fieldset className="rec-fieldset">
            <legend>Panel (1–4 people)</legend>
            {[1, 2, 3, 4].map((slot) => (
              <FormField
                key={slot}
                id={`iv-panel-${slot}`}
                label={`Panelist ${slot}`}
                required={slot === 1}
                error={slot === 1 ? fieldError("panelIds") : undefined}
              >
                <SelectInput
                  id={`iv-panel-${slot}`}
                  name="panelIds"
                  placeholder={slot === 1 ? "Choose" : "None"}
                  options={panel}
                  {...(slot === 1
                    ? err("iv-panel-1", fieldError("panelIds"))
                    : {})}
                />
              </FormField>
            ))}
          </fieldset>
        </>
      )}
    </FormSheet>
  );
}

export function ScorecardSheet({
  interviewId,
  candidateName,
}: {
  interviewId: string;
  candidateName: string;
}) {
  return (
    <FormSheet
      action={submitScorecardAction}
      title={`Scorecard · ${candidateName}`}
      description="Rate independently — other panelists' feedback unlocks after you submit."
      trigger="Submit scorecard"
      triggerSize="sm"
      icon="clipboardTick"
      submitLabel="Submit scorecard"
      pendingLabel="Submitting…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="interviewId" value={interviewId} />
          {scorecardCriteria.map((criterion) => {
            const id = `sc-${interviewId}-${criterion.key}`;
            const error = fieldError(`rating_${criterion.key}`);
            return (
              <fieldset
                key={criterion.key}
                className="rec-rating"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
              >
                <legend>{criterion.label}</legend>
                <div className="rec-rating-options">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="rec-rating-option">
                      <input
                        type="radio"
                        name={`rating_${criterion.key}`}
                        value={value}
                        aria-label={`${criterion.label}: ${value} of 5`}
                      />
                      <span aria-hidden="true">{value}</span>
                    </label>
                  ))}
                </div>
                {error && (
                  <p id={`${id}-error`} className="field-error">
                    {error}
                  </p>
                )}
              </fieldset>
            );
          })}
          <FormField
            id={`sc-${interviewId}-rec`}
            label="Recommendation"
            required
            error={fieldError("recommendation")}
          >
            <SelectInput
              id={`sc-${interviewId}-rec`}
              name="recommendation"
              placeholder="Choose"
              options={Object.entries(recommendationLabels).map(
                ([value, label]) => ({ value, label }),
              )}
              {...err(`sc-${interviewId}-rec`, fieldError("recommendation"))}
            />
          </FormField>
          <FormField
            id={`sc-${interviewId}-comments`}
            label="Comments"
            required
            error={fieldError("comments")}
          >
            <TextArea
              id={`sc-${interviewId}-comments`}
              name="comments"
              rows={4}
              maxLength={2000}
              {...err(`sc-${interviewId}-comments`, fieldError("comments"))}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

/* Offers --------------------------------------------------------------------- */

export function OfferSheet({
  candidateId,
  defaults,
  options,
  budgetLabel,
}: {
  candidateId: string;
  defaults: {
    designation: string;
    department: string;
    location: string;
    managerId: string;
    ctc: string;
  };
  options: RecruitmentOptions;
  budgetLabel: string;
}) {
  return (
    <FormSheet
      action={createOfferAction}
      title="Create offer"
      description={`Approved budget: ${budgetLabel}. Above-budget offers go to Finance for approval before they're extended.`}
      trigger="Create offer"
      triggerSize="sm"
      icon="document"
      submitLabel="Create offer"
      pendingLabel="Creating…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="candidateId" value={candidateId} />
          <div className="form-row">
            <FormField
              id="of-ctc"
              label="Annual CTC (₹)"
              required
              error={fieldError("ctc")}
            >
              <TextInput
                id="of-ctc"
                name="ctc"
                inputMode="numeric"
                defaultValue={defaults.ctc}
                {...err("of-ctc", fieldError("ctc"))}
              />
            </FormField>
            <FormField
              id="of-join"
              label="Joining date"
              required
              error={fieldError("joiningDate")}
            >
              <TextInput
                id="of-join"
                name="joiningDate"
                type="date"
                min={options.today}
                {...err("of-join", fieldError("joiningDate"))}
              />
            </FormField>
          </div>
          <FormField
            id="of-designation"
            label="Designation"
            required
            error={fieldError("designation")}
          >
            <TextInput
              id="of-designation"
              name="designation"
              defaultValue={defaults.designation}
              maxLength={80}
              {...err("of-designation", fieldError("designation"))}
            />
          </FormField>
          <div className="form-row">
            <FormField
              id="of-dept"
              label="Department"
              required
              error={fieldError("department")}
            >
              <SelectInput
                id="of-dept"
                name="department"
                defaultValue={defaults.department}
                options={opts(options.departments)}
                {...err("of-dept", fieldError("department"))}
              />
            </FormField>
            <FormField
              id="of-loc"
              label="Location"
              required
              error={fieldError("location")}
            >
              <SelectInput
                id="of-loc"
                name="location"
                defaultValue={defaults.location}
                options={opts(options.locations)}
                {...err("of-loc", fieldError("location"))}
              />
            </FormField>
          </div>
          <FormField
            id="of-manager"
            label="Reporting manager"
            required
            error={fieldError("managerId")}
          >
            <SelectInput
              id="of-manager"
              name="managerId"
              defaultValue={defaults.managerId}
              options={peopleOptions(options.people)}
              {...err("of-manager", fieldError("managerId"))}
            />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function OfferApproval({
  offerId,
  version,
  reference,
}: {
  offerId: string;
  version: number;
  reference: string;
}) {
  return (
    <div className="row-actions">
      <CommandButton
        action={decideOfferAction}
        fields={{ offerId, decision: "approve", expectedVersion: version }}
        label="Approve offer"
        pendingLabel="Approving…"
      />
      <FormSheet
        action={decideOfferAction}
        title={`Send back ${reference}`}
        description="HR can revise the offer within budget."
        trigger="Send back"
        triggerVariant="ghost"
        triggerSize="sm"
        submitLabel="Send back"
        submitVariant="danger"
      >
        {(fieldError) => (
          <>
            <input type="hidden" name="offerId" value={offerId} />
            <input type="hidden" name="decision" value="reject" />
            <input type="hidden" name="expectedVersion" value={version} />
            <FormField
              id={`of-note-${offerId}`}
              label="Reason"
              required
              error={fieldError("note")}
            >
              <TextArea
                id={`of-note-${offerId}`}
                name="note"
                rows={3}
                maxLength={400}
                {...err(`of-note-${offerId}`, fieldError("note"))}
              />
            </FormField>
          </>
        )}
      </FormSheet>
    </div>
  );
}

export function OfferResponse({
  offerId,
  version,
}: {
  offerId: string;
  version: number;
}) {
  return (
    <div className="row-actions">
      <FormSheet
        action={respondOfferAction}
        title="Mark offer accepted"
        description="Record how the candidate confirmed."
        trigger="Mark accepted"
        triggerSize="sm"
        icon="check"
        submitLabel="Mark accepted"
      >
        {(fieldError) => (
          <>
            <input type="hidden" name="offerId" value={offerId} />
            <input type="hidden" name="response" value="accepted" />
            <input type="hidden" name="expectedVersion" value={version} />
            <FormField
              id={`or-acc-${offerId}`}
              label="Note (optional)"
              error={fieldError("note")}
            >
              <TextArea
                id={`or-acc-${offerId}`}
                name="note"
                rows={2}
                maxLength={400}
                placeholder="e.g. Signed copy received by email"
                {...err(`or-acc-${offerId}`, fieldError("note"))}
              />
            </FormField>
          </>
        )}
      </FormSheet>
      <FormSheet
        action={respondOfferAction}
        title="Mark offer declined"
        description="The candidate moves to Rejected with this reason."
        trigger="Mark declined"
        triggerVariant="ghost"
        triggerSize="sm"
        submitLabel="Mark declined"
        submitVariant="danger"
      >
        {(fieldError) => (
          <>
            <input type="hidden" name="offerId" value={offerId} />
            <input type="hidden" name="response" value="declined" />
            <input type="hidden" name="expectedVersion" value={version} />
            <FormField
              id={`or-dec-${offerId}`}
              label="Reason"
              required
              error={fieldError("note")}
            >
              <TextArea
                id={`or-dec-${offerId}`}
                name="note"
                rows={2}
                maxLength={400}
                {...err(`or-dec-${offerId}`, fieldError("note"))}
              />
            </FormField>
          </>
        )}
      </FormSheet>
    </div>
  );
}

export function ConvertSheet({
  offerId,
  summary,
}: {
  offerId: string;
  summary: string;
}) {
  return (
    <FormSheet
      action={convertOfferAction}
      title="Convert to employee"
      description="Creates one employee record linked to this candidate and starts onboarding. Payroll sets up compensation separately."
      trigger="Convert to employee"
      icon="userTick"
      submitLabel="Create employee"
      pendingLabel="Creating…"
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="offerId" value={offerId} />
          <p className="text-block">{summary}</p>
          <label className="check-row">
            <input
              type="checkbox"
              name="confirm"
              aria-invalid={Boolean(fieldError("confirm"))}
            />
            <span>The offer details above are correct.</span>
          </label>
          {fieldError("confirm") && (
            <p className="field-error">{fieldError("confirm")}</p>
          )}
        </>
      )}
    </FormSheet>
  );
}
