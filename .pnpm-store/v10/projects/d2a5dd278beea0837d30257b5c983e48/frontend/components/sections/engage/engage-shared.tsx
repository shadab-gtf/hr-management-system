import { ConfirmButton } from "@/components/features/admin/form-sheet";
import { PollVote } from "@/components/features/engage/poll-vote";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconTile, TabsNav } from "@/components/ui/display";
import { closePollAction } from "@/lib/actions/engage";
import { formatDateTime, formatRelative, pluralize } from "@/lib/utils/format";
import type { Poll } from "@/types/engage";

export function EngageTabs({ active }: { active: "feed" | "polls" | "praise" }) {
  return (
    <TabsNav
      label="Engage"
      tabs={[
        { href: "/engage", label: "Feed", active: active === "feed" },
        { href: "/engage/polls", label: "Polls & surveys", active: active === "polls" },
        { href: "/engage/praise", label: "Praise wall", active: active === "praise" },
      ]}
    />
  );
}

export function PollCard({ poll }: { poll: Poll }) {
  const headingId = `poll-${poll.id}`;
  return (
    <Card as="article" className="ep-poll" labelledBy={headingId}>
      <header className="post-head">
        <IconTile icon="chart" accent="cyan" />
        <div className="post-byline">
          <strong>{poll.author.name}</strong>
          <span className="small muted">
            Poll · {poll.department ?? "Everyone"} · {formatRelative(poll.createdAt)}
          </span>
        </div>
        <span className="push-end">{poll.state === "open" ? <Badge tone="success">Open</Badge> : <Badge>Closed</Badge>}</span>
      </header>
      <h2 id={headingId} className="post-title">
        {poll.question}
      </h2>
      <PollVote poll={poll} />
      <footer className="ep-poll-foot">
        <span className="small muted">
          {pluralize(poll.voterCount, "vote")}
          {poll.anonymous ? " · Anonymous" : ""}
          {poll.multiple ? " · Multiple choice" : ""} · {poll.state === "open" ? `Closes ${formatDateTime(poll.closesAt)}` : `${poll.closedEarly ? "Closed early" : "Closed"} ${formatDateTime(poll.closesAt)}`}
        </span>
        {poll.recentVoters.length > 0 && (
          <span className="avatar-stack" role="img" aria-label={`Recent voters: ${poll.recentVoters.map((person) => person.name).join(", ")}`}>
            {poll.recentVoters.map((person) => (
              <Avatar key={person.id} initials={person.initials} seed={person.id} src={person.photoUrl} size="sm" />
            ))}
          </span>
        )}
        {poll.canClose && <ConfirmButton label="Close poll" confirmLabel="Close now" run={closePollAction.bind(null, poll.id)} />}
      </footer>
    </Card>
  );
}
