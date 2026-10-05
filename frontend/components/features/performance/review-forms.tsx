"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { acknowledgeAction, saveManagerReviewAction, saveSelfReviewAction } from "@/lib/actions/performance";
import {
  perfPromotionLabels,
  scoreText,
  weightedScore,
  type PerfCompetency,
  type PerfGoal,
  type PerfManagerPart,
  type PerfSelfPart,
  type RatingLevel,
} from "@/types/performance";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

type Ratings = Record<string, number | null>;

function initialRatings(part: PerfSelfPart): Ratings {
  const map: Ratings = {};
  for (const entry of [...part.goals, ...part.competencies]) map[entry.targetId] = entry.rating;
  return map;
}

function ScorePreview({ goals, competencies, ratings, goalWeight, scale }: { goals: PerfGoal[]; competencies: PerfCompetency[]; ratings: Ratings; goalWeight: number; scale: RatingLevel[] }) {
  const score = weightedScore(
    goals.map((g) => ({ weight: g.weight, rating: ratings[g.id] ?? null })),
    competencies.map((c) => ratings[c.id] ?? null),
    goalWeight,
  );
  const suggested = score === null ? null : scale.find((s) => s.rating === Math.min(5, Math.max(1, Math.round(score / 100))));
  return (
    <p className="perf-score" aria-live="polite">
      <span className="muted small">
        Weighted score · goals {goalWeight}% · competencies {100 - goalWeight}%
      </span>
      <strong className="num">{score === null ? "—" : scoreText(score)}</strong>
      {suggested && <span className="muted small">Nearest band: {suggested.rating} · {suggested.label}</span>}
    </p>
  );
}

function RatingFields({
  prefix,
  goals,
  competencies,
  part,
  scale,
  fieldError,
  onRate,
  selfPart,
}: {
  prefix: string;
  goals: PerfGoal[];
  competencies: PerfCompetency[];
  part: PerfSelfPart;
  scale: RatingLevel[];
  fieldError: (name: string) => string | undefined;
  onRate: (id: string, rating: number | null) => void;
  selfPart?: PerfSelfPart | null;
}) {
  const options = scale.map((s) => ({ value: String(s.rating), label: `${s.rating} · ${s.label}` }));
  const entry = (list: PerfSelfPart["goals"], id: string) => list.find((e) => e.targetId === id);
  return (
    <>
      <fieldset className="perf-fieldset">
        <legend>Goals</legend>
        {goals.map((goal) => {
          const current = entry(part.goals, goal.id);
          const self = selfPart ? entry(selfPart.goals, goal.id) : undefined;
          const rid = `${prefix}-gr-${goal.id}`;
          const cid = `${prefix}-gc-${goal.id}`;
          return (
            <div key={goal.id} className="perf-rate-block">
              <p className="perf-rate-title">
                {goal.title} <span className="muted small num">· {goal.weight}% · {goal.progress}% done</span>
              </p>
              <p className="muted small">Target: {goal.target}</p>
              {self && (
                <p className="perf-self-note small">
                  Self: <strong>{self.rating ?? "—"}</strong>
                  {self.comment ? ` — ${self.comment}` : ""}
                </p>
              )}
              <div className="form-row">
                <FormField id={rid} label={`Rating for ${goal.title}`} required error={fieldError(`goalRating.${goal.id}`)}>
                  <SelectInput id={rid} name={`goalRating.${goal.id}`} placeholder="Choose a rating" defaultValue={current?.rating ? String(current.rating) : ""} options={options} onChange={(e) => onRate(goal.id, e.target.value ? Number(e.target.value) : null)} {...err(rid, fieldError(`goalRating.${goal.id}`))} />
                </FormField>
              </div>
              <FormField id={cid} label="Evidence and comments" required error={fieldError(`goalComment.${goal.id}`)}>
                <TextArea id={cid} name={`goalComment.${goal.id}`} rows={2} maxLength={1000} defaultValue={current?.comment} {...err(cid, fieldError(`goalComment.${goal.id}`))} />
              </FormField>
            </div>
          );
        })}
      </fieldset>
      <fieldset className="perf-fieldset">
        <legend>Competencies</legend>
        {competencies.map((competency) => {
          const current = entry(part.competencies, competency.id);
          const self = selfPart ? entry(selfPart.competencies, competency.id) : undefined;
          const rid = `${prefix}-cr-${competency.id}`;
          const cid = `${prefix}-cc-${competency.id}`;
          return (
            <div key={competency.id} className="perf-rate-block">
              <p className="perf-rate-title">{competency.name}</p>
              <p className="muted small">{competency.description}</p>
              {self && <p className="perf-self-note small">Self: <strong>{self.rating ?? "—"}</strong></p>}
              <div className="form-row">
                <FormField id={rid} label={`Rating for ${competency.name}`} required error={fieldError(`compRating.${competency.id}`)}>
                  <SelectInput id={rid} name={`compRating.${competency.id}`} placeholder="Choose a rating" defaultValue={current?.rating ? String(current.rating) : ""} options={options} onChange={(e) => onRate(competency.id, e.target.value ? Number(e.target.value) : null)} {...err(rid, fieldError(`compRating.${competency.id}`))} />
                </FormField>
                <FormField id={cid} label="Comment (optional)">
                  <TextInput id={cid} name={`compComment.${competency.id}`} maxLength={1000} defaultValue={current?.comment} />
                </FormField>
              </div>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}

function FormAlert({ state }: { state: ReturnType<typeof useCommand>["state"] }) {
  if (state.status !== "error") return null;
  return (
    <Alert tone="danger" live>
      {state.message}
    </Alert>
  );
}

export function SelfReviewForm({ reviewId, version, goals, competencies, self, scale, goalWeight }: { reviewId: string; version: number; goals: PerfGoal[]; competencies: PerfCompetency[]; self: PerfSelfPart; scale: RatingLevel[]; goalWeight: number }) {
  const [ratings, setRatings] = useState<Ratings>(() => initialRatings(self));
  const { submit, pending, fieldError, state } = useCommand(saveSelfReviewAction);
  return (
    <form onSubmit={submit} className="form" noValidate aria-label="Self review">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="version" value={version} />
      <RatingFields prefix="self" goals={goals} competencies={competencies} part={self} scale={scale} fieldError={fieldError} onRate={(id, rating) => setRatings((r) => ({ ...r, [id]: rating }))} />
      <FormField id="self-strengths" label="Strengths" required error={fieldError("strengths")}>
        <TextArea id="self-strengths" name="strengths" rows={3} maxLength={2000} defaultValue={self.strengths} {...err("self-strengths", fieldError("strengths"))} />
      </FormField>
      <FormField id="self-improvements" label="Areas to improve" required error={fieldError("improvements")}>
        <TextArea id="self-improvements" name="improvements" rows={3} maxLength={2000} defaultValue={self.improvements} {...err("self-improvements", fieldError("improvements"))} />
      </FormField>
      <ScorePreview goals={goals} competencies={competencies} ratings={ratings} goalWeight={goalWeight} scale={scale} />
      <FormAlert state={state} />
      <div className="sheet-actions">
        <Button type="submit" name="intent" value="save" variant="secondary" pending={pending}>
          Save draft
        </Button>
        <Button type="submit" name="intent" value="submit" pending={pending}>
          Submit self review
        </Button>
      </div>
      <p className="muted small">Only you can see a draft. Once submitted, your reviewer sees it and it can&apos;t be edited.</p>
    </form>
  );
}

export function ManagerReviewForm({
  reviewId,
  version,
  name,
  goals,
  competencies,
  manager,
  self,
  scale,
  goalWeight,
}: {
  reviewId: string;
  version: number;
  name: string;
  goals: PerfGoal[];
  competencies: PerfCompetency[];
  manager: PerfManagerPart;
  self: PerfSelfPart | null;
  scale: RatingLevel[];
  goalWeight: number;
}) {
  const [ratings, setRatings] = useState<Ratings>(() => initialRatings(manager));
  const { submit, pending, fieldError, state } = useCommand(saveManagerReviewAction);
  return (
    <form onSubmit={submit} className="form" noValidate aria-label={`Manager review for ${name}`}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="version" value={version} />
      <RatingFields prefix="mgr" goals={goals} competencies={competencies} part={manager} scale={scale} fieldError={fieldError} selfPart={self} onRate={(id, rating) => setRatings((r) => ({ ...r, [id]: rating }))} />
      <div className="form-row">
        <FormField id="mgr-strengths" label="Strengths" required error={fieldError("strengths")}>
          <TextArea id="mgr-strengths" name="strengths" rows={3} maxLength={2000} defaultValue={manager.strengths} {...err("mgr-strengths", fieldError("strengths"))} />
        </FormField>
        <FormField id="mgr-improvements" label="Areas to improve" required error={fieldError("improvements")}>
          <TextArea id="mgr-improvements" name="improvements" rows={3} maxLength={2000} defaultValue={manager.improvements} {...err("mgr-improvements", fieldError("improvements"))} />
        </FormField>
      </div>
      <ScorePreview goals={goals} competencies={competencies} ratings={ratings} goalWeight={goalWeight} scale={scale} />
      <div className="form-row">
        <FormField id="mgr-overall" label="Overall rating" required hint="Your judgement; the weighted score is a guide." error={fieldError("overallRating")}>
          <SelectInput id="mgr-overall" name="overallRating" placeholder="Choose a rating" defaultValue={manager.overallRating ? String(manager.overallRating) : ""} options={scale.map((s) => ({ value: String(s.rating), label: `${s.rating} · ${s.label}` }))} {...err("mgr-overall", fieldError("overallRating"), true)} />
        </FormField>
        <FormField id="mgr-promotion" label="Promotion recommendation">
          <SelectInput id="mgr-promotion" name="promotion" defaultValue={manager.promotion} options={Object.entries(perfPromotionLabels).map(([value, label]) => ({ value, label }))} />
        </FormField>
      </div>
      <FormField id="mgr-summary" label="Summary for the employee" required hint="Shared with the employee only after results are released." error={fieldError("summary")}>
        <TextArea id="mgr-summary" name="summary" rows={3} maxLength={2000} defaultValue={manager.summary} {...err("mgr-summary", fieldError("summary"), true)} />
      </FormField>
      <FormField id="mgr-increment" label="Increment recommendation (%)" required hint="Recommendation only. Salary changes need a separate compensation revision and approval." error={fieldError("incrementPercent")}>
        <TextInput id="mgr-increment" name="incrementPercent" inputMode="decimal" placeholder="e.g. 8.5" defaultValue={manager.incrementPercent ?? ""} {...err("mgr-increment", fieldError("incrementPercent"), true)} />
      </FormField>
      <Alert tone="info">This review never changes pay by itself. HR raises any salary revision separately, and it goes through payroll maker/checker approval.</Alert>
      <FormAlert state={state} />
      <div className="sheet-actions">
        <Button type="submit" name="intent" value="save" variant="secondary" pending={pending}>
          Save draft
        </Button>
        <Button type="submit" name="intent" value="submit" pending={pending}>
          Submit manager review
        </Button>
      </div>
    </form>
  );
}

export function AcknowledgeForm({ reviewId }: { reviewId: string }) {
  const { submit, pending, fieldError, formError } = useCommand(acknowledgeAction);
  return (
    <form onSubmit={submit} className="form" noValidate aria-label="Acknowledge review">
      <input type="hidden" name="reviewId" value={reviewId} />
      <FormField id="ack-comment" label="Your comment (optional)" hint="Visible to your reviewer and HR." error={fieldError("comment")}>
        <TextArea id="ack-comment" name="comment" rows={2} maxLength={500} {...err("ack-comment", fieldError("comment"), true)} />
      </FormField>
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          Acknowledge review
        </Button>
      </div>
    </form>
  );
}
