import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, nextId, nowInstant } from "@/lib/mocks/store";
import type { MockPost } from "@/lib/mocks/seed/extended";
import type { MockPoll, MockPraise } from "@/lib/mocks/seed/engage-plus";
import { departmentNames } from "@/lib/mocks/handlers/config";
import { notify } from "@/lib/mocks/handlers/notifications";
import { can, idempotent, me, refById, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { addDays, diffDays, monthOf, todayInZone, zonedInstant } from "@/lib/utils/date";
import { praiseBadges } from "@/types/engage-labels";
import type { PersonRef } from "@/types/common";
import type { Feed, Poll, PollInput, PollsPage, Post, PraiseBadge, PraiseInput, PraiseWall, ReactionKind } from "@/types/engage";

const GROUPS: Post["group"][] = ["General", "Events", "Wins", "People & Culture", "IT"];
const KINDS: ReactionKind[] = ["like", "celebrate", "support", "insightful"];
const BADGES: PraiseBadge[] = ["team_player", "client_hero", "innovator", "above_beyond", "mentor"];
const ZONE = "Asia/Kolkata";

const dateOf = (instant: string) => todayInZone(ZONE, new Date(instant));

type Reactable = Pick<MockPost, "reactions" | "comments"> & { authorId: string | null };

function interactions(item: Reactable, actorId: string) {
  return {
    reactions: KINDS.map((kind) => ({ kind, count: item.reactions[kind].length, mine: item.reactions[kind].includes(actorId) })),
    comments: item.comments.flatMap((comment) => {
      const author = refById(comment.authorId);
      return author ? [{ id: comment.id, author, body: comment.body, createdAt: comment.createdAt }] : [];
    }),
    canDelete: item.authorId === actorId,
  };
}

function toPost(post: MockPost, actorId: string): Post {
  return {
    id: post.id,
    kind: post.kind,
    group: post.group,
    author: refById(post.authorId),
    subject: refById(post.subjectId),
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    ...interactions(post, actorId),
  };
}

function praiseRecipients(praise: MockPraise): PersonRef[] {
  return praise.recipientIds.flatMap((id) => {
    const person = refById(id);
    return person ? [person] : [];
  });
}

function praiseTitle(praise: MockPraise) {
  const names = praiseRecipients(praise).map((person) => person.name.split(" ")[0]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "a colleague");
  return `${praiseBadges[praise.badge]} · for ${list}`;
}

function praiseToPost(praise: MockPraise, actorId: string): Post {
  return {
    id: praise.id,
    kind: "praise",
    group: "Wins",
    author: refById(praise.giverId),
    subject: refById(praise.recipientIds[0] ?? null),
    title: praiseTitle(praise),
    body: praise.message,
    createdAt: praise.createdAt,
    ...interactions({ ...praise, authorId: praise.giverId }, actorId),
  };
}

/* Polls -------------------------------------------------------------------- */

function pollClosed(poll: MockPoll) {
  return poll.closedAt !== null || Date.now() >= new Date(poll.closesAt).getTime();
}

function pollVisible(poll: MockPoll, actor: MockActor, department: string) {
  return poll.department === null || poll.department === department || poll.authorId === actor.employeeId || can(actor, "survey.manage");
}

export function toPoll(poll: MockPoll, actor: MockActor): Poll {
  const closed = pollClosed(poll);
  const ballots = Object.entries(poll.votes);
  const mine = poll.votes[actor.employeeId]?.optionIds ?? [];
  const resultsVisible = mine.length > 0 || closed || poll.authorId === actor.employeeId || can(actor, "survey.manage");
  const author = refById(poll.authorId);
  if (!author) throw problem(404, "NOT_FOUND", "Poll author is no longer listed.");
  return {
    id: poll.id,
    question: poll.question,
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    department: poll.department,
    author,
    createdAt: poll.createdAt,
    closesAt: poll.closedAt ?? poll.closesAt,
    state: closed ? "closed" : "open",
    closedEarly: poll.closedAt !== null && poll.closedAt < poll.closesAt,
    voterCount: ballots.length,
    hasVoted: mine.length > 0,
    resultsVisible,
    canClose: !closed && (poll.authorId === actor.employeeId || can(actor, "survey.manage")),
    options: poll.options.map((option) => {
      const votes = ballots.filter(([, ballot]) => ballot.optionIds.includes(option.id)).length;
      return {
        id: option.id,
        label: option.label,
        votes: resultsVisible ? votes : null,
        percent: resultsVisible ? (ballots.length ? Math.round((votes / ballots.length) * 100) : 0) : null,
        mine: mine.includes(option.id),
      };
    }),
    recentVoters:
      resultsVisible && !poll.anonymous
        ? ballots
            .sort((a, b) => b[1].at.localeCompare(a[1].at))
            .slice(0, 6)
            .flatMap(([id]) => {
              const person = refById(id);
              return person ? [person] : [];
            })
        : [],
  };
}

function visiblePolls(actor: MockActor): Poll[] {
  const department = me(actor).department;
  return db()
    .engagePolls.filter((poll) => pollVisible(poll, actor, department))
    .map((poll) => toPoll(poll, actor))
    .sort((a, b) => (a.state === b.state ? b.createdAt.localeCompare(a.createdAt) : a.state === "open" ? -1 : 1));
}

export function listPolls(actor: MockActor): PollsPage {
  requireCapability(actor, "directory.read");
  return { polls: visiblePolls(actor), departments: departmentNames(), myDepartment: me(actor).department };
}

function findPoll(id: string) {
  const poll = db().engagePolls.find((item) => item.id === id);
  if (!poll) throw problem(404, "NOT_FOUND", "That poll was removed.");
  return poll;
}

export function createPoll(actor: MockActor, input: PollInput, key: string | undefined) {
  requireCapability(actor, "engage.post");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    const days = diffDays(store.today, input.closesOn);
    if (days < 0) throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { closesOn: "Pick today or a later date." } });
    if (days > 30) throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { closesOn: "Polls can run for at most 30 days." } });
    if (input.department !== null) {
      if (!departmentNames().includes(input.department)) throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { department: "Choose a department from the list." } });
      if (input.department !== employee.department && !can(actor, "survey.manage"))
        throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { department: "You can target everyone or your own department." } });
    }
    const id = nextId("pl");
    store.engagePolls.unshift({
      id,
      question: input.question,
      options: input.options.map((label, index) => ({ id: `${id}_o${index + 1}`, label })),
      multiple: input.multiple,
      anonymous: input.anonymous,
      department: input.department,
      authorId: actor.employeeId,
      createdAt: nowInstant(),
      closesAt: zonedInstant(input.closesOn, "23:59"),
      closedAt: null,
      votes: {},
    });
    return { id };
  });
}

/** One ballot per person; a new ballot replaces the old one while the poll is open. */
export function castVote(actor: MockActor, pollId: string, optionIds: string[]) {
  requireCapability(actor, "engage.post");
  const poll = findPoll(pollId);
  if (!pollVisible(poll, actor, me(actor).department)) throw problem(403, "FORBIDDEN", "This poll is for another department.");
  if (pollClosed(poll)) throw problem(409, "POLL_CLOSED", "Voting has closed on this poll.");
  const chosen = [...new Set(optionIds)];
  if (chosen.some((id) => !poll.options.some((option) => option.id === id))) throw problem(422, "VALIDATION_FAILED", "That option is no longer on the poll.");
  if (!poll.multiple && chosen.length !== 1) throw problem(422, "VALIDATION_FAILED", "Choose one option.", { fieldErrors: { optionIds: "Choose one option." } });
  const changed = Boolean(poll.votes[actor.employeeId]);
  poll.votes[actor.employeeId] = { optionIds: chosen, at: nowInstant() };
  return { changed };
}

export function closePoll(actor: MockActor, pollId: string) {
  requireCapability(actor, "directory.read");
  const poll = findPoll(pollId);
  if (poll.authorId !== actor.employeeId && !can(actor, "survey.manage")) throw problem(403, "FORBIDDEN", "Only the poll creator or HR can close it.");
  if (pollClosed(poll)) throw problem(409, "POLL_CLOSED", "This poll is already closed.");
  poll.closedAt = nowInstant();
  return { ok: true };
}

/* Feed --------------------------------------------------------------------- */

export function listFeed(actor: MockActor, filter: { group?: string; q?: string }): Feed {
  requireCapability(actor, "directory.read");
  const q = filter.q?.toLowerCase();
  const store = db();
  const posts = store.posts
    .filter((post) => !filter.group || post.group === filter.group)
    .filter((post) => !q || post.body.toLowerCase().includes(q) || (post.title ?? "").toLowerCase().includes(q))
    .map((post) => toPost(post, actor.employeeId));
  const praise = store.engagePraise
    .filter(() => !filter.group || filter.group === "Wins")
    .map((item) => praiseToPost(item, actor.employeeId))
    .filter((post) => !q || post.body.toLowerCase().includes(q) || (post.title ?? "").toLowerCase().includes(q));
  const polls = filter.group && filter.group !== "General" ? [] : visiblePolls(actor).filter((poll) => poll.state === "open" && (!q || poll.question.toLowerCase().includes(q)));
  return {
    groups: GROUPS,
    posts: [...posts, ...praise].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    polls,
  };
}

/** Posts and praise share reactions and comments. */
function findReactable(id: string): { item: Reactable; remove: () => void } {
  const store = db();
  const post = store.posts.find((item) => item.id === id);
  if (post) return { item: post, remove: () => store.posts.splice(store.posts.indexOf(post), 1) };
  const praise = store.engagePraise.find((item) => item.id === id);
  if (praise)
    return {
      item: { reactions: praise.reactions, comments: praise.comments, authorId: praise.giverId },
      remove: () => store.engagePraise.splice(store.engagePraise.indexOf(praise), 1),
    };
  throw problem(404, "NOT_FOUND", "That post was removed.");
}

export function createPost(actor: MockActor, input: { group: Post["group"]; body: string }, key: string | undefined) {
  requireCapability(actor, "engage.post");
  return idempotent(key, () => {
    const store = db();
    store.counter += 1;
    store.posts.unshift({
      id: `po_${store.counter}`,
      kind: "post",
      group: input.group,
      authorId: actor.employeeId,
      subjectId: null,
      title: null,
      body: input.body,
      createdAt: nowInstant(),
      reactions: { like: [], celebrate: [], support: [], insightful: [] },
      comments: [],
    });
    return { id: `po_${store.counter}` };
  });
}

/** Toggle: one reaction of each kind per person. */
export function toggleReaction(actor: MockActor, postId: string, kind: ReactionKind) {
  requireCapability(actor, "directory.read");
  const { item } = findReactable(postId);
  const list = item.reactions[kind];
  const index = list.indexOf(actor.employeeId);
  if (index === -1) list.push(actor.employeeId);
  else list.splice(index, 1);
  return { active: index === -1, count: list.length };
}

export function addComment(actor: MockActor, postId: string, body: string, key: string | undefined) {
  requireCapability(actor, "engage.post");
  return idempotent(key, () => {
    const { item } = findReactable(postId);
    const store = db();
    store.counter += 1;
    item.comments.push({ id: `pc_${store.counter}`, authorId: actor.employeeId, body, createdAt: nowInstant() });
    return { ok: true };
  });
}

export function deletePost(actor: MockActor, postId: string) {
  const { item, remove } = findReactable(postId);
  if (item.authorId !== actor.employeeId) throw problem(403, "FORBIDDEN", "Only the author can remove this post.");
  remove();
  return { ok: true };
}

/* Praise ------------------------------------------------------------------- */

export function givePraise(actor: MockActor, input: PraiseInput, key: string | undefined) {
  requireCapability(actor, "engage.post");
  return idempotent(key, () => {
    const store = db();
    const recipients = [...new Set(input.recipientIds)];
    if (recipients.includes(actor.employeeId)) throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { recipientIds: "You can’t praise yourself — pick a colleague." } });
    for (const id of recipients) {
      const person = store.employees.find((employee) => employee.id === id);
      if (!person || person.status === "exited") throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors: { recipientIds: "One of the colleagues is no longer listed." } });
    }
    const id = nextId("pr");
    const record: MockPraise = {
      id,
      giverId: actor.employeeId,
      recipientIds: recipients,
      badge: input.badge,
      value: input.value,
      message: input.message,
      createdAt: nowInstant(),
      reactions: { like: [], celebrate: [], support: [], insightful: [] },
      comments: [],
    };
    store.engagePraise.unshift(record);
    const giver = me(actor).name;
    for (const recipient of recipients) notify(recipient, "system", `${giver} praised you`, `${praiseBadges[input.badge]}: “${input.message.slice(0, 80)}${input.message.length > 80 ? "…" : ""}”`, "/engage/praise");
    return { id };
  });
}

export function praiseWall(actor: MockActor, filter: { badge?: PraiseBadge; scope?: "received" | "given"; month?: string }): PraiseWall {
  requireCapability(actor, "directory.read");
  const store = db();
  const month = filter.month ?? monthOf(store.today);
  const all = [...store.engagePraise].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inMonth = all.filter((item) => monthOf(dateOf(item.createdAt)) === month);
  const items = all
    .filter((item) => !filter.badge || item.badge === filter.badge)
    .filter((item) => (filter.scope === "received" ? item.recipientIds.includes(actor.employeeId) : filter.scope === "given" ? item.giverId === actor.employeeId : true))
    .filter((item) => !filter.month || monthOf(dateOf(item.createdAt)) === month);

  const counts = new Map<string, { count: number; badges: Set<PraiseBadge> }>();
  for (const item of inMonth)
    for (const id of item.recipientIds) {
      const entry = counts.get(id) ?? { count: 0, badges: new Set<PraiseBadge>() };
      entry.count += 1;
      entry.badges.add(item.badge);
      counts.set(id, entry);
    }
  const leaderboard = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .flatMap(([id, entry]) => {
      const person = refById(id);
      return person ? [{ person, count: entry.count, badges: BADGES.filter((badge) => entry.badges.has(badge)) }] : [];
    });

  const byBadge = BADGES.map((badge) => {
    const list = inMonth.filter((item) => item.badge === badge);
    const tally = new Map<string, number>();
    for (const item of list) for (const id of item.recipientIds) tally.set(id, (tally.get(id) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { badge, count: list.length, leader: top ? refById(top[0]) : null, leaderCount: top?.[1] ?? 0 };
  });

  return {
    items: items.map((item) => {
      const giver = refById(item.giverId);
      if (!giver) throw problem(404, "NOT_FOUND", "Praise author is no longer listed.");
      return { id: item.id, giver, recipients: praiseRecipients(item), badge: item.badge, value: item.value, message: item.message, createdAt: item.createdAt, post: praiseToPost(item, actor.employeeId) };
    }),
    month,
    months: [...new Set([monthOf(store.today), monthOf(addDays(`${monthOf(store.today)}-01`, -1)), ...all.map((item) => monthOf(dateOf(item.createdAt)))])].sort().reverse().slice(0, 6),
    leaderboard,
    byBadge,
    totals: {
      month: inMonth.length,
      receivedByMe: all.filter((item) => item.recipientIds.includes(actor.employeeId)).length,
      givenByMe: all.filter((item) => item.giverId === actor.employeeId).length,
    },
    colleagues: store.employees
      .filter((employee) => employee.status !== "exited" && employee.id !== actor.employeeId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((employee) => ({ id: employee.id, name: employee.name, department: employee.department })),
  };
}
