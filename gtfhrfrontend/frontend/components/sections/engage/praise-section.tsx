import Link from "next/link";
import { PostInteractions } from "@/components/features/engage/post-interactions";
import { PraiseComposer } from "@/components/features/engage/praise-composer";
import { EngageTabs } from "@/components/sections/engage/engage-shared";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ListRow } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatRelative, pluralize } from "@/lib/utils/format";
import { badgeIcons, companyValues, praiseBadges } from "@/types/engage-labels";
import type { Praise, PraiseBadge, PraiseWall } from "@/types/engage";

type Filters = { badge: PraiseBadge | undefined; scope: "received" | "given" | undefined; month: string | undefined };

function hrefFor(filters: Filters, change: Partial<Filters>) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.badge) params.set("badge", next.badge);
  if (next.scope) params.set("scope", next.scope);
  if (next.month) params.set("month", next.month);
  const text = params.toString();
  return text ? `/engage/praise?${text}` : "/engage/praise";
}

function PraiseCard({ praise }: { praise: Praise }) {
  return (
    <Card as="article" className="post ep-praise">
      <header className="post-head">
        <Avatar initials={praise.giver.initials} seed={praise.giver.id} src={praise.giver.photoUrl} />
        <div className="post-byline">
          <strong>
            {praise.giver.name} <span className="muted">praised</span> {praise.recipients.map((person) => person.name).join(", ")}
          </strong>
          <span className="small muted">
            {companyValues[praise.value]} · {formatRelative(praise.createdAt)}
          </span>
        </div>
      </header>
      <div className="ep-praise-body">
        <span className={`ep-badge ep-badge--${praise.badge}`}>
          <AppIcon name={badgeIcons[praise.badge]} size={20} />
          {praiseBadges[praise.badge]}
        </span>
        <span className="avatar-stack" aria-hidden="true">
          {praise.recipients.map((person) => (
            <Avatar key={person.id} initials={person.initials} seed={person.id} src={person.photoUrl} size="lg" />
          ))}
        </span>
      </div>
      <p className="text-block">{praise.message}</p>
      <PostInteractions post={praise.post} />
    </Card>
  );
}

export function PraiseSection({ wall, filters, canPost, currentMonth }: { wall: PraiseWall; filters: Filters; canPost: boolean; currentMonth: string }) {
  const filtered = Boolean(filters.badge || filters.scope || filters.month);
  return (
    <div className="page">
      <PageHeader title="Praise wall" description="Recognise the people who live our values. Every praise also appears in the Engage feed." actions={canPost ? <PraiseComposer colleagues={wall.colleagues} /> : undefined} />
      <EngageTabs active="praise" />
      <div className="grid grid-stats grid-stats--3">
        <StatCard label={`Praise in ${formatDate(wall.month, "month")}`} value={wall.totals.month} meta="Across the company" icon="award" accent="magenta" />
        <StatCard label="You received" value={wall.totals.receivedByMe} meta="All time" icon="heart" accent="cyan" />
        <StatCard label="You gave" value={wall.totals.givenByMe} meta="All time" icon="like" accent="yellow" />
      </div>
      <div className="split split--wide-aside">
        <div className="stack">
          <Card>
            <nav className="chip-row card-body" aria-label="Whose praise">
              <Link href={hrefFor(filters, { scope: undefined })} className="chip" aria-current={!filters.scope ? "page" : undefined}>
                Everyone
              </Link>
              <Link href={hrefFor(filters, { scope: "received" })} className="chip" aria-current={filters.scope === "received" ? "page" : undefined}>
                Received by me
              </Link>
              <Link href={hrefFor(filters, { scope: "given" })} className="chip" aria-current={filters.scope === "given" ? "page" : undefined}>
                Given by me
              </Link>
            </nav>
            <nav className="chip-row card-body" aria-label="Filter by badge">
              <Link href={hrefFor(filters, { badge: undefined })} className="chip" aria-current={!filters.badge ? "page" : undefined}>
                All badges
              </Link>
              {(Object.keys(praiseBadges) as PraiseBadge[]).map((badge) => (
                <Link key={badge} href={hrefFor(filters, { badge })} className="chip" aria-current={filters.badge === badge ? "page" : undefined}>
                  <AppIcon name={badgeIcons[badge]} size={16} />
                  {praiseBadges[badge]}
                </Link>
              ))}
            </nav>
          </Card>
          <div className="stack feed" aria-label="Praise">
            {wall.items.length ? (
              wall.items.map((praise) => <PraiseCard key={praise.id} praise={praise} />)
            ) : (
              <Card>
                <EmptyState
                  icon="award"
                  title={filtered ? "No praise matches" : "No praise yet"}
                  description={filtered ? "Try another badge or clear the filters." : "Be the first to recognise a colleague."}
                  action={filtered ? <Link href="/engage/praise" className="button button--secondary button--sm">Clear filters</Link> : undefined}
                />
              </Card>
            )}
          </div>
        </div>
        <aside className="stack">
          <Card labelledBy="leaderboard">
            <CardHeader id="leaderboard" title="Leaderboard" description={`Most praised · ${formatDate(wall.month, "month")}`} />
            <nav className="chip-row card-body" aria-label="Leaderboard month">
              {wall.months.map((month) => (
                <Link key={month} href={hrefFor(filters, { month: month === currentMonth ? undefined : month })} className="chip" aria-current={wall.month === month ? "page" : undefined}>
                  {formatDate(month, "month")}
                </Link>
              ))}
            </nav>
            {wall.leaderboard.length ? (
              <ol className="list ep-leaderboard">
                {wall.leaderboard.map((entry, index) => (
                  <ListRow
                    key={entry.person.id}
                    leading={
                      <span className="ep-rank">
                        <span className="num ep-rank-number">{index + 1}</span>
                        <Avatar initials={entry.person.initials} seed={entry.person.id} src={entry.person.photoUrl} size="sm" />
                      </span>
                    }
                    title={entry.person.name}
                    meta={entry.badges.map((badge) => praiseBadges[badge]).join(" · ")}
                    trailing={<span className="num cell-strong">{pluralize(entry.count, "praise", "praises")}</span>}
                  />
                ))}
              </ol>
            ) : (
              <CardBody>
                <EmptyState compact icon="ranking" title="No praise this month" description="The leaderboard fills up as people give praise." />
              </CardBody>
            )}
          </Card>
          <Card labelledBy="by-badge">
            <CardHeader id="by-badge" title="By badge" description={formatDate(wall.month, "month")} />
            <ul className="list">
              {wall.byBadge.map((entry) => (
                <ListRow
                  key={entry.badge}
                  leading={
                    <span className={`ep-badge-icon ep-badge--${entry.badge}`}>
                      <AppIcon name={badgeIcons[entry.badge]} size={20} />
                    </span>
                  }
                  title={praiseBadges[entry.badge]}
                  meta={entry.leader ? `Top: ${entry.leader.name} (${entry.leaderCount})` : "No one yet"}
                  trailing={<span className="num">{entry.count}</span>}
                  href={hrefFor(filters, { badge: entry.badge })}
                />
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
