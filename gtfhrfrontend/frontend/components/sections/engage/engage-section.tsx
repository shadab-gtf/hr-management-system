import Link from "next/link";
import { PostComposer } from "@/components/features/engage/post-composer";
import { PostInteractions } from "@/components/features/engage/post-interactions";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EngageTabs, PollCard } from "@/components/sections/engage/engage-shared";
import { formatRelative } from "@/lib/utils/format";
import type { Feed, Poll, Post } from "@/types/engage";

const kindMeta: Record<Post["kind"], { icon: IconName; label: string }> = {
  post: { icon: "helpdesk", label: "Post" },
  anniversary: { icon: "calendarCheck", label: "Work anniversary" },
  welcome: { icon: "star", label: "New joiner" },
  announcement: { icon: "megaphone", label: "Announcement" },
  achievement: { icon: "trend", label: "Team win" },
  praise: { icon: "award", label: "Praise" },
};

function PostCard({ post }: { post: Post }) {
  const celebration = post.kind === "anniversary" || post.kind === "welcome";
  return (
    <Card as="article" className="post">
      <header className="post-head">
        {post.author ? (
          <Avatar initials={post.author.initials} seed={post.author.id} src={post.author.photoUrl} />
        ) : (
          <span className="icon-tile avatar--magenta">
            <AppIcon name={kindMeta[post.kind].icon} size={20} />
          </span>
        )}
        <div className="post-byline">
          <strong>{post.author?.name ?? "GTF Technologies"}</strong>
          <span className="small muted">
            {post.group} · {kindMeta[post.kind].label} · {formatRelative(post.createdAt)}
          </span>
        </div>
      </header>
      {celebration && post.subject ? (
        <div className="post-celebrate">
          <Avatar initials={post.subject.initials} seed={post.subject.id} src={post.subject.photoUrl} size="xl" />
          <div>
            <p className="post-celebrate-title">{post.kind === "welcome" ? `Welcome, ${post.subject.name.split(" ")[0]}!` : `Happy work anniversary, ${post.subject.name.split(" ")[0]}!`}</p>
            <p className="text-block">{post.body}</p>
          </div>
        </div>
      ) : (
        <>
          {post.title && <h2 className="post-title">{post.title}</h2>}
          <p className="text-block">{post.body}</p>
        </>
      )}
      <PostInteractions post={post} />
    </Card>
  );
}

export function EngageSection({
  feed,
  group,
  q,
  me,
  canPost,
}: {
  feed: Feed;
  group: string | undefined;
  q: string | undefined;
  me: { id: string; initials: string; firstName: string; photoUrl: string | null };
  canPost: boolean;
}) {
  const items: ({ type: "post"; at: string; post: Post } | { type: "poll"; at: string; poll: Poll })[] = [
    ...feed.posts.map((post) => ({ type: "post" as const, at: post.createdAt, post })),
    ...feed.polls.map((poll) => ({ type: "poll" as const, at: poll.createdAt, poll })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const href = (value: string | undefined) => {
    const params = new URLSearchParams();
    if (value) params.set("group", value);
    if (q) params.set("q", q);
    const text = params.toString();
    return text ? `/engage?${text}` : "/engage";
  };
  return (
    <div className="page">
      <PageHeader
        title="Engage"
        description="Company news, team wins, praise, polls and celebrations — in one feed."
        actions={
          <>
            <ButtonLink href="/engage/praise">Give praise</ButtonLink>
            <ButtonLink href="/engage/polls">Polls & surveys</ButtonLink>
          </>
        }
      />
      <EngageTabs active="feed" />
      <div className="split split--aside-left">
        <aside className="stack">
          <Card>
            <form className="card-body stack" action="/engage" role="search" aria-label="Search the feed">
              {group && <input type="hidden" name="group" value={group} />}
              <div className="search-field">
                <AppIcon name="search" size={16} />
                <label className="sr-only" htmlFor="feed-q">
                  Search posts
                </label>
                <input id="feed-q" name="q" type="search" className="input" defaultValue={q} placeholder="Search posts" maxLength={100} />
              </div>
            </form>
            <nav className="chip-row card-body" aria-label="Filter by group">
              <Link href={href(undefined)} className="chip" aria-current={!group ? "page" : undefined}>
                All activity
              </Link>
              {feed.groups.map((name) => (
                <Link key={name} href={href(name)} className="chip" aria-current={group === name ? "page" : undefined}>
                  {name}
                </Link>
              ))}
            </nav>
          </Card>
        </aside>
        <div className="stack feed">
          {canPost && (
            <Card>
              <PostComposer me={me} groups={feed.groups} />
            </Card>
          )}
          {items.length ? (
            items.map((item) => (item.type === "poll" ? <PollCard key={item.poll.id} poll={item.poll} /> : <PostCard key={item.post.id} post={item.post} />))
          ) : (
            <Card>
              <EmptyState icon="megaphone" title={q || group ? "No posts match" : "Nothing here yet"} description={q || group ? "Try another group or search." : "Be the first to share an update."} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
