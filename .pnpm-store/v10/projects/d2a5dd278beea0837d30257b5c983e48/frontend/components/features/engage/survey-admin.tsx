"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { addQuestionAction, moveQuestionAction, saveSurveyAction } from "@/lib/actions/engage";
import { surveyQuestionKinds } from "@/types/engage-labels";
import type { SurveyDetail, SurveyQuestionKind } from "@/types/engage";

type FieldError = (name: string) => string | undefined;

function SurveyFields({ fieldError, departments, today, survey }: { fieldError: FieldError; departments: string[]; today: string; survey?: SurveyDetail }) {
  const plus = (days: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const prefix = survey ? "edit-sv" : "new-sv";
  return (
    <>
      {survey && (
        <>
          <input type="hidden" name="surveyId" value={survey.id} />
          <input type="hidden" name="version" value={survey.version} />
        </>
      )}
      <FormField id={`${prefix}-title`} label="Title" required error={fieldError("title")}>
        <TextInput id={`${prefix}-title`} name="title" maxLength={120} defaultValue={survey?.title} aria-invalid={Boolean(fieldError("title"))} aria-describedby={describedBy(`${prefix}-title`, fieldError("title"))} />
      </FormField>
      <FormField id={`${prefix}-description`} label="Description" error={fieldError("description")} hint="Shown to employees above the questions.">
        <TextArea id={`${prefix}-description`} name="description" rows={2} maxLength={500} defaultValue={survey?.description} aria-describedby={describedBy(`${prefix}-description`, fieldError("description"), true)} />
      </FormField>
      <FormField id={`${prefix}-audience`} label="Audience" error={fieldError("department")}>
        <SelectInput id={`${prefix}-audience`} name="department" defaultValue={survey?.department ?? ""} options={[{ value: "", label: "All employees" }, ...departments.map((name) => ({ value: name, label: name }))]} />
      </FormField>
      <div className="form-row">
        <FormField id={`${prefix}-opens`} label="Opens on" required error={fieldError("opensOn")}>
          <TextInput id={`${prefix}-opens`} name="opensOn" type="date" min={today} defaultValue={survey?.opensOn ?? today} aria-invalid={Boolean(fieldError("opensOn"))} aria-describedby={describedBy(`${prefix}-opens`, fieldError("opensOn"))} />
        </FormField>
        <FormField id={`${prefix}-closes`} label="Closes on" required error={fieldError("closesOn")}>
          <TextInput id={`${prefix}-closes`} name="closesOn" type="date" min={today} defaultValue={survey?.closesOn ?? plus(14)} aria-invalid={Boolean(fieldError("closesOn"))} aria-describedby={describedBy(`${prefix}-closes`, fieldError("closesOn"))} />
        </FormField>
      </div>
      <label className="check-row">
        <input type="checkbox" name="anonymous" defaultChecked={survey?.anonymous ?? true} />
        <span>
          Anonymous responses
          <span className="small muted"> — names are never stored with answers; results and department breakdowns stay hidden below 5 responses.</span>
        </span>
      </label>
    </>
  );
}

export function NewSurveySheet({ departments, today }: { departments: string[]; today: string }) {
  const router = useRouter();
  const sheet = useDisclosure();
  const { submit, pending, fieldError, formError } = useCommand(saveSurveyAction, {
    toast: false,
    onSuccess: (result) => {
      sheet.hide();
      toast.success(result.message, { description: "Add questions, then publish." });
      if (result.reference) router.push(`/admin/surveys/${result.reference}`);
    },
  });
  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="add" size={20} />
        New survey
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="New survey" description="Starts as a draft. Add questions in the builder, then publish." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <SurveyFields fieldError={fieldError} departments={departments} today={today} />
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Create draft" pendingLabel="Creating…" />
        </form>
      </Sheet>
    </>
  );
}

export function SurveySettingsForm({ survey, departments, today }: { survey: SurveyDetail; departments: string[]; today: string }) {
  const { submit, pending, fieldError, formError } = useCommand(saveSurveyAction);
  return (
    <form onSubmit={submit} className="form" noValidate>
      <SurveyFields fieldError={fieldError} departments={departments} today={today < survey.opensOn ? today : survey.opensOn} survey={survey} />
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" variant="secondary" pending={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

export function AddQuestionForm({ surveyId }: { surveyId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<SurveyQuestionKind>("rating");
  const { submit, pending, fieldError, formError } = useCommand(addQuestionAction, {
    onSuccess: () => {
      form.current?.reset();
      setKind("rating");
    },
  });
  const choice = kind === "single" || kind === "multiple";
  return (
    <form ref={form} onSubmit={submit} className="form" noValidate>
      <input type="hidden" name="surveyId" value={surveyId} />
      <div className="form-row">
        <FormField id="q-kind" label="Question type" required>
          <SelectInput id="q-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as SurveyQuestionKind)} options={Object.entries(surveyQuestionKinds).map(([value, label]) => ({ value, label }))} />
        </FormField>
        <label className="check-row ep-align-end">
          <input type="checkbox" name="required" defaultChecked />
          <span>Required</span>
        </label>
      </div>
      <FormField id="q-prompt" label="Question" required error={fieldError("prompt")}>
        <TextInput id="q-prompt" name="prompt" maxLength={200} placeholder={kind === "enps" ? "How likely are you to recommend GTF as a place to work?" : undefined} aria-invalid={Boolean(fieldError("prompt"))} aria-describedby={describedBy("q-prompt", fieldError("prompt"))} />
      </FormField>
      {choice && (
        <FormField id="q-options" label="Options" required error={fieldError("options")} hint="One per line, 2–8 options.">
          <TextArea id="q-options" name="options" rows={4} aria-invalid={Boolean(fieldError("options"))} aria-describedby={describedBy("q-options", fieldError("options"), true)} />
        </FormField>
      )}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          <AppIcon name="add" size={16} />
          {pending ? "Adding…" : "Add question"}
        </Button>
      </div>
    </form>
  );
}

export function MoveQuestionButtons({ surveyId, questionId, first, last }: { surveyId: string; questionId: string; first: boolean; last: boolean }) {
  const [pending, startTransition] = useTransition();
  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      const result = await moveQuestionAction(surveyId, questionId, direction);
      if (result.status === "error") toast.error(result.message);
    });
  return (
    <>
      <Button size="sm" variant="ghost" disabled={first || pending} onClick={() => move("up")} aria-label="Move question up">
        ↑
      </Button>
      <Button size="sm" variant="ghost" disabled={last || pending} onClick={() => move("down")} aria-label="Move question down">
        ↓
      </Button>
    </>
  );
}
