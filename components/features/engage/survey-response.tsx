"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { TextArea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { respondSurveyAction } from "@/lib/actions/engage";
import type { SurveyForYou, SurveyQuestion } from "@/types/engage";

const scales = {
  rating: { values: [1, 2, 3, 4, 5], hint: "1 = very poor · 5 = excellent" },
  enps: { values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hint: "0 = not at all likely · 10 = extremely likely" },
};

function Question({ question, index, error }: { question: SurveyQuestion; index: number; error: string | undefined }) {
  const name = `q_${question.id}`;
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const legend = (
    <legend className="ep-question-prompt">
      <span className="muted num">{index + 1}. </span>
      {question.prompt}
      {question.required ? <span className="required-mark" aria-hidden="true"> *</span> : <span className="small muted"> (optional)</span>}
    </legend>
  );
  if (question.kind === "text")
    return (
      <div className="form-field">
        <label htmlFor={name} className="ep-question-prompt">
          <span className="muted num">{index + 1}. </span>
          {question.prompt}
          {question.required ? <span className="required-mark" aria-hidden="true"> *</span> : <span className="small muted"> (optional)</span>}
        </label>
        <TextArea id={name} name={name} rows={3} maxLength={1000} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
        {error && (
          <p id={errorId} className="field-error">
            {error}
          </p>
        )}
      </div>
    );
  const scale = question.kind === "rating" || question.kind === "enps" ? scales[question.kind] : null;
  return (
    <fieldset className="ep-question" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : scale ? hintId : undefined}>
      {legend}
      {scale ? (
        <>
          <div className={question.kind === "enps" ? "ep-scale ep-scale--11" : "ep-scale"}>
            {scale.values.map((value) => (
              <label key={value} className="ep-scale-option">
                <input type="radio" name={name} value={value} />
                <span className="num">{value}</span>
              </label>
            ))}
          </div>
          <p id={hintId} className="small muted">
            {scale.hint}
          </p>
        </>
      ) : (
        <div className="ep-stack">
          {question.options.map((option) => (
            <label key={option} className="check-row">
              <input type={question.kind === "multiple" ? "checkbox" : "radio"} name={name} value={option} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function SurveyResponseSheet({ survey }: { survey: SurveyForYou }) {
  const sheet = useDisclosure();
  const { submit, pending, fieldError, state } = useCommand(respondSurveyAction, { onSuccess: sheet.hide });
  const message = state.status === "error" ? state.message : undefined;
  return (
    <>
      <Button size="sm" onClick={sheet.show}>
        <AppIcon name="clipboard" size={16} />
        Respond
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={survey.title} description={survey.description} dismissible={!pending} size="lg">
        <form onSubmit={submit} className="form" noValidate>
          <input type="hidden" name="surveyId" value={survey.id} />
          {survey.anonymous && (
            <Alert tone="info" title="Anonymous survey">
              Your name is never stored with your answers. HR sees results only once at least {survey.minResponses} people respond, and department breakdowns follow the same rule.
            </Alert>
          )}
          {survey.questions.map((question, index) => (
            <Question key={question.id} question={question} index={index} error={fieldError(`q_${question.id}`)} />
          ))}
          {message && (
            <Alert tone="danger" live>
              {message}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Submit response" pendingLabel="Submitting…" />
        </form>
      </Sheet>
    </>
  );
}
