import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { addComment, castVote, closePoll, createPoll, createPost, deletePost, givePraise, listFeed, listPolls, praiseWall, toggleReaction } from "@/lib/mocks/handlers/engage";
import { feedSchema, pollsPageSchema, praiseWallSchema, type PollInput, type Post, type PraiseBadge, type PraiseInput, type ReactionKind } from "@/types/engage";

export const getFeed = cache(async (group: string | undefined, q: string | undefined) =>
  callApi({
    schema: feedSchema,
    live: { path: "/engage/feed", query: { group, q } },
    mock: async () => listFeed(await mockActor(), { group, q }),
  }),
);

export async function publishPost(input: { group: Post["group"]; body: string }, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: "/engage/posts", body: input, idempotencyKey },
    mock: async () => createPost(await mockActor(), input, idempotencyKey),
  });
}

export async function react(postId: string, kind: ReactionKind) {
  return callApi({
    schema: z.object({ active: z.boolean(), count: z.number() }),
    live: { method: "POST", path: `/engage/posts/${encodeURIComponent(postId)}/reactions`, body: { kind } },
    mock: async () => toggleReaction(await mockActor(), postId, kind),
  });
}

export async function comment(postId: string, body: string, idempotencyKey: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/engage/posts/${encodeURIComponent(postId)}/comments`, body: { body }, idempotencyKey },
    mock: async () => addComment(await mockActor(), postId, body, idempotencyKey),
  });
}

export async function removePost(postId: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/engage/posts/${encodeURIComponent(postId)}/archive`, body: {} },
    mock: async () => deletePost(await mockActor(), postId),
  });
}

/* Polls -------------------------------------------------------------------- */

export const getPolls = cache(async () =>
  callApi({
    schema: pollsPageSchema,
    live: { path: "/engage/polls" },
    mock: async () => listPolls(await mockActor()),
  }),
);

export async function publishPoll(input: PollInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: "/engage/polls", body: input, idempotencyKey },
    mock: async () => createPoll(await mockActor(), input, idempotencyKey),
  });
}

export async function vote(pollId: string, optionIds: string[]) {
  return callApi({
    schema: z.object({ changed: z.boolean() }),
    live: { method: "POST", path: `/engage/polls/${encodeURIComponent(pollId)}/ballot`, body: { optionIds } },
    mock: async () => castVote(await mockActor(), pollId, optionIds),
  });
}

export async function endPoll(pollId: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/engage/polls/${encodeURIComponent(pollId)}/close`, body: {} },
    mock: async () => closePoll(await mockActor(), pollId),
  });
}

/* Praise ------------------------------------------------------------------- */

export const getPraiseWall = cache(async (badge: PraiseBadge | undefined, scope: "received" | "given" | undefined, month: string | undefined) =>
  callApi({
    schema: praiseWallSchema,
    live: { path: "/engage/praise", query: { badge, scope, month } },
    mock: async () => praiseWall(await mockActor(), { ...(badge ? { badge } : {}), ...(scope ? { scope } : {}), ...(month ? { month } : {}) }),
  }),
);

export async function sendPraise(input: PraiseInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string() }),
    live: { method: "POST", path: "/engage/praise", body: input, idempotencyKey },
    mock: async () => givePraise(await mockActor(), input, idempotencyKey),
  });
}
