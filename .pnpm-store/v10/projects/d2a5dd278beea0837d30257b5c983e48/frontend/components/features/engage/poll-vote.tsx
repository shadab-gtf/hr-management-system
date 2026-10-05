"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Meter } from "@/components/ui/display";
import { useCommand } from "@/hooks/use-command";
import { voteAction } from "@/lib/actions/engage";
import { cn } from "@/lib/utils/cn";
import type { Poll } from "@/types/engage";

/** Ballot while open and not yet voted (or changing); results once voted or closed. */
export function PollVote({ poll }: { poll: Poll }) {
  const [changing, setChanging] = useState(false);
  const { submit, pending, fieldError, formError } = useCommand(voteAction, { onSuccess: () => setChanging(false) });
  const open = poll.state === "open";
  const error = fieldError("optionIds") ?? formError;

  if (open && (!poll.hasVoted || changing))
    return (
      <form onSubmit={submit} className="poll-form" noValidate>
        <input type="hidden" name="pollId" value={poll.id} />
        <fieldset className="poll-choices" aria-describedby={error ? `${poll.id}-error` : undefined}>
          <legend className="sr-only">{poll.question}</legend>
          {poll.options.map((option) => (
            <label key={option.id} className="poll-choice">
              <input type={poll.multiple ? "checkbox" : "radio"} name="optionId" value={option.id} defaultChecked={option.mine} />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        {error && (
          <Alert tone="danger" live>
            <span id={`${poll.id}-error`}>{error}</span>
          </Alert>
        )}
        <div className="cluster">
          <Button type="submit" size="sm" pending={pending}>
            {pending ? "Saving…" : poll.hasVoted ? "Update vote" : "Vote"}
          </Button>
          {changing && (
            <Button size="sm" variant="ghost" onClick={() => setChanging(false)} disabled={pending}>
              Cancel
            </Button>
          )}
          <span className="small muted">{poll.multiple ? "Choose one or more" : "Choose one"} · results show after you vote</span>
        </div>
      </form>
    );

  return (
    <div className="poll-form">
      <ul className="poll-results" aria-label={`Results: ${poll.question}`}>
        {poll.options.map((option) => (
          <li key={option.id} className={cn("poll-result", option.mine && "poll-result--mine")}>
            <div className="poll-result-head">
              <span className="poll-result-label">
                {option.label}
                {option.mine && <Badge tone="info">Your vote</Badge>}
              </span>
              <span className="num small">
                {option.percent ?? 0}% · {option.votes ?? 0}
              </span>
            </div>
            <Meter value={option.percent ?? 0} max={100} label={`${option.label}: ${option.percent ?? 0}%`} tone={option.mine ? "primary" : "secondary"} />
          </li>
        ))}
      </ul>
      {open && poll.hasVoted && (
        <div className="cluster">
          <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
            Change vote
          </Button>
        </div>
      )}
    </div>
  );
}
