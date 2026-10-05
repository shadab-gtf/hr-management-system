"use client";

import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { addOneOnOneAction, declineRequestAction, giveFeedbackAction, requestFeedbackAction } from "@/lib/actions/performance";
import type { PersonRef } from "@/types/common";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

type Option = { id: string; name: string };

export function GiveFeedbackSheet({ colleagues, competencies, respondTo }: { colleagues: PersonRef[]; competencies: Option[]; respondTo?: { requestId: string; person: PersonRef; question: string } }) {
  const p = respondTo ? `fb-${respondTo.requestId}` : "fb-new";
  return (
    <FormSheet
      action={giveFeedbackAction}
      title={respondTo ? `Respond to ${respondTo.person.name}` : "Give feedback"}
      description={respondTo ? respondTo.question : "Public praise appears on the praise wall. Private feedback is seen only by the person and their manager."}
      trigger={respondTo ? "Respond" : "Give feedback"}
      triggerVariant={respondTo ? "secondary" : "primary"}
      triggerSize={respondTo ? "sm" : "md"}
      {...(respondTo ? {} : { icon: "like" as const })}
      submitLabel="Send feedback"
    >
      {(fieldError) => (
        <>
          {respondTo ? (
            <>
              <input type="hidden" name="toId" value={respondTo.person.id} />
              <input type="hidden" name="requestId" value={respondTo.requestId} />
            </>
          ) : (
            <FormField id={`${p}-to`} label="Colleague" required error={fieldError("toId")}>
              <SelectInput id={`${p}-to`} name="toId" placeholder="Choose a colleague" defaultValue="" options={colleagues.map((c) => ({ value: c.id, label: `${c.name} · ${c.designation}` }))} {...err(`${p}-to`, fieldError("toId"))} />
            </FormField>
          )}
          <div className="form-row">
            <FormField id={`${p}-kind`} label="Type" required>
              <SelectInput id={`${p}-kind`} name="kind" defaultValue={respondTo ? "suggestion" : "praise"} options={[{ value: "praise", label: "Praise" }, { value: "suggestion", label: "Suggestion" }]} />
            </FormField>
            <FormField id={`${p}-vis`} label="Visibility" required>
              <SelectInput id={`${p}-vis`} name="visibility" defaultValue={respondTo ? "private" : "public"} options={[{ value: "public", label: "Public (praise wall)" }, { value: "private", label: "Private (person + their manager)" }]} />
            </FormField>
          </div>
          <FormField id={`${p}-comp`} label="Competency (optional)" error={fieldError("competencyId")}>
            <SelectInput id={`${p}-comp`} name="competencyId" placeholder="None" defaultValue="" options={competencies.map((c) => ({ value: c.id, label: c.name }))} {...err(`${p}-comp`, fieldError("competencyId"))} />
          </FormField>
          <FormField id={`${p}-msg`} label="Feedback" required hint="Specific and kind: what happened and its impact." error={fieldError("message")}>
            <TextArea id={`${p}-msg`} name="message" rows={4} maxLength={1000} {...err(`${p}-msg`, fieldError("message"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RequestFeedbackSheet({ colleagues, goals }: { colleagues: PersonRef[]; goals: { id: string; title: string }[] }) {
  return (
    <FormSheet action={requestFeedbackAction} title="Request feedback" description="Ask a peer about your work or a specific goal." trigger="Request feedback" triggerVariant="secondary" icon="messages" submitLabel="Send request">
      {(fieldError) => (
        <>
          <FormField id="fr-asked" label="Ask" required error={fieldError("askedId")}>
            <SelectInput id="fr-asked" name="askedId" placeholder="Choose a colleague" defaultValue="" options={colleagues.map((c) => ({ value: c.id, label: `${c.name} · ${c.designation}` }))} {...err("fr-asked", fieldError("askedId"))} />
          </FormField>
          <FormField id="fr-goal" label="About goal (optional)" error={fieldError("goalId")}>
            <SelectInput id="fr-goal" name="goalId" placeholder="General feedback" defaultValue="" options={goals.map((g) => ({ value: g.id, label: g.title }))} {...err("fr-goal", fieldError("goalId"))} />
          </FormField>
          <FormField id="fr-q" label="Question" required error={fieldError("question")}>
            <TextArea id="fr-q" name="question" rows={3} maxLength={300} {...err("fr-q", fieldError("question"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function DeclineRequestButton({ requestId }: { requestId: string }) {
  return <ConfirmButton label="Decline" confirmLabel="Confirm decline" run={() => declineRequestAction(requestId)} />;
}

export function OneOnOneSheet({ counterparts, today }: { counterparts: (PersonRef & { relation: "manager" | "report" })[]; today: string }) {
  return (
    <FormSheet action={addOneOnOneAction} title="Log a 1:1" description="Private to you and the other person. HR doesn't see 1:1 notes." trigger="Add 1:1 notes" triggerVariant="secondary" icon="note" submitLabel="Save notes">
      {(fieldError) => (
        <>
          <div className="form-row">
            <FormField id="oo-with" label="With" required error={fieldError("counterpartId")}>
              <SelectInput id="oo-with" name="counterpartId" defaultValue={counterparts[0]?.id ?? ""} options={counterparts.map((c) => ({ value: c.id, label: `${c.name} (${c.relation === "manager" ? "your manager" : "report"})` }))} {...err("oo-with", fieldError("counterpartId"))} />
            </FormField>
            <FormField id="oo-date" label="Met on" required error={fieldError("meetingOn")}>
              <TextInput id="oo-date" name="meetingOn" type="date" max={today} defaultValue={today} {...err("oo-date", fieldError("meetingOn"))} />
            </FormField>
          </div>
          <FormField id="oo-note" label="Notes" required error={fieldError("note")}>
            <TextArea id="oo-note" name="note" rows={4} maxLength={2000} {...err("oo-note", fieldError("note"))} />
          </FormField>
          <FormField id="oo-actions" label="Action items (one per line)" error={fieldError("actionItems")}>
            <TextArea id="oo-actions" name="actionItems" rows={3} maxLength={1000} {...err("oo-actions", fieldError("actionItems"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
